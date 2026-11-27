/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Mapeamento ESTADO DO MOTOR <-> LINHAS DO BANCO (puro, sem rede).
 * Por quê separado: dá para testar com milhares de operações aleatórias que
 * "gravar e recarregar" devolve EXATAMENTE o mesmo estado (ver tests/roundtrip).
 */
import type {
  ClienteMotor, ConfigMotor, ContratoMotor, EstadoMotor, LancamentoMotor, LinhasBanco, Pacote, ParcelaMotor,
} from './types';

type Linha = Record<string, any>;
const nulo = <T,>(v: T | undefined | null): T | null => (v === undefined ? null : v);
const bigNum = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));

/* ---------------- config ---------------- */
export function configParaLinha(s: EstadoMotor): Linha {
  const c = s.config;
  return {
    taxa_mensal_bp: c.taxaPadraoBp.MENSAL, taxa_quinzenal_bp: c.taxaPadraoBp.QUINZENAL, taxa_semanal_bp: c.taxaPadraoBp.SEMANAL,
    taxa_parcelado_bp: c.taxaParceladoBp, multa_bp: c.multaBp, mora_dia_bp: c.moraDiaBp,
    multa_tipo: c.multaTipo ?? 'PCT', multa_fixa_cents: c.multaFixaCents ?? 0,
    mora_tipo: c.moraTipo ?? 'PCT', mora_fixa_cents: c.moraFixaCents ?? 0,
    base_encargo: c.baseEncargo, carencia_fds: !!c.carenciaFds, teto_padrao_cents: c.tetoPadraoCents,
    chave_pix: c.chavePix ?? '', data_simulada: c.dataSimulada ?? null, modo_discreto: !!c.modoDiscreto,
    seq_cliente: s.seq.cliente, seq_contrato: s.seq.contrato, seq_ledger: s.seq.ledger,
  };
}

function linhaParaConfig(r: Linha): ConfigMotor {
  return {
    taxaPadraoBp: { MENSAL: bigNum(r.taxa_mensal_bp), QUINZENAL: bigNum(r.taxa_quinzenal_bp), SEMANAL: bigNum(r.taxa_semanal_bp) },
    taxaParceladoBp: bigNum(r.taxa_parcelado_bp), multaBp: bigNum(r.multa_bp), moraDiaBp: bigNum(r.mora_dia_bp),
    multaTipo: r.multa_tipo, multaFixaCents: bigNum(r.multa_fixa_cents),
    moraTipo: r.mora_tipo, moraFixaCents: bigNum(r.mora_fixa_cents),
    baseEncargo: r.base_encargo, carenciaFds: !!r.carencia_fds, tetoPadraoCents: bigNum(r.teto_padrao_cents),
    chavePix: r.chave_pix ?? '', dataSimulada: r.data_simulada ?? null, modoDiscreto: !!r.modo_discreto,
  };
}

/* ---------------- clientes ---------------- */
export function clienteParaLinha(c: ClienteMotor): Linha {
  return {
    id: c.id, nome: c.nome, telefone: c.telefone ?? '', cpf: c.cpf ?? '', email: c.email ?? '',
    tags: c.tags ?? [], teto_cents: c.tetoCents ?? 0, score_dec: c.scoreDec, obs: c.obs ?? '', criado_em: c.criadoEm ?? '',
  };
}
function linhaParaCliente(r: Linha): ClienteMotor {
  return {
    id: r.id, nome: r.nome, telefone: r.telefone, cpf: r.cpf, email: r.email, tags: r.tags ?? [],
    tetoCents: bigNum(r.teto_cents), scoreDec: Number(r.score_dec), obs: r.obs, criadoEm: r.criado_em,
  };
}

