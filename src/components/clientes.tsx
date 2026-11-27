// @ts-nocheck — porte fiel do protótipo aprovado (lógica de tela intacta).
'use client';
/* eslint-disable */
import React, { useState, useEffect, useRef, useMemo, useCallback, useContext, createContext } from 'react';
import { createPortal } from 'react-dom';
import Engine from '@/lib/engine';
import { BottomSheet, Btn, Card, CurrencyInput, EncargoFields, Icon, Money, PercentInput, Pill, ResumoEncargos, Segmented, TextInput, cx, encargosDe, useApp, useToast, vibrar } from './ui';
import { ScreenHeader } from './screens';

/* ============================================================================
 * 40-clientes.jsx — Cadastro de cliente, busca, criação de contrato,
 * menu rápido (+) do Início e aba Clientes em ordem alfabética.
 * Só usa a API pública do motor (criarCliente / criarContratoGiro / Parcelado).
 * ========================================================================== */

/* ---------- utilidades de texto ---------- */
export const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const soDigitos = (s) => String(s || '').replace(/\D/g, '');

export function maskCPF(v) {
  const d = soDigitos(v).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return d.slice(0, 3) + '.' + d.slice(3);
  if (d.length <= 9) return d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6);
  return d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-' + d.slice(9);
}
export function maskTel(v) {
  const d = soDigitos(v).slice(0, 11);
  if (!d) return '';
  if (d.length < 3) return '(' + d;
  const dd = d.slice(0, 2), r = d.slice(2);
  if (r.length <= 4) return '(' + dd + ') ' + r;
  if (d.length <= 10) return '(' + dd + ') ' + r.slice(0, 4) + '-' + r.slice(4);
  return '(' + dd + ') ' + r.slice(0, 5) + '-' + r.slice(5);
}
/** Telefone para comparar: só dígitos, sem o 55 do Brasil na frente. */
export function normTel(v) {
  let d = soDigitos(v);
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  return d;
}
export function validaCPF(v) {
  const d = soDigitos(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (let t = 9; t < 11; t++) {
    let soma = 0;
    for (let i = 0; i < t; i++) soma += Number(d[i]) * (t + 1 - i);
    if (((soma * 10) % 11) % 10 !== Number(d[t])) return false;
  }
  return true;
}
export const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

/** Clientes que já usam o mesmo CPF e/ou WhatsApp. */
export function acharDuplicados(state, cpf, tel) {
  const c = soDigitos(cpf), t = normTel(tel);
  const out = [];
  Object.values(state.clientes).forEach((cli) => {
    const motivos = [];
    if (c.length === 11 && soDigitos(cli.cpf) === c) motivos.push('CPF');
    if (t.length >= 10 && normTel(cli.telefone) === t) motivos.push('WhatsApp');
    if (motivos.length) out.push({ cliente: cli, motivos });
  });
  return out;
}

export function ClienteSub({ c }) {
  const partes = [c.telefone ? maskTel(c.telefone) : null, c.cpf ? maskCPF(c.cpf) : null].filter(Boolean);
  return <>{partes.length ? partes.join(' · ') : 'Sem telefone'}</>;
}

/* ---------- cadastro de cliente ---------- */
export function ClienteFormSheet({ modo, onClose, onSaved }) {
  const { state, run } = useApp();
  const toast = useToast();
  const [nome, setNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [tel, setTel] = useState('');
  const [email, setEmail] = useState('');
  const [erros, setErros] = useState({});
  const [dups, setDups] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const mudou = (set) => (v) => { set(v); setDups(null); };

  const gravar = () => {
    if (salvando) return;
    setSalvando(true);
    const r = run((s) => Engine.criarCliente(s, { nome: nome.trim(), cpf: soDigitos(cpf), telefone: soDigitos(tel), email }));
    if (!r.ok) { setSalvando(false); return; }
    vibrar(15);
    onSaved(r.res.cliente.id, false);
  };

  const enviar = () => {
    const e = {};
    if (!nome.trim()) e.nome = 'Informe o nome do cliente.';
    if (cpf && !validaCPF(cpf)) e.cpf = 'CPF inválido. Confira os 11 números.';
    if (tel && normTel(tel).length < 10) e.tel = 'Telefone incompleto. Use DDD + número.';
    if (email && !emailOk(email.trim())) e.email = 'E-mail inválido.';
    setErros(e);
    if (Object.keys(e).length) { vibrar(60); return; }
    const d = acharDuplicados(state, cpf, tel);
    if (d.length && !dups) { setDups(d); vibrar(40); return; }
    gravar();
  };

  const rotulo = modo === 'contrato' ? 'Salvar e criar contrato' : 'Salvar cliente';
  return (
    <BottomSheet open onClose={onClose} title="Novo cliente"
      footer={dups ? null : <Btn onClick={enviar} disabled={salvando}>{rotulo}</Btn>}>
      <TextInput label="Nome" value={nome} onChange={mudou(setNome)} placeholder="Nome completo" autoComplete="off" autoFocus error={erros.nome} maxLength={80} />
      <TextInput label="WhatsApp (opcional)" value={maskTel(tel)} onChange={(v) => mudou(setTel)(soDigitos(v))} placeholder="(11) 91234-5678" inputMode="tel" error={erros.tel} />
      <TextInput label="CPF (opcional)" value={maskCPF(cpf)} onChange={(v) => mudou(setCpf)(soDigitos(v))} placeholder="000.000.000-00" inputMode="numeric" error={erros.cpf} />
      <TextInput label="E-mail (opcional)" value={email} onChange={mudou(setEmail)} placeholder="nome@email.com" type="email" inputMode="email" autoComplete="off" error={erros.email} maxLength={120} />
      {dups && (
        <div className="rounded-2xl border border-[#FF9F0A]/40 bg-[#FF9F0A]/10 p-4 space-y-3" role="alert" data-testid="aviso-duplicado">
          <p className="text-[15px] font-semibold text-[#FF9F0A]">Já existe cadastro com esses dados</p>
          {dups.map((d) => (
            <div key={d.cliente.id} className="rounded-xl bg-[#2C2C2E] p-3">
              <p className="text-[16px] font-semibold">{d.cliente.nome}</p>
              <p className="text-[13px] text-[#8E8E93]">Mesmo {d.motivos.join(' e ')} · <ClienteSub c={d.cliente} /></p>
              <div className="mt-2">
                <Btn size="md" variant="primary" onClick={() => onSaved(d.cliente.id, true)}>Usar {d.cliente.nome.split(' ')[0]}</Btn>
              </div>
            </div>
          ))}
          <Btn size="md" variant="secondary" onClick={gravar} disabled={salvando}>Cadastrar mesmo assim</Btn>
          <Btn size="md" variant="ghost" onClick={() => setDups(null)}>Corrigir os dados</Btn>
        </div>
      )}
    </BottomSheet>
  );
}

/* ---------- busca instantânea de cliente salvo ---------- */
export function filtrarClientes(state, consulta) {
  const q = semAcento(consulta).trim();
  const qd = soDigitos(consulta);
  const lista = Object.values(state.clientes).sort((a, b) => semAcento(a.nome).localeCompare(semAcento(b.nome)));
  if (!q) return lista;
  return lista.filter((c) =>
    semAcento(c.nome).includes(q) ||
    semAcento(c.email).includes(q) ||
    (qd.length >= 2 && (soDigitos(c.cpf).includes(qd) || normTel(c.telefone).includes(qd) || soDigitos(c.telefone).includes(qd)))
  );
}

export function BuscaClienteSheet({ onClose, onPick, onNovo }) {
  const { state } = useApp();
  const [q, setQ] = useState('');
  const lista = useMemo(() => filtrarClientes(state, q), [state, q]);
  const vazioBase = Object.keys(state.clientes).length === 0;
  return (
    <BottomSheet open onClose={onClose} title="Escolher cliente">
      <TextInput label="Buscar" value={q} onChange={setQ} placeholder="Nome, CPF, telefone ou e-mail" autoFocus autoComplete="off" />
      {vazioBase ? (
        <div className="text-center py-6 space-y-3" data-testid="busca-sem-clientes">
          <p className="text-[15px] text-[#8E8E93]">Nenhum cliente salvo ainda.</p>
          <Btn onClick={onNovo}>Cadastrar novo cliente</Btn>
        </div>
      ) : lista.length === 0 ? (
        <p className="text-center text-[15px] text-[#8E8E93] py-6" data-testid="busca-vazia">Nenhum cliente encontrado.</p>
      ) : (
        <div className="rounded-2xl bg-[#2C2C2E] overflow-hidden" data-testid="busca-lista">
          {lista.map((c, i) => (
            <button key={c.id} type="button" onClick={() => onPick(c.id)} data-testid="busca-item"
              className={cx('w-full text-left flex items-center gap-3 px-4 py-3 min-h-[60px] active:bg-white/5 transition', i < lista.length - 1 && 'border-b border-white/10')}>
              <span className="h-10 w-10 shrink-0 rounded-full bg-[#1C1C1E] flex items-center justify-center text-[16px] font-semibold text-[#0A84FF]">{c.nome.slice(0, 1).toUpperCase()}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-[17px] font-semibold truncate">{c.nome}</span>
                <span className="block text-[13px] text-[#8E8E93] truncate"><ClienteSub c={c} />{c.email ? ' · ' + c.email : ''}</span>
              </span>
              <span className="text-[#8E8E93]"><Icon name="chevron" size={18} /></span>
            </button>
          ))}
        </div>
      )}
    </BottomSheet>
  );
}

/* ---------- criação de contrato ---------- */
export const PERIODOS = [
  { value: 'DIARIA', label: 'Diária' }, { value: 'SEMANAL', label: 'Semanal' },
  { value: 'QUINZENAL', label: 'Quinzenal' }, { value: 'MENSAL', label: 'Mensal' },
];
export const CICLOS_UI = [{ value: 'MENSAL', label: 'Mensal' }, { value: 'QUINZENAL', label: 'Quinzenal' }, { value: 'SEMANAL', label: 'Semanal' }];
export const dataCurta = (iso) => Engine.fmtDataBR(iso).slice(0, 5);

export function ContratoSheet({ clienteId, onClose }) {
  const { state, hoje, run } = useApp();
  const toast = useToast();
  const cli = state.clientes[clienteId];
  const cfg = state.config;
  const cx4 = Engine.resumoCaixa(state);

  const [tipo, setTipo] = useState('GIRO');
  const [principal, setPrincipal] = useState(0);
  const [ciclo, setCiclo] = useState('MENSAL');
  const [taxaGiro, setTaxaGiro] = useState(cfg.taxaPadraoBp.MENSAL);
  const [taxaParc, setTaxaParc] = useState(cfg.taxaPadraoBp.MENSAL);
  const [n, setN] = useState(4);
  const [per, setPer] = useState('SEMANAL');
  const [data, setData] = useState(hoje);
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enc, setEnc] = useState(encargosDe(cfg));
  const [encAberto, setEncAberto] = useState(false);

  const escolherCiclo = (c) => { setCiclo(c); setTaxaGiro(cfg.taxaPadraoBp[c]); };
  const taxaBp = tipo === 'GIRO' ? taxaGiro : taxaParc;
  const dataOk = /^\d{4}-\d{2}-\d{2}$/.test(data);

  const sim = useMemo(() => {
    if (principal < 100 || !dataOk) return null;
    try {
      return tipo === 'GIRO'
        ? { giro: Engine.simularGiro(principal, taxaGiro, ciclo, data) }
        : { parc: Engine.simularParcelado(principal, taxaParc, n, per, data) };
    } catch (e) {
      return { erro: e instanceof Engine.EngineError ? e.message : 'Dados inválidos.' };
    }
  }, [tipo, principal, taxaGiro, taxaParc, ciclo, n, per, data, dataOk]);

  const teto = cli.tetoCents || cfg.tetoPadraoCents || 0;
  const exposicao = Engine.exposicaoCliente(state, cli.id);
  const excedeTeto = teto > 0 && principal > 0 && exposicao + principal > teto;
  const falta = principal > cx4.disponivel ? principal - cx4.disponivel : 0;

  const enviar = () => {
    if (enviando) return;
    setErro('');
    if (principal < 100) { setErro('O valor mínimo é R$ 1,00.'); vibrar(60); return; }
    if (!dataOk) { setErro('Informe a data do empréstimo.'); vibrar(60); return; }
    if (falta > 0) { setErro('Capital Disponível insuficiente: faltam ' + Engine.fmtBRL(falta) + '. Faça uma + Entrada na aba Caixa.'); vibrar(60); return; }
    if (sim && sim.erro) { setErro(sim.erro); vibrar(60); return; }
    setEnviando(true);
    const base = { clienteId: cli.id, principal, taxaBp, dataInicio: data, obs: obs.trim(), regras: Object.assign({}, enc) };
    const r = run((s) => (tipo === 'GIRO'
      ? Engine.criarContratoGiro(s, Object.assign({ ciclo }, base))
      : Engine.criarContratoParcelado(s, Object.assign({ n, periodicidade: per }, base))));
    if (!r.ok) { setEnviando(false); return; }
    vibrar(15);
    toast('Contrato ' + r.res.contrato.id + ' criado para ' + cli.nome + '.', 'ok');
    onClose();
  };

  const parc = sim && sim.parc;
  const giro = sim && sim.giro;
  return (
    <BottomSheet open onClose={onClose} title="Novo contrato"
      footer={<Btn onClick={enviar} disabled={enviando}>Criar contrato</Btn>}>
      <div className="rounded-2xl bg-[#2C2C2E] px-4 py-3 flex items-center gap-3" data-testid="contrato-cliente">
        <span className="h-10 w-10 shrink-0 rounded-full bg-[#1C1C1E] flex items-center justify-center text-[16px] font-semibold text-[#0A84FF]">{cli.nome.slice(0, 1).toUpperCase()}</span>
        <div className="min-w-0">
          <p className="text-[17px] font-semibold truncate">{cli.nome}</p>
          <p className="text-[13px] text-[#8E8E93]">Exposição atual: <Money cents={exposicao} /></p>
        </div>
      </div>

      <Segmented value={tipo} onChange={setTipo} options={[{ value: 'GIRO', label: 'Giro / Renovável' }, { value: 'PARCELADO', label: 'Parcelado' }]} />

      <CurrencyInput label="Valor emprestado (principal)" cents={principal} onChange={(v) => { setPrincipal(v); setErro(''); }} autoFocus
        hint={<span>Capital Disponível: <Money cents={cx4.disponivel} /></span>} />

      {tipo === 'GIRO' ? (
        <>
          <div>
            <p className="text-[13px] font-medium text-[#8E8E93] mb-1.5 px-1">Ciclo</p>
            <Segmented value={ciclo} onChange={escolherCiclo} options={CICLOS_UI} />
          </div>
          <PercentInput label="Juros por ciclo" bp={taxaGiro} onChange={setTaxaGiro} />
        </>
      ) : (
        <>
          <div>
            <p className="text-[13px] font-medium text-[#8E8E93] mb-1.5 px-1">Periodicidade das parcelas</p>
            <Segmented value={per} onChange={setPer} options={PERIODOS} />
          </div>
          <div>
            <p className="text-[13px] font-medium text-[#8E8E93] mb-1.5 px-1">Número de parcelas</p>
            <div className="flex items-center gap-3">
              <button type="button" aria-label="Menos uma parcela" onClick={() => setN(Math.max(1, n - 1))} className="h-14 w-14 rounded-2xl bg-[#2C2C2E] text-[24px] font-semibold active:scale-95 transition">−</button>
              <div className="flex-1 h-14 rounded-2xl bg-[#2C2C2E] flex items-center justify-center text-[22px] font-bold tabular-nums" data-testid="n-parcelas">{n}x</div>
              <button type="button" aria-label="Mais uma parcela" onClick={() => setN(Math.min(120, n + 1))} className="h-14 w-14 rounded-2xl bg-[#2C2C2E] text-[24px] font-semibold active:scale-95 transition">+</button>
            </div>
            <div className="flex gap-2 mt-2">
              {[3, 4, 10, 20, 30].map((v) => (
                <button key={v} type="button" onClick={() => setN(v)} className={cx('flex-1 h-9 rounded-full text-[14px] font-semibold active:scale-95 transition', n === v ? 'bg-[#0A84FF] text-white' : 'bg-[#2C2C2E] text-[#8E8E93]')}>{v}x</button>
              ))}
            </div>
          </div>
          <PercentInput label="Juros total do contrato" bp={taxaParc} onChange={setTaxaParc} />
        </>
      )}

      <label className="block">
        <span className="block text-[13px] font-medium text-[#8E8E93] mb-1.5 px-1">Data do empréstimo</span>
        <input type="date" value={data} onChange={(e) => setData(e.target.value)} aria-label="Data do empréstimo"
          className="w-full h-14 rounded-2xl bg-[#2C2C2E] px-4 text-white outline-none border border-transparent focus:ring-2 focus:ring-[#0A84FF] [color-scheme:dark]" />
      </label>

      {giro && (
        <div className="rounded-2xl bg-[#2C2C2E] p-4 space-y-1.5" data-testid="previa-giro">
          <div className="flex justify-between text-[15px]"><span className="text-[#8E8E93]">Juros do ciclo</span><Money cents={giro.juros} className="font-semibold" /></div>
          <div className="flex justify-between text-[15px]"><span className="text-[#8E8E93]">Total no vencimento</span><Money cents={giro.totalNoVencimento} className="font-bold" /></div>
          <div className="flex justify-between text-[15px]"><span className="text-[#8E8E93]">1º vencimento</span><span className="font-semibold tabular-nums">{Engine.fmtDataBR(giro.vencimento)}</span></div>
        </div>
      )}
      {parc && (
        <div className="rounded-2xl bg-[#2C2C2E] p-4 space-y-1.5" data-testid="previa-parcelado">
          <div className="flex justify-between text-[15px]"><span className="text-[#8E8E93]">{n}x de</span><Money cents={parc.parcelas[0].valor} className="font-bold" /></div>
          <div className="flex justify-between text-[15px]"><span className="text-[#8E8E93]">Juros total</span><Money cents={parc.jurosTotal} className="font-semibold" /></div>
          <div className="flex justify-between text-[15px]"><span className="text-[#8E8E93]">Total a receber</span><Money cents={parc.total} className="font-bold" /></div>
          <div className="flex justify-between text-[15px]"><span className="text-[#8E8E93]">Vencimentos</span><span className="font-semibold tabular-nums">{dataCurta(parc.parcelas[0].venc)} → {Engine.fmtDataBR(parc.parcelas[parc.parcelas.length - 1].venc)}</span></div>
          <div className="max-h-40 overflow-y-auto mt-2 border-t border-white/10 pt-2">
            {parc.parcelas.map((p) => (
              <div key={p.n} className="flex justify-between text-[13px] py-0.5 text-[#8E8E93]">
                <span>{p.n}ª · {dataCurta(p.venc)}</span><Money cents={p.valor} />
              </div>
            ))}
          </div>
        </div>
      )}
      {sim && sim.erro && <p className="text-[14px] text-[#FF453A] px-1" role="alert">{sim.erro}</p>}
      {excedeTeto && (
        <div className="rounded-2xl border border-[#FF9F0A]/40 bg-[#FF9F0A]/10 p-3 text-[14px] text-[#FF9F0A]" role="alert" data-testid="alerta-teto">
          Atenção: a exposição de {cli.nome.split(' ')[0]} passa a <Money cents={exposicao + principal} /> e ultrapassa o teto de <Money cents={teto} />. É só um alerta, você pode continuar.
        </div>
      )}
      {falta > 0 && <p className="text-[14px] text-[#FF9F0A] px-1" role="alert">Capital Disponível insuficiente: faltam <Money cents={falta} />. Faça uma + Entrada na aba Caixa.</p>}
      <div className="rounded-2xl bg-[#2C2C2E] px-4 py-3" data-testid="regras-atraso">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] text-[#8E8E93]">Regras de atraso deste contrato</p>
            <p className="text-[15px] font-semibold leading-snug"><ResumoEncargos r={enc} /></p>
          </div>
          <button type="button" onClick={() => setEncAberto(!encAberto)} aria-expanded={encAberto} className="shrink-0 h-9 px-3 rounded-full bg-[#1C1C1E] text-[14px] font-semibold text-[#0A84FF] active:scale-95 transition">{encAberto ? 'Fechar' : 'Alterar'}</button>
        </div>
        {encAberto && <div className="mt-3"><EncargoFields v={enc} onChange={setEnc} /></div>}
      </div>
      <TextInput label="Observação (opcional)" value={obs} onChange={setObs} maxLength={80} placeholder="Ex.: garantia, combinado" />
      {erro && <p className="text-[14px] text-[#FF453A] px-1" role="alert" data-testid="erro-contrato">{erro}</p>}
    </BottomSheet>
  );
}

/* ---------- menu rápido (+) e fluxo encadeado ---------- */
export function FluxoNovo({ onClose }) {
  const [passo, setPasso] = useState({ t: 'menu' });

  if (passo.t === 'cliente') {
    return <ClienteFormSheet modo="contrato" onClose={onClose} onSaved={(id) => setPasso({ t: 'contrato', id })} />;
  }
  if (passo.t === 'busca') {
    return <BuscaClienteSheet onClose={onClose} onPick={(id) => setPasso({ t: 'contrato', id })} onNovo={() => setPasso({ t: 'cliente' })} />;
  }
  if (passo.t === 'contrato') {
    return <ContratoSheet key={passo.id} clienteId={passo.id} onClose={onClose} />;
  }
  return (
    <BottomSheet open onClose={onClose} title="O que deseja fazer?">
      <div className="space-y-3">
        <button type="button" onClick={() => setPasso({ t: 'cliente' })}
          className="w-full text-left rounded-2xl bg-[#2C2C2E] px-4 py-4 flex items-center gap-3 min-h-[64px] active:scale-95 transition">
          <span className="h-11 w-11 rounded-full bg-[#0A84FF] text-white flex items-center justify-center"><Icon name="users" size={22} /></span>
          <span className="flex-1"><span className="block text-[17px] font-semibold">+ Novo Cliente &amp; Contrato</span><span className="block text-[13px] text-[#8E8E93]">Cadastra o cliente e já abre o contrato</span></span>
        </button>
        <button type="button" onClick={() => setPasso({ t: 'busca' })}
          className="w-full text-left rounded-2xl bg-[#2C2C2E] px-4 py-4 flex items-center gap-3 min-h-[64px] active:scale-95 transition">
          <span className="h-11 w-11 rounded-full bg-[#30D158] text-black flex items-center justify-center"><Icon name="dollar" size={22} /></span>
          <span className="flex-1"><span className="block text-[17px] font-semibold">+ Novo Contrato (Cliente Salvo)</span><span className="block text-[13px] text-[#8E8E93]">Busca por nome, CPF, telefone ou e-mail</span></span>
        </button>
      </div>
    </BottomSheet>
  );
}

/* ---------- aba Clientes: ordem alfabética estilo Contatos do iOS ---------- */
export function letraInicial(nome) {
  const l = semAcento(nome).trim().charAt(0).toUpperCase();
  return l >= 'A' && l <= 'Z' ? l : '#';
}

export function ClientesScreen() {
  const { state, readOnly, ir } = useApp();
  const [novo, setNovo] = useState(false);
  const toast = useToast();
  const grupos = useMemo(() => {
    const lista = Object.values(state.clientes).sort((a, b) => semAcento(a.nome).localeCompare(semAcento(b.nome), 'pt-BR'));
    const m = new Map();
    lista.forEach((c) => { const l = letraInicial(c.nome); if (!m.has(l)) m.set(l, []); m.get(l).push(c); });
    const letras = Array.from(m.keys()).sort((a, b) => (a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b)));
    return { letras, m, total: lista.length };
  }, [state.clientes]);

  return (
    <div>
      <ScreenHeader eyebrow={grupos.total + (grupos.total === 1 ? ' cliente' : ' clientes')} title="Clientes" />
      <div className="px-4 mt-2">
        <Btn onClick={() => setNovo(true)} disabled={readOnly}><Icon name="plus" size={20} /> Cadastrar Novo Cliente</Btn>
      </div>
      <div className="px-4 mt-2">
        {grupos.total === 0 ? (
          <Card className="mt-3">
            <div className="flex flex-col items-center text-center py-10 px-6 gap-2" data-testid="clientes-vazio">
              <span className="text-[#8E8E93]"><Icon name="users" size={36} /></span>
              <p className="text-[17px] font-semibold">Nenhum cliente ainda</p>
              <p className="text-[14px] text-[#8E8E93]">Toque em “Cadastrar Novo Cliente” para começar.</p>
            </div>
          </Card>
        ) : grupos.letras.map((l) => (
          <section key={l} data-testid="grupo-letra" aria-label={'Clientes com ' + l}>
            <h2 className="sticky top-0 z-10 bg-black/90 backdrop-blur-xl px-2 pt-4 pb-1 text-[14px] font-bold text-[#8E8E93]" data-testid="letra">{l}</h2>
            <Card className="overflow-hidden">
              {grupos.m.get(l).map((c, i, arr) => (
                <button type="button" key={c.id} onClick={() => ir({ t: 'cliente', id: c.id })} className={cx('w-full text-left flex items-center gap-3 px-4 py-3 active:bg-white/5 transition', i < arr.length - 1 && 'border-b border-white/10')} data-testid="cliente-item">
                  <div className="h-11 w-11 shrink-0 rounded-full bg-[#2C2C2E] flex items-center justify-center text-[17px] font-semibold text-[#0A84FF]">{c.nome.slice(0, 1).toUpperCase()}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[17px] font-semibold truncate">{c.nome}</p>
                    <p className="text-[13px] text-[#8E8E93] truncate">Exposição: <Money cents={Engine.exposicaoCliente(state, c.id)} /></p>
                  </div>
                  <Pill tone={c.scoreDec >= 40 ? 'green' : c.scoreDec >= 25 ? 'orange' : 'red'}>★ {Engine.estrelas(c.scoreDec)}</Pill>
                  <span className="text-[#8E8E93]"><Icon name="chevron" size={16} /></span>
                </button>
              ))}
            </Card>
          </section>
        ))}
      </div>
      {novo && (
        <ClienteFormSheet modo="solo" onClose={() => setNovo(false)}
          onSaved={(id, existente) => { setNovo(false); toast(existente ? 'Cliente já estava cadastrado.' : 'Cliente cadastrado.', existente ? 'info' : 'ok'); }} />
      )}
    </div>
  );
}
