/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Persistência no Supabase: carregar tudo, e gravar mudanças com fila + trava otimista.
 *
 * Fluxo de cada operação (mesmo do protótipo, agora na nuvem):
 *   motor (memória) -> confere integridade -> TELA atualiza na hora (otimista)
 *   -> fila grava só o que mudou via RPC aplicar_mudancas (atômico).
 * Se a gravação falhar (rede, conflito, sessão), o app trava a escrita e pede para recarregar:
 * o banco continua consistente porque a RPC é "tudo ou nada".
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import Engine from './engine';
import { calcularPacote, linhasParaEstado, pacoteVazio } from './mapeamento';
import type { EstadoMotor, LinhasBanco } from './types';

const PAGINA = 1000; // limite padrão do PostgREST

async function lerTudo(sb: SupabaseClient, tabela: string, ordem: string[]): Promise<Record<string, any>[]> {
  const out: Record<string, any>[] = [];
  for (let de = 0; ; de += PAGINA) {
    let q = sb.from(tabela).select('*');
    for (const o of ordem) q = q.order(o, { ascending: true });
    const { data, error } = await q.range(de, de + PAGINA - 1);
    if (error) throw new Error(`Falha ao ler ${tabela}: ${error.message}`);
    out.push(...(data || []));
    if (!data || data.length < PAGINA) break;
  }
  return out;
}

async function lerConfig(sb: SupabaseClient, userId: string): Promise<Record<string, any>> {
  const lida = await sb.from('configuracoes').select('*').eq('user_id', userId).maybeSingle();
  if (lida.error) throw new Error('Falha ao ler configurações: ' + lida.error.message);
  let data = lida.data;
  if (!data) { // gatilho do SQL falhou ou usuário antigo: cria a linha (RLS permite só a própria)
    const ins = await sb.from('configuracoes').insert({ user_id: userId }).select('*').single();
    if (ins.error) throw new Error('Falha ao criar configurações: ' + ins.error.message);
    data = ins.data;
  }
  return data;
}

export interface Carga { estado: EstadoMotor; versao: number; integridade: { ok: boolean; erros: string[] } }

/** Lê tudo do usuário. Repete se outro aparelho gravar no meio da leitura (versão mudou). */
export async function carregarEstado(sb: SupabaseClient, userId: string): Promise<Carga> {
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    const antes = await lerConfig(sb, userId);
    const [clientes, contratos, parcelas, ledger] = await Promise.all([
      lerTudo(sb, 'clientes', ['id']),
      lerTudo(sb, 'contratos', ['id']),
      lerTudo(sb, 'parcelas', ['contrato_id', 'n']),
      lerTudo(sb, 'ledger', ['seq']),
    ]);
    const depois = await lerConfig(sb, userId);
    if (Number(antes.versao_dados) !== Number(depois.versao_dados)) continue;
    const linhas: LinhasBanco = { config: depois, clientes, contratos, parcelas, ledger };
    const estado = linhasParaEstado(linhas);
    let integridade: Carga['integridade'];
    try { integridade = Engine.verificarIntegridade(estado); } catch (e) { integridade = { ok: false, erros: ['Verificador falhou: ' + (e as Error).message] }; }
    return { estado, versao: Number(depois.versao_dados), integridade };
  }
  throw new Error('Os dados mudaram várias vezes durante a leitura. Tente de novo.');
}

export type TipoFalha = 'CONFLITO' | 'DESATUALIZADO' | 'REDE' | 'SESSAO' | 'OUTRO';
export interface Falha { tipo: TipoFalha; mensagem: string }

function classificarFalha(e: unknown): Falha {
  const m = String((e as { message?: string })?.message || e);
  if (m.includes('CONFLITO_VERSAO')) return { tipo: 'CONFLITO', mensagem: 'Seus dados foram alterados em outro aparelho ou aba.' };
  if (m.includes('NAO_AUTENTICADO') || /JWT|not authenticated/i.test(m)) return { tipo: 'SESSAO', mensagem: 'Sua sessão expirou. Entre de novo.' };
  if (/fetch|network|Failed|Load failed|timeout/i.test(m)) return { tipo: 'REDE', mensagem: 'Sem conexão: a última alteração pode não ter sido salva.' };
  return { tipo: 'OUTRO', mensagem: 'Não foi possível salvar: ' + m };
}

export interface Handlers { onFalha: (f: Falha) => void; onPendentes?: (n: number) => void }

/** Fila de gravação: uma chamada por vez, na ordem, cada uma enviando só a diferença. */
export class Sincronizador {
  private base: EstadoMotor;
  private versao: number;
  private fila: Promise<void> = Promise.resolve();
  private geracao = 0;
  private pendentes = 0;
  private morto = false;

  constructor(private sb: SupabaseClient, base: EstadoMotor, versao: number, private h: Handlers) {
    this.base = base; this.versao = versao;
  }

  get estaOcupado() { return this.pendentes > 0; }

  enfileirar(novo: EstadoMotor, arquivo?: { ate: string; conteudo: unknown }) {
    if (this.morto) return;
    const g = this.geracao;
    this.pendentes++; this.h.onPendentes?.(this.pendentes);
    this.fila = this.fila.then(async () => {
      if (g !== this.geracao || this.morto) return;
      try {
        const pacote = calcularPacote(this.base, novo, arquivo);
        if (!pacoteVazio(pacote)) {
          const { data, error } = await this.sb.rpc('aplicar_mudancas', { p_versao_esperada: this.versao, p_pacote: pacote });
          if (error) throw error;
          this.versao = Number(data);
        }
        this.base = novo;
      } catch (e) {
        this.geracao++;          // descarta o que ainda estava na fila: partiria de um estado não gravado
        this.morto = true;
        this.h.onFalha(classificarFalha(e));
      } finally {
        this.pendentes--; this.h.onPendentes?.(this.pendentes);
      }
    });
  }

  /** Aguarda a fila esvaziar (usado antes de sair/recarregar). */
  esperar() { return this.fila; }

  /** Pergunta ao servidor se outro aparelho gravou. Só vale com a fila vazia. */
  async verificarAtualizacao(userId: string) {
    if (this.morto || this.pendentes > 0) return;
    try {
      const { data, error } = await this.sb.from('configuracoes').select('versao_dados').eq('user_id', userId).maybeSingle();
      if (error || !data) return;
      if (this.pendentes === 0 && Number(data.versao_dados) !== this.versao) {
        this.morto = true;
        this.h.onFalha({ tipo: 'DESATUALIZADO', mensagem: 'Há dados mais novos gravados em outro aparelho.' });
      }
    } catch { /* sem rede agora: tenta na próxima */ }
  }
}