/* ---------------- contratos + parcelas ---------------- */
export function contratoParaLinha(c: ContratoMotor): Linha {
  const g = c.regras || ({} as ContratoMotor['regras']);
  return {
    id: c.id, cliente_id: c.clienteId, tipo: c.tipo,
    ciclo: nulo(c.ciclo), ciclo_dias: nulo(c.cicloDias), n: nulo(c.n), periodicidade: nulo(c.periodicidade),
    principal_original: c.principalOriginal, principal_aberto: c.principalAberto, principal_perdido: c.principalPerdido ?? 0,
    taxa_bp: c.taxaBp,
    multa_bp: g.multaBp ?? 0, mora_dia_bp: g.moraDiaBp ?? 0, base_encargo: g.baseEncargo ?? 'MONTANTE',
    carencia_fds: g.carenciaFds !== false,
    multa_tipo: g.multaTipo ?? 'PCT', multa_fixa_cents: g.multaFixaCents ?? 0,
    mora_tipo: g.moraTipo ?? 'PCT', mora_fixa_cents: g.moraFixaCents ?? 0,
    data_inicio: c.dataInicio, vencimento: nulo(c.vencimento),
    juros_pendente: c.jurosPendente ?? 0, renovacoes: c.renovacoes ?? 0, renovacoes_seguidas: c.renovacoesSeguidas ?? 0,
    status: c.status, promessa: nulo(c.promessa), acordo: nulo(c.acordo), pausas: c.pausas ?? [], obs: c.obs ?? '',
  };
}
export function parcelasParaLinhas(c: ContratoMotor): Linha[] {
  return (c.parcelas || []).map((p: ParcelaMotor) => ({
    contrato_id: c.id, n: p.n, venc: p.venc, valor: p.valor, principal: p.principal, juros: p.juros,
    abat_enc: p.abatEnc ?? 0, abat_juros: p.abatJuros ?? 0, abat_principal: p.abatPrincipal ?? 0,
    dias_penalizados: p.diasPenalizados ?? 0,
  }));
}
function linhaParaContrato(r: Linha, parcelas: Linha[] | undefined): ContratoMotor {
  const c: any = {
    id: r.id, tipo: r.tipo, clienteId: r.cliente_id,
    principalOriginal: bigNum(r.principal_original), principalAberto: bigNum(r.principal_aberto), taxaBp: bigNum(r.taxa_bp),
    regras: {
      multaBp: bigNum(r.multa_bp), moraDiaBp: bigNum(r.mora_dia_bp), baseEncargo: r.base_encargo, carenciaFds: !!r.carencia_fds,
      multaTipo: r.multa_tipo, multaFixaCents: bigNum(r.multa_fixa_cents), moraTipo: r.mora_tipo, moraFixaCents: bigNum(r.mora_fixa_cents),
    },
    dataInicio: r.data_inicio, vencimento: nulo(r.vencimento),
    jurosPendente: bigNum(r.juros_pendente), renovacoes: Number(r.renovacoes), renovacoesSeguidas: Number(r.renovacoes_seguidas),
    status: r.status, promessa: nulo(r.promessa), acordo: nulo(r.acordo), pausas: r.pausas ?? [], parcelas: null, obs: r.obs ?? '',
  };
  if (r.tipo === 'GIRO') { c.ciclo = r.ciclo; c.cicloDias = Number(r.ciclo_dias); }
  else {
    c.n = Number(r.n); c.periodicidade = r.periodicidade;
    c.parcelas = (parcelas || []).slice().sort((a, b) => a.n - b.n).map((p) => ({
      n: Number(p.n), venc: p.venc, valor: bigNum(p.valor), principal: bigNum(p.principal), juros: bigNum(p.juros),
      abatEnc: bigNum(p.abat_enc), abatJuros: bigNum(p.abat_juros), abatPrincipal: bigNum(p.abat_principal),
      diasPenalizados: Number(p.dias_penalizados),
    }));
  }
  if (bigNum(r.principal_perdido) > 0) c.principalPerdido = bigNum(r.principal_perdido);
  return c;
}

