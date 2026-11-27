// @ts-nocheck — porte fiel do protótipo aprovado (lógica de tela intacta).
'use client';
/* eslint-disable */
import React, { useState, useEffect, useRef, useMemo, useCallback, useContext, createContext } from 'react';
import { createPortal } from 'react-dom';
import Engine from '@/lib/engine';
import { BottomSheet, Btn, Card, CurrencyInput, Icon, Money, Pill, ResumoEncargos, SectionTitle, Segmented, Switch, TextInput, cx, useApp, useToast, vibrar } from './ui';
import { ContratoSheet, acharDuplicados, dataCurta, emailOk, maskCPF, maskTel, normTel, soDigitos, validaCPF } from './clientes';

/* ============================================================================
 * 50-operacao.jsx — Etapa 3: Ficha do Cliente, Detalhe do Contrato,
 * Modal "Registrar Pagamento" (cenários A–D), Recibo, Estorno, Promessa,
 * Acordo, Perda. Tudo chama a API pública do motor; nenhuma conta é refeita aqui.
 * ========================================================================== */

export const STATUS_TOM_FULL = { EM_DIA: 'green', VENCE_HOJE: 'orange', ATRASADO: 'red', PROMESSA: 'blue', ACORDO: 'blue', QUITADO: 'gray', PERDA: 'red', CANCELADO: 'gray' };
export const TAGS_PRESET = [
  { n: 'Bom pagador', tom: 'green' }, { n: 'Indicação', tom: 'blue' }, { n: 'Novo', tom: 'gray' },
  { n: 'Atenção', tom: 'orange' }, { n: 'Atrasa sempre', tom: 'orange' }, { n: 'Risco', tom: 'red' },
];
export const tomTag = (n) => (TAGS_PRESET.find((t) => t.n === n) || { tom: 'gray' }).tom;
export const PESO_STATUS = { ATRASADO: 0, VENCE_HOJE: 1, PROMESSA: 2, ACORDO: 3, EM_DIA: 4 };
export const numId = (id) => Number(String(id).slice(1)) || 0;

/** Mensagens do motor trazem valores: no Modo Discreto, mascara também aqui. */
export function mascararMsg(m, discreto) {
  const t = String(m).replace(/\b[Aa]porte\b/g, '+ Entrada').replace(/\b[Ss]angria\b/g, '- Saída');
  return discreto ? t.replace(/-?R\$ [\d.]+,\d{2}/g, 'R$ •••••') : t;
}
export function msgErro(e) { return e instanceof Engine.EngineError ? e.message : 'Valores inválidos.'; }

export function Estrelas({ scoreDec }) {
  const cheias = Math.round(scoreDec / 10);
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={'Score ' + Engine.estrelas(scoreDec) + ' de 5'}>
      {[1, 2, 3, 4, 5].map((i) => <span key={i} className={i <= cheias ? 'text-[#FFD60A]' : 'text-[#3A3A3C]'}>★</span>)}
      <span className="ml-1.5 text-[#8E8E93] font-semibold tabular-nums">{Engine.estrelas(scoreDec)}</span>
    </span>
  );
}

export function BackBar({ titulo, onBack, right }) {
  return (
    <header className="px-3 pt-[calc(env(safe-area-inset-top)+10px)] pb-1 flex items-center justify-between">
      <button type="button" onClick={onBack} aria-label="Voltar" data-testid="voltar"
        className="h-11 pl-1 pr-3 rounded-full text-[#0A84FF] flex items-center gap-0.5 text-[17px] active:opacity-60 transition">
        <span className="rotate-180 inline-flex"><Icon name="chevron" size={24} /></span>{titulo}
      </button>
      {right}
    </header>
  );
}

export function DateField({ label, value, onChange, min }) {
  return (
    <label className="block">
      <span className="block text-[13px] font-medium text-[#8E8E93] mb-1.5 px-1">{label}</span>
      <input type="date" value={value} min={min} onChange={(e) => onChange(e.target.value)} aria-label={label}
        className="w-full h-14 rounded-2xl bg-[#2C2C2E] px-4 text-white outline-none border border-transparent focus:ring-2 focus:ring-[#0A84FF] [color-scheme:dark]" />
    </label>
  );
}

export function Linha({ label, children, forte, tom }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 min-h-[44px] border-b border-white/10 last:border-b-0">
      <span className="text-[15px] text-[#8E8E93]">{label}</span>
      <span className={cx('text-[16px] tabular-nums text-right', forte ? 'font-bold' : 'font-semibold', tom)}>{children}</span>
    </div>
  );
}

export async function copiarTexto(texto) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(texto); return true; }
  } catch (e) { /* tenta o plano B */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = texto; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return !!ok;
  } catch (e) { return false; }
}

/* ---------- confirmação genérica (estorno, perda, cancelamento) ---------- */
export function ConfirmSheet({ titulo, children, botao, variante, onConfirm, onClose, comObs }) {
  const [obs, setObs] = useState('');
  const [enviando, setEnviando] = useState(false);
  return (
    <BottomSheet open onClose={onClose} title={titulo}
      footer={<>
        <Btn variant={variante || 'primary'} disabled={enviando} onClick={() => { if (enviando) return; setEnviando(true); const ok = onConfirm(obs.trim()); if (!ok) setEnviando(false); }}>{botao}</Btn>
        <Btn variant="ghost" size="md" onClick={onClose}>Voltar</Btn>
      </>}>
      <div className="text-[15px] text-[#8E8E93] leading-snug space-y-2">{children}</div>
      {comObs && <TextInput label="Observação (opcional)" value={obs} onChange={setObs} maxLength={80} placeholder="Ex.: sumiu, mudou de cidade" />}
    </BottomSheet>
  );
}