/* ---------------- ledger ---------------- */
export function lancamentoParaLinha(e: LancamentoMotor): Linha {
  const x: any = e;
  return {
    id: e.id, ts: e.ts, tipo: e.tipo, contrato_id: nulo(x.contratoId), cliente_id: nulo(x.clienteId), data: e.data,
    d_disp: e.deltas.disp, d_rua: e.deltas.rua, d_lucro: e.deltas.lucro, d_perdas: e.deltas.perdas,
    obs: e.obs ?? '', origem: nulo(x.origem), recebido: nulo(x.recebido), desconto: nulo(x.desconto), cenario: nulo(x.cenario),
    comp: nulo(x.comp), capitalizado: nulo(x.capitalizado), parcelas: nulo(x.parcelas), dias_atraso: nulo(x.diasAtraso),
    escolha_d: nulo(x.escolhaD), escolha_data: nulo(x.escolhaData), snapshot: nulo(x.snapshot), recibo: nulo(x.recibo),
    estornada_por: e.estornadaPor ?? null, estorno_de: nulo(x.estornoDe), arquivados: nulo(x.arquivados),
  };
}
function linhaParaLancamento(r: Linha): LancamentoMotor {
  const e: any = {
    id: r.id, ts: r.ts, estornadaPor: r.estornada_por ?? null, tipo: r.tipo, data: r.data,
    deltas: { disp: bigNum(r.d_disp), rua: bigNum(r.d_rua), lucro: bigNum(r.d_lucro), perdas: bigNum(r.d_perdas) },
    obs: r.obs ?? '',
  };
  const opc: [string, string][] = [
    ['contratoId', 'contrato_id'], ['clienteId', 'cliente_id'], ['origem', 'origem'], ['recebido', 'recebido'], ['desconto', 'desconto'],
    ['cenario', 'cenario'], ['comp', 'comp'], ['capitalizado', 'capitalizado'], ['parcelas', 'parcelas'], ['diasAtraso', 'dias_atraso'],
    ['escolhaD', 'escolha_d'], ['escolhaData', 'escolha_data'], ['snapshot', 'snapshot'], ['recibo', 'recibo'],
    ['estornoDe', 'estorno_de'], ['arquivados', 'arquivados'],
  ];
  // O motor grava `escolhaD` e `snapshot` como null explícito nas baixas (snapshot vira null ao ser podado): preserva isso.
  if (r.tipo === 'BAIXA') { e.escolhaD = null; e.escolhaData = null; e.snapshot = null; }
  for (const [k, col] of opc) if (r[col] !== null && r[col] !== undefined) e[k] = r[col];
  for (const k of ['recebido', 'desconto', 'capitalizado', 'diasAtraso', 'arquivados']) if (typeof e[k] === 'string') e[k] = Number(e[k]);
  return e;
}

/* ---------------- estado <-> linhas ---------------- */
export function estadoParaLinhas(s: EstadoMotor): { config: Linha; clientes: Linha[]; contratos: Linha[]; parcelas: Linha[]; ledger: Linha[] } {
  const contratos = Object.values(s.contratos);
  return {
    config: configParaLinha(s),
    clientes: Object.values(s.clientes).map(clienteParaLinha),
    contratos: contratos.map(contratoParaLinha),
    parcelas: contratos.flatMap(parcelasParaLinhas),
    ledger: s.ledger.map(lancamentoParaLinha),
  };
}

/** Ordem do motor: lançamentos novos vão ao FIM (por id); os ARQUIVO são "unshift" (do mais novo ao mais antigo no INÍCIO). */
function ordenarLedger(a: LancamentoMotor[]): LancamentoMotor[] {
  const n = (id: string) => Number(id.slice(1));
  const arq = a.filter((e) => e.tipo === 'ARQUIVO').sort((x, y) => n(y.id) - n(x.id));
  const resto = a.filter((e) => e.tipo !== 'ARQUIVO').sort((x, y) => n(x.id) - n(y.id));
  return arq.concat(resto);
}