/* ---------- Recibo Digital ---------- */
export function ReciboSheet({ lancId, onClose }) {
  const { state } = useApp();
  const toast = useToast();
  const e = state.ledger.find((x) => x.id === lancId);
  if (!e) return null;
  const cli = state.clientes[e.clienteId];
  let texto = '';
  try { texto = Engine.gerarRecibo(state, lancId); } catch (err) { texto = 'Recibo indisponível.'; }
  const href = cli && cli.telefone ? Engine.linkWhatsApp(cli.telefone, texto) : 'https://wa.me/?text=' + encodeURIComponent(texto);
  const discreto = state.config.modoDiscreto;
  const exibido = discreto ? texto.replace(/R\$ [\d.]+,\d{2}/g, 'R$ •••••') : texto;
  return (
    <BottomSheet open onClose={onClose} title="Recibo digital"
      footer={<>
        <a href={href} target="_blank" rel="noopener noreferrer" data-testid="recibo-whatsapp"
          className="w-full h-14 rounded-2xl bg-[#30D158] text-black text-[17px] font-semibold flex items-center justify-center gap-2 active:scale-95 transition"><Icon name="chat" size={20} /> Enviar no WhatsApp</a>
        <Btn variant="secondary" size="md" onClick={async () => { const ok = await copiarTexto(texto); toast(ok ? 'Recibo copiado.' : 'Não consegui copiar. Use o WhatsApp.', ok ? 'ok' : 'erro'); }}>Copiar recibo</Btn>
      </>}>
      <pre className="whitespace-pre-wrap break-words rounded-2xl bg-[#2C2C2E] p-4 text-[14px] leading-snug font-sans" data-testid="recibo-texto">{exibido}</pre>
      {discreto && <p className="text-[12px] text-[#8E8E93]">Modo Discreto: valores ocultos na tela. Os botões enviam e copiam o texto completo.</p>}
    </BottomSheet>
  );
}

/* ---------- Registrar Pagamento (modal único) ---------- */
export const CEN_TOM = { A: 'green', B: 'blue', C: 'orange', D: 'red', PARCELA: 'blue' };