export function linhasParaEstado(l: LinhasBanco): EstadoMotor {
  const porContrato: Record<string, Linha[]> = {};
  for (const p of l.parcelas) (porContrato[p.contrato_id] = porContrato[p.contrato_id] || []).push(p);
  const clientes: Record<string, ClienteMotor> = {};
  for (const r of l.clientes) clientes[r.id] = linhaParaCliente(r);
  const contratos: Record<string, ContratoMotor> = {};
  for (const r of l.contratos) contratos[r.id] = linhaParaContrato(r, porContrato[r.id]);
  const ledger = ordenarLedger(l.ledger.map(linhaParaLancamento));
  const caixa = { disp: 0, rua: 0, lucro: 0, perdas: 0 };
  for (const e of ledger) { caixa.disp += e.deltas.disp; caixa.rua += e.deltas.rua; caixa.lucro += e.deltas.lucro; caixa.perdas += e.deltas.perdas; }
  return {
    versao: Number(l.config.engine_versao ?? 4),
    config: linhaParaConfig(l.config),
    clientes, contratos, ledger, caixa,
    seq: { cliente: bigNum(l.config.seq_cliente), contrato: bigNum(l.config.seq_contrato), ledger: bigNum(l.config.seq_ledger) },
  };
}

/* ---------------- diferença (o que gravar) ---------------- */
const json = (o: unknown) => JSON.stringify(o);

/** Compara dois estados e monta o pacote mínimo para aplicar_mudancas. */
export function calcularPacote(base: EstadoMotor, novo: EstadoMotor, arquivo?: { ate: string; conteudo: unknown }): Pacote {
  const a = estadoParaLinhas(base);
  const b = estadoParaLinhas(novo);
  const pacote: Pacote = {};

  if (json(a.config) !== json(b.config)) pacote.config = b.config;

  const difPorId = (antes: Linha[], depois: Linha[], chave = 'id') => {
    const mapaA = new Map(antes.map((r) => [r[chave], json(r)]));
    const mudou: Linha[] = [];
    const idsDepois = new Set<string>();
    for (const r of depois) {
      idsDepois.add(r[chave]);
      if (mapaA.get(r[chave]) !== json(r)) mudou.push(r);
    }
    const removidos = antes.map((r) => r[chave] as string).filter((id) => !idsDepois.has(id));
    return { mudou, removidos };
  };

  const cli = difPorId(a.clientes, b.clientes);
  if (cli.mudou.length) pacote.clientes = cli.mudou;
  if (cli.removidos.length) pacote.del_clientes = cli.removidos;

  // contrato muda se a linha dele OU alguma parcela dele mudou
  const parcelasA = new Map<string, string>(); const parcelasB = new Map<string, string>();
  for (const p of a.parcelas) parcelasA.set(p.contrato_id, (parcelasA.get(p.contrato_id) || '') + json(p));
  for (const p of b.parcelas) parcelasB.set(p.contrato_id, (parcelasB.get(p.contrato_id) || '') + json(p));
  const ctr = difPorId(a.contratos, b.contratos);
  const idsMudados = new Set(ctr.mudou.map((r) => r.id as string));
  for (const r of b.contratos) if ((parcelasA.get(r.id) || '') !== (parcelasB.get(r.id) || '')) idsMudados.add(r.id);
  if (idsMudados.size) {
    pacote.contratos = b.contratos.filter((r) => idsMudados.has(r.id));
    pacote.parcelas = b.parcelas.filter((p) => idsMudados.has(p.contrato_id));
  }
  if (ctr.removidos.length) pacote.del_contratos = ctr.removidos;

  const led = difPorId(a.ledger, b.ledger);
  if (led.mudou.length) pacote.ledger = led.mudou;
  if (led.removidos.length) pacote.del_ledger = led.removidos;

  if (arquivo) pacote.arquivo = arquivo;
  return pacote;
}

export function pacoteVazio(p: Pacote): boolean {
  return Object.keys(p).length === 0;
}