export function PagamentoSheet({ contratoId, parcelaInicial, onClose, onPago }) {
  const { state, hoje, run } = useApp();
  const toast = useToast();
  const discreto = state.config.modoDiscreto;
  const c = state.contratos[contratoId];
  const giro = c.tipo === 'GIRO';
  const div = Engine.dividaContrato(c, hoje);
  const pr = giro ? Engine.proRataGiro(c, hoje) : { aplicavel: false };
  const abertas = giro ? [] : div.parcelas.filter((p) => !p.quitada);

  const [rec, setRec] = useState(0);
  const [desc, setDesc] = useState(0);
  const [obs, setObs] = useState('');
  const [parcelaN, setParcelaN] = useState(giro ? null : (parcelaInicial || (abertas[0] && abertas[0].n)));
  const [escD, setEscD] = useState(null);
  const [escData, setEscData] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const alvo = giro ? null : abertas.find((p) => p.n === parcelaN);
  const totalGeral = div.total;
  const juros = giro ? div.encargos + div.juros : 0;

  const r = useMemo(() => {
    if (rec + desc <= 0) return { vazio: true };
    try {
      const dados = { hoje, recebido: rec, desconto: desc };
      if (!giro) dados.parcelaN = parcelaN;
      return { plano: Engine.previewBaixa(state, contratoId, dados) };
    } catch (e) { return { erro: msgErro(e) }; }
  }, [state, contratoId, hoje, rec, desc, parcelaN, giro]);
  const p = r.plano;

  const mantem = useMemo(() => {
    if (!giro) return null;
    let v = c.vencimento;
    do { v = Engine.addDias(v, c.cicloDias); } while (v <= hoje);
    return v;
  }, [c, hoje, giro]);
  const cicloHoje = giro ? Engine.addDias(hoje, c.cicloDias) : null;

  const pronto = !!p && (!p.requerEscolhaD || !!escD) && (!p.requerEscolhaData || !!escData);

  const confirmar = () => {
    if (!pronto || enviando) return;
    setEnviando(true);
    const dados = { hoje, recebido: rec, desconto: desc, obs: obs.trim() };
    if (!giro) dados.parcelaN = parcelaN;
    if (p.requerEscolhaD) dados.escolhaD = escD;
    if (p.requerEscolhaData) dados.escolhaData = escData;
    const res = run((s) => Engine.registrarBaixa(s, contratoId, dados));
    if (!res.ok) { setEnviando(false); return; }
    vibrar(20);
    toast('Pagamento registrado.', 'ok');
    onPago(res.res.lancamento.id);
  };

  const atalho = (rotulo, fn, id) => (
    <button type="button" onClick={fn} data-testid={id}
      className="h-9 px-3 rounded-full bg-[#2C2C2E] text-[14px] font-semibold text-[#0A84FF] active:scale-95 transition">{rotulo}</button>
  );

  const comp = p ? p.comp : null;
  const lucroPrev = comp ? comp.encCash + comp.jurCash : 0;
  return (
    <BottomSheet open onClose={onClose} title="Registrar Pagamento"
      footer={<>
        <Btn variant="green" onClick={confirmar} disabled={!pronto || enviando}>Confirmar pagamento</Btn>
        {p && !pronto && <p className="text-[13px] text-[#FF9F0A] text-center">Escolha as opções acima para continuar.</p>}
      </>}>
      <div className="rounded-2xl bg-[#2C2C2E] px-4 py-3 text-[14px] space-y-1" data-testid="pag-resumo">
        {giro ? (
          <>
            <div className="flex justify-between"><span className="text-[#8E8E93]">Encargos de atraso{div.dias > 0 ? ' (' + div.dias + 'd)' : ''}</span><Money cents={div.encargos} className="font-semibold" /></div>
            <div className="flex justify-between"><span className="text-[#8E8E93]">Juros{div.jurosPendente > 0 ? ' (inclui pendente)' : ''}</span><Money cents={div.juros} className="font-semibold" /></div>
            <div className="flex justify-between"><span className="text-[#8E8E93]">Principal</span><Money cents={div.principal} className="font-semibold" /></div>
            <div className="flex justify-between border-t border-white/10 pt-1 mt-1"><span>Só juros + encargos</span><Money cents={juros} className="font-bold" /></div>
            <div className="flex justify-between"><span>Quitação total</span><Money cents={div.total} className="font-bold" /></div>
          </>
        ) : (
          <>
            <div className="flex justify-between"><span className="text-[#8E8E93]">Total em aberto</span><Money cents={div.total} className="font-bold" /></div>
            <div className="flex justify-between"><span className="text-[#8E8E93]">Exigível agora</span><Money cents={div.exigivel} className="font-semibold" /></div>
          </>
        )}
      </div>

      {!giro && (
        <div>
          <p className="text-[13px] font-medium text-[#8E8E93] mb-1.5 px-1">Parcela a pagar</p>
          <div className="flex gap-2 overflow-x-auto pb-1" data-testid="chips-parcelas">
            {abertas.slice(0, 12).map((x) => (
              <button key={x.n} type="button" onClick={() => setParcelaN(x.n)}
                className={cx('shrink-0 rounded-2xl px-3 py-2 text-left active:scale-95 transition', parcelaN === x.n ? 'bg-[#0A84FF] text-white' : 'bg-[#2C2C2E] text-[#8E8E93]')}>
                <span className="block text-[14px] font-semibold">{x.n}ª · {dataCurta(x.venc)}</span>
                <span className="block text-[12px]">{x.dias > 0 ? x.dias + 'd atraso' : 'em dia'}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <CurrencyInput label="Valor recebido" cents={rec} onChange={(v) => { setRec(v); }} autoFocus />
      <div className="flex flex-wrap gap-2">
        {giro ? (
          <>
            {atalho('Só juros', () => setRec(Math.max(0, juros - desc)), 'atalho-juros')}
            {atalho('Quitar tudo', () => setRec(Math.max(0, totalGeral - desc)), 'atalho-quitar')}
          </>
        ) : (
          <>
            {alvo && atalho('Parcela inteira', () => setRec(Math.max(0, alvo.total - desc)), 'atalho-parcela')}
            {atalho('Quitar tudo', () => setRec(Math.max(0, totalGeral - desc)), 'atalho-quitar')}
          </>
        )}
      </div>

      <CurrencyInput label="Desconto concedido" cents={desc} onChange={setDesc} />
      {pr.aplicavel && (
        <div className="rounded-2xl border border-[#0A84FF]/30 bg-[#0A84FF]/10 p-3 space-y-2" data-testid="prorata">
          <p className="text-[14px] text-[#0A84FF] leading-snug">Pro-Rata: o contrato tem {pr.decorridos} de {pr.cicloDias} dias do ciclo. Juros proporcionais <Money cents={pr.proRata} />; sugestão de desconto <Money cents={pr.sugestaoDesconto} />.</p>
          {pr.sugestaoDesconto > 0 && atalho('Aplicar desconto Pro-Rata', () => setDesc(pr.sugestaoDesconto), 'atalho-prorata')}
        </div>
      )}
      <TextInput label="Obs / Código PIX (opcional)" value={obs} onChange={setObs} maxLength={80} placeholder="Ex.: E1234... ou 'em mãos'" />

      {r.erro && <p className="text-[14px] text-[#FF453A] px-1" role="alert" data-testid="pag-erro">{mascararMsg(r.erro, discreto)}</p>}

      {p && (
        <div className="rounded-2xl bg-[#2C2C2E] p-4 space-y-2" data-testid="previa-baixa">
          <div className="flex items-center gap-2 flex-wrap">
            <Pill tone={CEN_TOM[p.cenario]}>Cenário {p.cenario === 'PARCELA' ? 'Parcela' : p.cenario}</Pill>
            <span className="text-[15px] font-semibold" data-testid="previa-cenario">{p.cenarioLabel}</span>
          </div>
          <div className="text-[14px] space-y-1">
            <div className="flex justify-between"><span className="text-[#8E8E93]">Vai para o Lucro</span><Money cents={lucroPrev} className="font-semibold text-[#30D158]" /></div>
            <div className="flex justify-between"><span className="text-[#8E8E93]">Principal devolvido ao Caixa</span><Money cents={comp.prinCash} className="font-semibold" /></div>
            {comp.prinDesc > 0 && <div className="flex justify-between"><span className="text-[#8E8E93]">Desconto no Principal (vai p/ Perdas)</span><Money cents={comp.prinDesc} className="font-semibold text-[#FF453A]" /></div>}
            {comp.encDesc + comp.jurDesc > 0 && <div className="flex justify-between"><span className="text-[#8E8E93]">Desconto em juros/encargos</span><Money cents={comp.encDesc + comp.jurDesc} className="font-semibold" /></div>}
            {p.tipo === 'GIRO' && p.cenario !== 'A' && <div className="flex justify-between"><span className="text-[#8E8E93]">Principal restante</span><Money cents={div.principal - p.prinAbat + (p.cenario === 'D' && escD === 'SOMAR_PRINCIPAL' ? p.diff : 0)} className="font-semibold" /></div>}
            {p.cenario === 'D' && <div className="flex justify-between"><span className="text-[#8E8E93]">Diferença de juros</span><Money cents={p.diff} className="font-semibold text-[#FF9F0A]" /></div>}
            {p.tipo === 'PARCELADO' && <div className="flex justify-between"><span className="text-[#8E8E93]">Parcelas atingidas</span><span className="font-semibold">{p.itens.map((x) => x.n + 'ª' + (x.quitaApos ? ' ✓' : ' (parcial)')).join(', ')}</span></div>}
          </div>
        </div>
      )}

      {p && p.requerEscolhaD && (
        <div data-testid="escolha-d">
          <p className="text-[13px] font-medium text-[#8E8E93] mb-1.5 px-1">A diferença de juros (<Money cents={p.diff} />) deve:</p>
          <Segmented value={escD} onChange={setEscD} options={[{ value: 'SOMAR_PRINCIPAL', label: 'Somar no Principal' }, { value: 'JUROS_PENDENTE', label: 'Juros Pendente' }]} />
        </div>
      )}
      {p && p.requerEscolhaData && (
        <div data-testid="escolha-data">
          <p className="text-[13px] font-medium text-[#8E8E93] mb-1.5 px-1">Próximo vencimento</p>
          <div className="space-y-2">
            {[{ v: 'MANTER_DIA', t: 'Manter Dia Fixo', d: mantem }, { v: 'CICLO_HOJE', t: '+Ciclo a partir de Hoje', d: cicloHoje }].map((o) => (
              <button key={o.v} type="button" onClick={() => setEscData(o.v)} aria-pressed={escData === o.v}
                className={cx('w-full rounded-2xl px-4 min-h-[52px] flex items-center justify-between active:scale-95 transition', escData === o.v ? 'bg-[#0A84FF] text-white' : 'bg-[#2C2C2E] text-white')}>
                <span className="text-[16px] font-semibold">{o.t}</span>
                <span className={cx('text-[14px] tabular-nums', escData === o.v ? 'text-white' : 'text-[#8E8E93]')}>{Engine.fmtDataBR(o.d)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </BottomSheet>
  );
}

/* ---------- Promessa / Acordo ---------- */
export function PromessaSheet({ contratoId, onClose }) {
  const { state, hoje, run } = useApp();
  const toast = useToast();
  const c = state.contratos[contratoId];
  const [data, setData] = useState(c.promessa ? c.promessa.data : Engine.addDias(hoje, 1));
  const [congelar, setCongelar] = useState(true);
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState('');
  const salvar = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) { setErro('Informe a data prometida.'); return; }
    if (data < hoje) { setErro('A data prometida não pode ser no passado.'); return; }
    const r = run((s) => Engine.registrarPromessa(s, contratoId, { hoje, data, congelar, obs: obs.trim() }));
    if (r.ok) { toast('Promessa anotada.', 'ok'); onClose(); }
  };
  return (
    <BottomSheet open onClose={onClose} title="Anotar Promessa" footer={<Btn onClick={salvar}>Salvar promessa</Btn>}>
      <DateField label="Cliente prometeu pagar em" value={data} min={hoje} onChange={(v) => { setData(v); setErro(''); }} />
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#2C2C2E] px-4 py-3">
        <div className="min-w-0">
          <p className="text-[16px] font-semibold">Congelar multa e mora</p>
          <p className="text-[13px] text-[#8E8E93] leading-snug">Os encargos não crescem até a data prometida.</p>
        </div>
        <Switch checked={congelar} onChange={setCongelar} label="Congelar multa e mora até a data prometida" />
      </div>
      <TextInput label="Observação (opcional)" value={obs} onChange={setObs} maxLength={80} placeholder="Ex.: vai receber dia 5" />
      {erro && <p className="text-[14px] text-[#FF453A] px-1" role="alert">{erro}</p>}
    </BottomSheet>
  );
}

export function AcordoSheet({ contratoId, onClose }) {
  const { hoje, run } = useApp();
  const toast = useToast();
  const [obs, setObs] = useState('');
  const salvar = () => {
    const r = run((s) => Engine.registrarAcordo(s, contratoId, { hoje, obs: obs.trim() }));
    if (r.ok) { toast('Contrato congelado em acordo.', 'ok'); onClose(); }
  };
  return (
    <BottomSheet open onClose={onClose} title="Congelar Acordo" footer={<Btn variant="orange" onClick={salvar}>Congelar contrato</Btn>}>
      <p className="text-[15px] text-[#8E8E93] leading-snug">Enquanto o acordo durar, multa e mora ficam congeladas e o contrato aparece como “Acordo / Congelado”. Ele sai da lista de cobrança do Início. Você encerra o acordo quando quiser.</p>
      <TextInput label="Observação (opcional)" value={obs} onChange={setObs} maxLength={80} placeholder="Ex.: pagará R$ 200 por mês" autoFocus />
    </BottomSheet>
  );
}

/* ---------- Editar cadastro do cliente ---------- */
export function EditarClienteSheet({ clienteId, onClose }) {
  const { state, run } = useApp();
  const toast = useToast();
  const cli = state.clientes[clienteId];
  const [nome, setNome] = useState(cli.nome);
  const [tel, setTel] = useState(cli.telefone || '');
  const [cpf, setCpf] = useState(cli.cpf || '');
  const [email, setEmail] = useState(cli.email || '');
  const [tags, setTags] = useState(cli.tags || []);
  const [teto, setTeto] = useState(cli.tetoCents || 0);
  const [obs, setObs] = useState(cli.obs || '');
  const [erros, setErros] = useState({});
  const [dups, setDups] = useState(null);

  const mudou = (set) => (v) => { set(v); setDups(null); };
  const alternar = (n) => setTags((a) => (a.includes(n) ? a.filter((x) => x !== n) : a.concat([n])));

  const gravar = () => {
    const r = run((s) => Engine.atualizarCliente(s, clienteId, { nome: nome.trim(), telefone: soDigitos(tel), cpf: soDigitos(cpf), email, tags, tetoCents: teto, obs }));
    if (r.ok) { toast('Cadastro atualizado.', 'ok'); onClose(); }
  };
  const salvar = () => {
    const e = {};
    if (!nome.trim()) e.nome = 'Informe o nome do cliente.';
    if (cpf && !validaCPF(cpf)) e.cpf = 'CPF inválido. Confira os 11 números.';
    if (tel && normTel(tel).length < 10) e.tel = 'Telefone incompleto. Use DDD + número.';
    if (email && !emailOk(email.trim())) e.email = 'E-mail inválido.';
    setErros(e);
    if (Object.keys(e).length) { vibrar(60); return; }
    const d = acharDuplicados(state, cpf, tel).filter((x) => x.cliente.id !== clienteId);
    if (d.length && !dups) { setDups(d); vibrar(40); return; }
    gravar();
  };
  const extras = tags.filter((n) => !TAGS_PRESET.some((t) => t.n === n));

  return (
    <BottomSheet open onClose={onClose} title="Editar cadastro" footer={dups ? null : <Btn onClick={salvar}>Salvar alterações</Btn>}>
      <TextInput label="Nome" value={nome} onChange={mudou(setNome)} error={erros.nome} maxLength={80} autoComplete="off" />
      <TextInput label="WhatsApp" value={maskTel(tel)} onChange={(v) => mudou(setTel)(soDigitos(v))} placeholder="(11) 91234-5678" inputMode="tel" error={erros.tel} />
      <TextInput label="CPF" value={maskCPF(cpf)} onChange={(v) => mudou(setCpf)(soDigitos(v))} placeholder="000.000.000-00" inputMode="numeric" error={erros.cpf} />
      <TextInput label="E-mail" value={email} onChange={mudou(setEmail)} placeholder="nome@email.com" type="email" inputMode="email" autoComplete="off" error={erros.email} maxLength={120} />
      <div>
        <p className="text-[13px] font-medium text-[#8E8E93] mb-1.5 px-1">Tags</p>
        <div className="flex flex-wrap gap-2" data-testid="tags-editor">
          {TAGS_PRESET.concat(extras.map((n) => ({ n, tom: 'gray' }))).map((t) => (
            <button key={t.n} type="button" aria-pressed={tags.includes(t.n)} onClick={() => alternar(t.n)}
              className={cx('rounded-full px-3 h-9 text-[14px] font-semibold border active:scale-95 transition', tags.includes(t.n) ? 'bg-[#0A84FF] border-[#0A84FF] text-white' : 'bg-[#2C2C2E] border-transparent text-[#8E8E93]')}>{t.n}</button>
          ))}
        </div>
      </div>
      <CurrencyInput label="Teto de exposição (0 = usar o padrão)" cents={teto} onChange={setTeto} />
      <TextInput label="Observações" value={obs} onChange={setObs} maxLength={300} placeholder="Anotações sobre o cliente" />
      {dups && (
        <div className="rounded-2xl border border-[#FF9F0A]/40 bg-[#FF9F0A]/10 p-4 space-y-3" role="alert" data-testid="aviso-duplicado">
          <p className="text-[15px] font-semibold text-[#FF9F0A]">Outro cliente já usa esses dados</p>
          {dups.map((d) => <p key={d.cliente.id} className="text-[14px]">{d.cliente.nome} · mesmo {d.motivos.join(' e ')}</p>)}
          <Btn size="md" variant="secondary" onClick={gravar}>Salvar mesmo assim</Btn>
          <Btn size="md" variant="ghost" onClick={() => setDups(null)}>Corrigir os dados</Btn>
        </div>
      )}
    </BottomSheet>
  );
}

/* ---------- linha de contrato (usada na ficha) ---------- */
export function ContratoRow({ c, ultimo }) {
  const { hoje, ir } = useApp();
  const st = Engine.statusContrato(c, hoje);
  const ativo = c.status === 'ATIVO';
  const tipoTxt = c.tipo === 'GIRO' ? 'Giro ' + c.ciclo.toLowerCase() : 'Parcelado ' + c.n + 'x';
  let sub = '';
  if (ativo) {
    if (c.tipo === 'GIRO') sub = 'Vence ' + Engine.fmtDataBR(c.vencimento);
    else { const d = Engine.dividaParcelado(c, hoje); sub = d.parcelas.filter((p) => p.quitada).length + '/' + c.n + ' pagas'; }
  }
  return (
    <button type="button" onClick={() => ir({ t: 'contrato', id: c.id })} data-testid="contrato-item"
      className={cx('w-full text-left flex items-center gap-3 px-4 py-3 min-h-[64px] active:bg-white/5 transition', !ultimo && 'border-b border-white/10')}>
      <div className="flex-1 min-w-0">
        <p className="text-[16px] font-semibold truncate">{c.id} · {tipoTxt}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <Pill tone={STATUS_TOM_FULL[st]}>{Engine.STATUS_LABEL[st]}</Pill>
          {ativo && <span className="text-[13px] text-[#8E8E93]">{sub}</span>}
        </div>
      </div>
      <div className="text-right shrink-0">
        <Money cents={ativo ? c.principalAberto : (c.status === 'PERDA' ? c.principalPerdido || 0 : c.principalOriginal)} className="block text-[16px] font-bold whitespace-nowrap" />
        <p className="text-[11px] text-[#8E8E93]">{ativo ? 'principal aberto' : c.status === 'PERDA' ? 'perdido' : 'emprestado'}</p>
      </div>
      <span className="text-[#8E8E93]"><Icon name="chevron" size={16} /></span>
    </button>
  );
}

/* ---------- Ficha do Cliente ---------- */
export function ClienteScreen({ id }) {
  const { state, hoje, voltar, readOnly } = useApp();
  const [editar, setEditar] = useState(false);
  const [novo, setNovo] = useState(false);
  const cli = state.clientes[id];
  const contratos = useMemo(() => Object.values(state.contratos).filter((c) => c.clienteId === id), [state.contratos, id]);
  if (!cli) {
    return <div><BackBar titulo="Voltar" onBack={voltar} /><p className="text-center text-[#8E8E93] py-16">Cliente não encontrado.</p></div>;
  }
  const ativos = contratos.filter((c) => c.status === 'ATIVO').sort((a, b) => (PESO_STATUS[Engine.statusContrato(a, hoje)] - PESO_STATUS[Engine.statusContrato(b, hoje)]) || numId(b.id) - numId(a.id));
  const encerrados = contratos.filter((c) => c.status !== 'ATIVO').sort((a, b) => numId(b.id) - numId(a.id));
  const exposicao = Engine.exposicaoCliente(state, id);
  const teto = cli.tetoCents || state.config.tetoPadraoCents || 0;
  const excede = teto > 0 && exposicao > teto;
  const primeiro = cli.nome.split(' ')[0];
  const href = cli.telefone ? Engine.linkWhatsApp(cli.telefone, 'Olá, ' + primeiro + '! Tudo bem?') : null;

  return (
    <div data-testid="ficha-cliente">
      <BackBar titulo="Clientes" onBack={voltar}
        right={<button type="button" onClick={() => setEditar(true)} disabled={readOnly} className="h-11 px-3 rounded-full text-[#0A84FF] text-[17px] active:opacity-60 transition disabled:opacity-40">Editar Cadastro</button>} />
      <div className="px-5 pt-2 flex items-center gap-4">
        <div className="h-16 w-16 shrink-0 rounded-full bg-[#2C2C2E] flex items-center justify-center text-[26px] font-semibold text-[#0A84FF]">{cli.nome.slice(0, 1).toUpperCase()}</div>
        <div className="flex-1 min-w-0">
          <h1 className="text-[26px] leading-[30px] font-bold break-words" data-testid="ficha-nome">{cli.nome}</h1>
          <div className="mt-1 text-[16px]"><Estrelas scoreDec={cli.scoreDec} /></div>
        </div>
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" aria-label={'Chamar ' + cli.nome + ' no WhatsApp'}
            className="h-12 w-12 shrink-0 rounded-full bg-[#30D158] text-black flex items-center justify-center active:scale-95 transition"><Icon name="chat" size={22} /></a>
        ) : (
          <span role="img" aria-label="Cliente sem telefone cadastrado" className="h-12 w-12 shrink-0 rounded-full bg-[#2C2C2E] text-[#636366] flex items-center justify-center"><Icon name="chat" size={22} /></span>
        )}
      </div>
      {cli.tags && cli.tags.length > 0 && (
        <div className="px-5 mt-3 flex flex-wrap gap-2" data-testid="ficha-tags">{cli.tags.map((n) => <Pill key={n} tone={tomTag(n)}>{n}</Pill>)}</div>
      )}

      <div className="px-4 mt-4 space-y-3">
        <Card className="p-4">
          <p className="text-[13px] text-[#8E8E93]">Exposição Total Ativa</p>
          <Money cents={exposicao} className={cx('block text-[30px] font-bold leading-tight whitespace-nowrap', excede && 'text-[#FF453A]')} />
          <p className="text-[13px] text-[#8E8E93] mt-1" data-testid="ficha-teto">{teto > 0 ? (excede ? 'Acima do teto de ' : 'Teto de ') : 'Sem teto definido'}{teto > 0 && <Money cents={teto} />}</p>
        </Card>
        <Btn onClick={() => setNovo(true)} disabled={readOnly}>+ Novo Empréstimo</Btn>

        <Card>
          <Linha label="WhatsApp">{cli.telefone ? maskTel(cli.telefone) : '—'}</Linha>
          <Linha label="CPF">{cli.cpf ? maskCPF(cli.cpf) : '—'}</Linha>
          <Linha label="E-mail"><span className="break-all">{cli.email || '—'}</span></Linha>
          {cli.obs && <Linha label="Obs"><span className="font-normal">{cli.obs}</span></Linha>}
        </Card>
      </div>

      <div className="px-4">
        <SectionTitle right={<Pill tone={ativos.length ? 'blue' : 'gray'}>{ativos.length}</Pill>}>Contratos ativos</SectionTitle>
        <Card>
          {ativos.length === 0 ? <p className="text-center text-[15px] text-[#8E8E93] py-6 px-6" data-testid="sem-ativos">Nenhum contrato ativo.</p>
            : ativos.map((c, i) => <ContratoRow key={c.id} c={c} ultimo={i === ativos.length - 1} />)}
        </Card>
        {encerrados.length > 0 && (
          <>
            <SectionTitle right={<Pill>{encerrados.length}</Pill>}>Quitados e perdas</SectionTitle>
            <Card>{encerrados.map((c, i) => <ContratoRow key={c.id} c={c} ultimo={i === encerrados.length - 1} />)}</Card>
          </>
        )}
      </div>
      {editar && <EditarClienteSheet clienteId={id} onClose={() => setEditar(false)} />}
      {novo && <ContratoSheet clienteId={id} onClose={() => setNovo(false)} />}
    </div>
  );
}

/* ---------- Detalhe do Contrato ---------- */
export function ContratoScreen({ id }) {
  const { state, hoje, voltar, ir, run, readOnly } = useApp();
  const toast = useToast();
  const [sheet, setSheet] = useState(null);
  const c = state.contratos[id];
  const hist = useMemo(() => state.ledger.filter((e) => e.contratoId === id).slice().reverse(), [state.ledger, id]);
  if (!c) {
    return <div><BackBar titulo="Voltar" onBack={voltar} /><p className="text-center text-[#8E8E93] py-16">Contrato não encontrado.</p></div>;
  }
  const cli = state.clientes[c.clienteId];
  const st = Engine.statusContrato(c, hoje);
  const ativo = c.status === 'ATIVO';
  const giro = c.tipo === 'GIRO';
  const div = Engine.dividaContrato(c, hoje);
  const pr = ativo && giro ? Engine.proRataGiro(c, hoje) : { aplicavel: false };
  const ultimaAtiva = hist.find((e) => (e.tipo === 'BAIXA' || e.tipo === 'PERDA') && !e.estornadaPor);
  const temBaixaAtiva = !!ultimaAtiva;
  const r = c.regras;
  const tipoTxt = giro ? 'Giro ' + c.ciclo.toLowerCase() + ' · ' + Engine.fmtPercent(c.taxaBp) : 'Parcelado ' + c.n + 'x ' + c.periodicidade.toLowerCase() + ' · ' + Engine.fmtPercent(c.taxaBp) + ' total';

  const executar = (op, msg) => { const res = run(op); if (res.ok) toast(msg, 'ok'); return res.ok; };

  return (
    <div data-testid="detalhe-contrato">
      <BackBar titulo={cli ? cli.nome.split(' ')[0] : 'Voltar'} onBack={voltar} />
      <div className="px-5 pt-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-[28px] leading-[34px] font-bold">Contrato {c.id}</h1>
          <Pill tone={STATUS_TOM_FULL[st]}>{Engine.STATUS_LABEL[st]}</Pill>
        </div>
        <button type="button" onClick={() => ir({ t: 'cliente', id: c.clienteId })} className="text-[17px] text-[#0A84FF] mt-0.5 text-left active:opacity-60" data-testid="link-cliente">{cli ? cli.nome : c.clienteId}</button>
        <p className="text-[14px] text-[#8E8E93] mt-0.5">{tipoTxt} · início {Engine.fmtDataBR(c.dataInicio)}</p>
      </div>

      <div className="px-4 mt-4 space-y-3">
        {ativo && Engine.alertaRenovacoes(c) && (
          <div className="rounded-2xl border border-[#FFD60A]/40 bg-[#FFD60A]/10 p-3 text-[14px] text-[#FFD60A] leading-snug" role="alert" data-testid="alerta-renovacoes">
            Atenção: {c.renovacoesSeguidas} renovações seguidas sem amortizar o principal.
          </div>
        )}

        <Card data-testid="extrato">
          {ativo ? (giro ? (
            <>
              <Linha label="Principal em aberto" forte><Money cents={div.principal} /></Linha>
              <Linha label={'Juros do ciclo (' + Engine.fmtPercent(c.taxaBp) + ')'}><Money cents={div.jurosCiclo} /></Linha>
              {div.jurosPendente > 0 && <Linha label="Juros pendentes" tom="text-[#FF9F0A]"><Money cents={div.jurosPendente} /></Linha>}
              <Linha label={'Multa + mora' + (div.dias > 0 ? ' (' + div.dias + ' dias de atraso)' : '')} tom={div.encargos > 0 ? 'text-[#FF453A]' : undefined}><Money cents={div.encargos} /></Linha>
              <Linha label="Total para quitar" forte><Money cents={div.total} /></Linha>
              <Linha label="Vencimento">{Engine.fmtDataBR(c.vencimento)}{div.vencEfetivo !== c.vencimento ? ' (carência até ' + Engine.fmtDataBR(div.vencEfetivo) + ')' : ''}</Linha>
              <Linha label="Renovações">{c.renovacoes}</Linha>
            </>
          ) : (
            <>
              <Linha label="Principal em aberto" forte><Money cents={c.principalAberto} /></Linha>
              <Linha label="Juros em aberto"><Money cents={div.jur} /></Linha>
              <Linha label="Multa + mora" tom={div.enc > 0 ? 'text-[#FF453A]' : undefined}><Money cents={div.enc} /></Linha>
              <Linha label="Total em aberto" forte><Money cents={div.total} /></Linha>
              <Linha label="Exigível agora" tom="text-[#FF9F0A]"><Money cents={div.exigivel} /></Linha>
            </>
          )) : (
            <>
              <Linha label="Valor emprestado"><Money cents={c.principalOriginal} /></Linha>
              {c.status === 'PERDA' && <Linha label="Perdido" tom="text-[#FF453A]"><Money cents={c.principalPerdido || 0} /></Linha>}
              <Linha label="Situação">{Engine.STATUS_LABEL[c.status]}</Linha>
            </>
          )}
          <Linha label="Regras de atraso"><span className="text-[13px] font-medium"><ResumoEncargos r={r} />{(r.multaTipo !== 'FIXO' || r.moraTipo !== 'FIXO') ? ' sobre ' + (r.baseEncargo === 'MONTANTE' ? 'montante' : 'principal') : ''}{r.carenciaFds ? ' · carência fds' : ''}</span></Linha>
        </Card>

        {pr.aplicavel && (
          <Card className="p-4" data-testid="card-prorata">
            <p className="text-[13px] text-[#8E8E93]">Juros proporcionais (Pro-Rata)</p>
            <p className="text-[15px] mt-1 leading-snug">{pr.decorridos} de {pr.cicloDias} dias do ciclo: <Money cents={pr.proRata} className="font-bold" />. Se quitar antes de vencer, você pode dar até <Money cents={pr.sugestaoDesconto} className="font-bold" /> de desconto.</p>
          </Card>
        )}

        {ativo && c.promessa && (
          <Card className="p-4 border-[#0A84FF]/40" data-testid="card-promessa">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] text-[#0A84FF] font-semibold">Promessa agendada</p>
                <p className="text-[16px] font-semibold mt-0.5">Pagará em {Engine.fmtDataBR(c.promessa.data)}</p>
                <p className="text-[13px] text-[#8E8E93]">{c.promessa.congelar ? 'Multa e mora congeladas até a data.' : 'Multa e mora continuam correndo.'}{c.promessa.obs ? ' ' + c.promessa.obs : ''}</p>
              </div>
              <Btn size="sm" variant="secondary" className="!w-auto shrink-0" disabled={readOnly} onClick={() => executar((s) => Engine.cancelarPromessa(s, id, { hoje }), 'Promessa cancelada.')}>Cancelar</Btn>
            </div>
          </Card>
        )}
        {ativo && c.acordo && (
          <Card className="p-4 border-[#0A84FF]/40" data-testid="card-acordo">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] text-[#0A84FF] font-semibold">Acordo / Congelado</p>
                <p className="text-[16px] font-semibold mt-0.5">Desde {Engine.fmtDataBR(c.acordo.desde)}</p>
                <p className="text-[13px] text-[#8E8E93]">Multa e mora congeladas.{c.acordo.obs ? ' ' + c.acordo.obs : ''}</p>
              </div>
              <Btn size="sm" variant="secondary" className="!w-auto shrink-0" disabled={readOnly} onClick={() => executar((s) => Engine.encerrarAcordo(s, id, { hoje }), 'Acordo encerrado.')}>Encerrar</Btn>
            </div>
          </Card>
        )}

        {ativo && (
          <div className="space-y-2">
            <Btn variant="green" onClick={() => setSheet({ t: 'pagar' })} disabled={readOnly}>Registrar Pagamento</Btn>
            <div className="grid grid-cols-2 gap-2">
              <Btn variant="secondary" size="md" onClick={() => setSheet({ t: 'promessa' })} disabled={readOnly}>Anotar Promessa</Btn>
              {c.acordo
                ? <Btn variant="secondary" size="md" onClick={() => executar((s) => Engine.encerrarAcordo(s, id, { hoje }), 'Acordo encerrado.')} disabled={readOnly}>Encerrar Acordo</Btn>
                : <Btn variant="secondary" size="md" onClick={() => setSheet({ t: 'acordo' })} disabled={readOnly}>Congelar Acordo</Btn>}
            </div>
            <Btn variant="secondary" size="md" className="!text-[#FF453A]" onClick={() => setSheet({ t: 'perda' })} disabled={readOnly}>Marcar como Perda</Btn>
          </div>
        )}
      </div>

      {!giro && (
        <div className="px-4">
          <SectionTitle right={<Pill tone="blue">{div.parcelas.filter((p) => p.quitada).length}/{c.n} pagas</Pill>}>Parcelas</SectionTitle>
          <div className="h-2 rounded-full bg-[#2C2C2E] overflow-hidden mb-3" aria-hidden="true"><div className="h-full bg-[#30D158]" style={{ width: Math.round(100 * div.parcelas.filter((p) => p.quitada).length / c.n) + '%' }} /></div>
          <Card className="overflow-hidden" data-testid="lista-parcelas">
            <div className="max-h-[380px] overflow-y-auto">
              {div.parcelas.map((p, i) => {
                const pagavel = ativo && !p.quitada && !readOnly;
                const rotulo = p.quitada ? 'Paga' : !ativo ? 'Não paga' : Engine.STATUS_LABEL[p.status === 'EM_DIA' ? 'EM_DIA' : p.status];
                const tom = p.quitada ? 'green' : !ativo ? 'gray' : STATUS_TOM_FULL[p.status];
                const Tag = pagavel ? 'button' : 'div';
                return (
                  <Tag key={p.n} type={pagavel ? 'button' : undefined} onClick={pagavel ? () => setSheet({ t: 'pagar', parcelaN: p.n }) : undefined} data-testid="parcela"
                    className={cx('w-full text-left flex items-center gap-3 px-4 py-2.5 min-h-[56px]', i < div.parcelas.length - 1 && 'border-b border-white/10', pagavel && 'active:bg-white/5 transition')}>
                    <span className="w-8 text-[15px] font-semibold text-[#8E8E93] tabular-nums">{p.n}ª</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[15px] tabular-nums">{Engine.fmtDataBR(p.venc)}</span>
                      <Pill tone={tom}>{rotulo}</Pill>
                    </span>
                    <span className="text-right">
                      <Money cents={p.quitada ? c.parcelas[i].valor : p.total} className={cx('block text-[16px] font-bold whitespace-nowrap', p.quitada && 'text-[#8E8E93] line-through')} />
                      {!p.quitada && p.dias > 0 && ativo && <span className="block text-[12px] text-[#FF453A]">{p.dias}d de atraso</span>}
                    </span>
                  </Tag>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      <div className="px-4">
        <SectionTitle>Histórico</SectionTitle>
        {ultimaAtiva && (
          ultimaAtiva.snapshot
            ? <Btn variant="secondary" size="md" className="mb-3" onClick={() => setSheet({ t: 'estorno', lanc: ultimaAtiva })} disabled={readOnly}>Estornar Última Baixa ({ultimaAtiva.id})</Btn>
            : <p className="text-[13px] text-[#8E8E93] mb-3 px-1" data-testid="estorno-expirado">Estorno indisponível: só as 3 últimas movimentações do contrato podem ser estornadas.</p>
        )}
        <Card>
          {hist.length === 0 ? <p className="text-center text-[15px] text-[#8E8E93] py-6">Sem movimentos.</p> : hist.map((e, i) => {
            let titulo = e.tipo, valor = null, sub = '', tom = 'text-white';
            if (e.tipo === 'EMPRESTIMO') { titulo = 'Empréstimo'; valor = -e.deltas.disp; tom = 'text-white'; }
            else if (e.tipo === 'BAIXA') { titulo = 'Pagamento · ' + (Engine.CENARIO_LABEL[e.cenario] || e.cenario); valor = e.recebido; tom = 'text-[#30D158]'; sub = e.desconto > 0 ? 'Desconto ' + Engine.fmtBRL(e.desconto) : ''; }
            else if (e.tipo === 'PERDA') { titulo = 'Perda / Incobrável'; valor = e.deltas.perdas; tom = 'text-[#FF453A]'; }
            else if (e.tipo === 'ESTORNO') { titulo = 'Estorno de ' + e.estornoDe; valor = null; tom = 'text-[#8E8E93]'; }
            return (
              <div key={e.id} className={cx('flex items-center gap-3 px-4 py-3', i < hist.length - 1 && 'border-b border-white/10')} data-testid="hist-item">
                <div className="flex-1 min-w-0">
                  <p className={cx('text-[15px] font-semibold', e.estornadaPor && 'line-through opacity-60')}>{titulo}{e.estornadaPor && <span className="ml-2"><Pill>estornado</Pill></span>}</p>
                  <p className="text-[12px] text-[#8E8E93] truncate">{Engine.fmtDataBR(e.data)} · {e.id}{e.obs ? ' · ' + e.obs : ''}{sub && !discretoSub(state) ? ' · ' + sub : ''}</p>
                </div>
                {valor !== null && <Money cents={valor} className={cx('text-[15px] font-semibold whitespace-nowrap', tom)} />}
                {e.tipo === 'BAIXA' && (
                  <button type="button" onClick={() => setSheet({ t: 'recibo', id: e.id })} aria-label={'Recibo ' + e.id} className="h-9 px-3 rounded-full bg-[#2C2C2E] text-[13px] font-semibold text-[#0A84FF] active:scale-95 transition">Recibo</button>
                )}
              </div>
            );
          })}
        </Card>
        {ativo && !temBaixaAtiva && !readOnly && (
          <div className="mt-4"><Btn variant="ghost" size="md" className="!text-[#8E8E93]" onClick={() => setSheet({ t: 'cancelar' })}>Cancelar contrato (criado por engano)</Btn></div>
        )}
      </div>

      {sheet && sheet.t === 'pagar' && (
        <PagamentoSheet contratoId={id} parcelaInicial={sheet.parcelaN} onClose={() => setSheet(null)} onPago={(lid) => setSheet({ t: 'recibo', id: lid })} />
      )}
      {sheet && sheet.t === 'recibo' && <ReciboSheet lancId={sheet.id} onClose={() => setSheet(null)} />}
      {sheet && sheet.t === 'promessa' && <PromessaSheet contratoId={id} onClose={() => setSheet(null)} />}
      {sheet && sheet.t === 'acordo' && <AcordoSheet contratoId={id} onClose={() => setSheet(null)} />}
      {sheet && sheet.t === 'perda' && (
        <ConfirmSheet titulo="Marcar como Perda" botao="Confirmar perda" variante="danger" comObs onClose={() => setSheet(null)}
          onConfirm={(obs) => { const ok = executar((s) => Engine.marcarPerda(s, id, { hoje, obs }), 'Contrato marcado como perda.'); if (ok) setSheet(null); return ok; }}>
          <p><Money cents={c.principalAberto} className="font-bold text-white" /> saem do Capital na Rua e vão para Perdas / Incobráveis. O score de {cli ? cli.nome.split(' ')[0] : 'o cliente'} cai para 1,0 ★.</p>
          <p>Se foi sem querer, você pode usar “Estornar Última Baixa” logo em seguida.</p>
        </ConfirmSheet>
      )}
      {sheet && sheet.t === 'estorno' && (
        <ConfirmSheet titulo="Estornar Última Baixa" botao="Estornar" variante="danger" onClose={() => setSheet(null)}
          onConfirm={() => { const ok = executar((s) => Engine.estornarUltimaBaixa(s, id, { hoje }), 'Baixa estornada.'); if (ok) setSheet(null); return ok; }}>
          <p>{sheet.lanc.tipo === 'PERDA' ? 'Perda' : 'Pagamento'} <b className="text-white">{sheet.lanc.id}</b> de {Engine.fmtDataBR(sheet.lanc.data)}{sheet.lanc.tipo === 'BAIXA' && <> · recebido <Money cents={sheet.lanc.recebido} className="font-bold text-white" /></>}</p>
          <p>O contrato volta exatamente ao estado de antes, os valores saem dos potes de volta e o score é restaurado. O lançamento original fica marcado como estornado no histórico.</p>
        </ConfirmSheet>
      )}
      {sheet && sheet.t === 'cancelar' && (
        <ConfirmSheet titulo="Cancelar contrato" botao="Cancelar contrato" variante="danger" onClose={() => setSheet(null)}
          onConfirm={() => { const ok = executar((s) => Engine.cancelarContrato(s, id, { hoje }), 'Contrato cancelado.'); if (ok) setSheet(null); return ok; }}>
          <p>Use só para contrato lançado por engano. O principal volta para o Capital Disponível.</p>
        </ConfirmSheet>
      )}
    </div>
  );
}
export const discretoSub = (state) => !!state.config.modoDiscreto;
