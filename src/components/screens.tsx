// @ts-nocheck — porte fiel do protótipo aprovado (lógica de tela intacta).
'use client';
/* eslint-disable */
import React, { useState, useEffect, useRef, useMemo, useCallback, useContext, createContext } from 'react';
import { createPortal } from 'react-dom';
import Engine from '@/lib/engine';
import { Auth } from '@/lib/sessao';
import { BottomSheet, Btn, Card, CurrencyInput, EncargoFields, FullOverlay, Icon, Money, PercentInput, Pill, Row, SectionTitle, Segmented, Switch, TextInput, cx, encargosDe, useApp, useToast, vibrar } from './ui';
import { FluxoNovo } from './clientes';
import { CalculadoraSheet, RelatoriosCard } from './etapa4';
import { AlterarSenhaSheet, DesativarPinSheet, PinFlow } from './auth-screens';

/* ============================================================================
 * 30-screens.jsx — Início, Clientes, Caixa & Relatórios, Ajustes, Barra inferior
 * (+ Entrada / - Saída / Reinvestir, Ajustes completos; Clientes em 40-clientes.jsx)
 * ========================================================================== */
export const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

export function ScreenHeader({ eyebrow, title, right }) {
  return (
    <header className="px-5 pt-[calc(env(safe-area-inset-top)+14px)] pb-2 flex items-end justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="text-[14px] text-[#8E8E93] truncate">{eyebrow}</p>}
        <h1 className="text-[34px] leading-[40px] font-bold tracking-tight">{title}</h1>
      </div>
      <div className="flex gap-2 shrink-0 pb-1">{right}</div>
    </header>
  );
}

export function IconBtn({ name, label, onClick, active, filled }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} aria-pressed={active}
      className={cx('h-11 w-11 rounded-full border border-white/10 flex items-center justify-center active:scale-95 transition', active || filled ? 'bg-[#0A84FF] text-white' : 'bg-[#1C1C1E] text-[#0A84FF]')}>
      <Icon name={name} size={21} />
    </button>
  );
}

/* ---------- cartões estilo Apple Wallet ---------- */
export const TONES = {
  blue: { grad: 'from-[#0A84FF]/30', txt: 'text-[#0A84FF]' },
  orange: { grad: 'from-[#FF9F0A]/30', txt: 'text-[#FF9F0A]' },
  green: { grad: 'from-[#30D158]/30', txt: 'text-[#30D158]' },
  red: { grad: 'from-[#FF453A]/30', txt: 'text-[#FF453A]' },
};
export function WalletCard({ label, cents, tone, hint, testId }) {
  const t = TONES[tone];
  const len = Engine.fmtBRL(cents).length;
  const tam = len <= 11 ? 'text-[22px]' : len <= 13 ? 'text-[18px]' : len <= 16 ? 'text-[15px]' : 'text-[13px]';
  return (
    <div data-testid={testId} className={cx('rounded-3xl border border-white/10 p-4 bg-gradient-to-br to-[#1C1C1E] to-60% min-h-[112px] flex flex-col justify-between', t.grad)}>
      <p className={cx('text-[13px] font-semibold leading-tight', t.txt)}>{label}</p>
      <div>
        <Money cents={cents} className={cx('block font-bold leading-tight whitespace-nowrap', tam)} />
        {hint && <p className="text-[12px] text-[#8E8E93] mt-0.5">{hint}</p>}
      </div>
    </div>
  );
}

export function MiniStat({ label, children }) {
  return (
    <div className="rounded-2xl bg-[#2C2C2E] px-3 py-2.5">
      <p className="text-[12px] text-[#8E8E93]">{label}</p>
      <p className="text-[16px] font-semibold mt-0.5">{children}</p>
    </div>
  );
}

export const STATUS_TOM = { ATRASADO: 'red', VENCE_HOJE: 'orange', PROMESSA: 'blue' };

export function AgendaItem({ it, state }) {
  const { ir } = useApp();
  const href = it.telefone ? Engine.linkWhatsApp(it.telefone, Engine.mensagemCobranca(it, state)) : null;
  const sub = it.status === 'ATRASADO' ? it.dias + (it.dias === 1 ? ' dia' : ' dias') + ' de atraso' : it.status === 'PROMESSA' ? 'Promessa agendada' : 'Vence hoje';
  return (
    <div className="flex items-center border-b border-white/10 last:border-b-0" data-testid="agenda-item">
      <button type="button" onClick={() => ir({ t: 'contrato', id: it.contratoId })} aria-label={'Abrir contrato de ' + it.nome}
        className="flex-1 min-w-0 flex items-center gap-3 pl-4 pr-2 py-3 text-left active:bg-white/5 transition" data-testid="agenda-abrir">
        <div className="flex-1 min-w-0">
          <p className="text-[17px] font-semibold truncate">{it.nome}</p>
          <div className="flex items-center gap-x-2 gap-y-1 mt-1 flex-wrap">
            <Pill tone={STATUS_TOM[it.status]}>{Engine.STATUS_LABEL[it.status]}</Pill>
            <span className="text-[13px] text-[#8E8E93]">{it.tipo === 'GIRO' ? 'Giro' : 'Parcelado'} · {sub}</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <Money cents={it.cobrarAgora} className="block text-[17px] font-bold whitespace-nowrap" />
          <p className="text-[11px] text-[#8E8E93]">cobrar agora</p>
        </div>
      </button>
      <div className="pr-4 pl-1 py-3">
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" aria-label={'Cobrar ' + it.nome + ' no WhatsApp'}
            className="h-12 w-12 shrink-0 rounded-full bg-[#30D158] text-black flex items-center justify-center active:scale-95 transition"><Icon name="chat" size={22} /></a>
        ) : (
          <span role="img" aria-label="Cliente sem telefone cadastrado" className="h-12 w-12 shrink-0 rounded-full bg-[#2C2C2E] text-[#636366] flex items-center justify-center"><Icon name="chat" size={22} /></span>
        )}
      </div>
    </div>
  );
}

/* ---------- Início ---------- */
export function HomeScreen() {
  const { state, hoje, user, setDiscreto, bloquear } = useApp();
  const discreto = state.config.modoDiscreto;
  const cx4 = Engine.resumoCaixa(state);
  const fech = useMemo(() => Engine.fechamentoDoDia(state, hoje), [state, hoje]);
  const agenda = useMemo(() => Engine.agendaDoDia(state, hoje), [state, hoje]);
  const dataTxt = DIAS_SEMANA[Engine.diaSemana(hoje)].split('-')[0] + ', ' + Engine.fmtDataBR(hoje);
  const [fluxo, setFluxo] = useState(false);
  const [calc, setCalc] = useState(false);

  return (
    <div>
      <ScreenHeader eyebrow={'Olá, ' + user.nome.split(' ')[0] + ' · ' + dataTxt} title="Início"
        right={<>
          <IconBtn name="plus" label="Novo cliente ou contrato" filled onClick={() => setFluxo(true)} />
          <IconBtn name={discreto ? 'eyeOff' : 'eye'} label={discreto ? 'Mostrar valores' : 'Ocultar valores'} active={discreto} onClick={() => setDiscreto(!discreto)} />
          {user.temPin && <IconBtn name="lock" label="Bloquear agora" onClick={bloquear} />}
        </>} />

      <div className="px-4 grid grid-cols-2 gap-3 mt-2">
        <WalletCard testId="card-disp" label="Capital Disponível" cents={cx4.disponivel} tone="blue" hint="Pronto para emprestar" />
        <WalletCard testId="card-rua" label="Capital na Rua" cents={cx4.naRua} tone="orange" hint="Principal em aberto" />
        <WalletCard testId="card-lucro" label="Lucro Líquido Realizado" cents={cx4.lucro} tone="green" hint="Juros e encargos recebidos" />
        <WalletCard testId="card-perdas" label="Perdas / Incobráveis" cents={cx4.perdas} tone="red" hint="Baixado do capital" />
      </div>

      <div className="px-4 mt-3">
        <button type="button" onClick={() => setCalc(true)} data-testid="abrir-calculadora"
          className="w-full rounded-3xl border border-white/10 bg-[#1C1C1E] px-4 min-h-[64px] flex items-center gap-3 text-left active:scale-95 transition">
          <span className="h-11 w-11 rounded-full bg-[#2C2C2E] text-[#0A84FF] flex items-center justify-center"><Icon name="dollar" size={22} /></span>
          <span className="flex-1"><span className="block text-[17px] font-semibold">Calculadora de Balcão</span><span className="block text-[13px] text-[#8E8E93]">Simule uma proposta e envie ao cliente</span></span>
          <span className="text-[#8E8E93]"><Icon name="chevron" size={18} /></span>
        </button>
      </div>

      <div className="px-4">
        <SectionTitle>Fechamento do dia</SectionTitle>
        <Card className="p-4" >
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[13px] text-[#8E8E93]">Recebido de clientes hoje</p>
              <Money cents={fech.recebido} className="block text-[30px] font-bold leading-tight" />
            </div>
            <Pill tone={fech.qtd ? 'green' : 'gray'}>{fech.qtd} {fech.qtd === 1 ? 'baixa' : 'baixas'}</Pill>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3">
            <MiniStat label="Lucro"><Money cents={fech.lucro} /></MiniStat>
            <MiniStat label="Principal"><Money cents={fech.principalDevolvido} /></MiniStat>
            <MiniStat label="Descontos"><Money cents={fech.descontos} /></MiniStat>
          </div>
          <p className="text-[12px] text-[#8E8E93] mt-3 leading-snug">Conta só pagamentos de clientes na data de hoje. + Entrada, - Saída e Reinvestimento não entram.</p>
        </Card>

        <SectionTitle right={agenda.length > 0 ? <Pill tone="orange">{agenda.length}</Pill> : null}>Vence hoje e atrasados</SectionTitle>
        <Card>
          {agenda.length === 0 ? (
            <div className="flex flex-col items-center text-center py-8 px-6 gap-2" data-testid="agenda-vazia">
              <span className="text-[#30D158]"><Icon name="check" size={34} /></span>
              <p className="text-[17px] font-semibold">Nada para cobrar hoje</p>
              <p className="text-[14px] text-[#8E8E93]">Quando houver contratos vencendo ou atrasados, eles aparecem aqui com o botão do WhatsApp.</p>
            </div>
          ) : agenda.map((it) => <AgendaItem key={it.contratoId} it={it} state={state} />)}
        </Card>
      </div>
      {fluxo && <FluxoNovo onClose={() => setFluxo(false)} />}
      {calc && <CalculadoraSheet onClose={() => setCalc(false)} />}
    </div>
  );
}

/* ---------- Caixa & Relatórios ---------- */
export const MOV_INFO = {
  APORTE: { l: '+ Entrada', tom: 'text-[#30D158]' },
  SANGRIA: { l: '- Saída', tom: 'text-[#FF9F0A]' },
  REINVESTIMENTO: { l: 'Reinvestimento', tom: 'text-[#0A84FF]' },
  ARQUIVO: { l: 'Saldo arquivado', tom: 'text-[#8E8E93]' },
  EMPRESTIMO: { l: 'Empréstimo', tom: 'text-white' },
  BAIXA: { l: 'Pagamento', tom: 'text-[#30D158]' },
  PERDA: { l: 'Perda', tom: 'text-[#FF453A]' },
  ESTORNO: { l: 'Estorno', tom: 'text-[#8E8E93]' },
};
export function valorMov(e) {
  const caixa = e.deltas.disp + e.deltas.lucro; // efeito no dinheiro físico
  if (caixa !== 0) return caixa;
  return Math.abs(e.deltas.disp) || Math.abs(e.deltas.perdas) || Math.abs(e.deltas.rua);
}

export function MovimentoSheet({ tipo, onClose }) {
  const { state, hoje, run } = useApp();
  const toast = useToast();
  const cx4 = Engine.resumoCaixa(state);
  const [valor, setValor] = useState(0);
  const [origem, setOrigem] = useState('DISPONIVEL');
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState('');

  const cfg = {
    aporte: { titulo: '+ Entrada', botao: 'Confirmar + Entrada', variante: 'green', ok: '+ Entrada registrada.' },
    sangria: { titulo: '- Saída', botao: 'Confirmar - Saída', variante: 'orange', ok: '- Saída registrada.' },
    reinvestir: { titulo: 'Reinvestir lucro', botao: 'Mover para o Disponível', variante: 'primary', ok: 'Lucro reinvestido.' },
  }[tipo];
  const max = tipo === 'aporte' ? null : tipo === 'reinvestir' ? cx4.lucro : origem === 'DISPONIVEL' ? cx4.disponivel : cx4.lucro;

  const enviar = () => {
    setErro('');
    if (valor <= 0) { setErro('Informe um valor maior que zero.'); vibrar(60); return; }
    if (max !== null && valor > max) { setErro('Valor maior que o saldo deste pote.'); vibrar(60); return; }
    const r = run((s) => {
      if (tipo === 'aporte') return Engine.aporte(s, { valor, data: hoje, obs });
      if (tipo === 'sangria') return Engine.sangria(s, { valor, origem, data: hoje, obs });
      return Engine.reinvestirLucro(s, { valor, data: hoje, obs });
    });
    if (r.ok) { toast(cfg.ok, 'ok'); vibrar(15); onClose(); }
  };

  return (
    <BottomSheet open onClose={onClose} title={cfg.titulo} footer={<Btn variant={cfg.variante} onClick={enviar}>{cfg.botao}</Btn>}>
      {tipo === 'sangria' && (
        <div>
          <p className="text-[13px] font-medium text-[#8E8E93] mb-1.5 px-1">Retirar de</p>
          <Segmented value={origem} onChange={(v) => { setOrigem(v); setValor(0); }} options={[{ value: 'DISPONIVEL', label: 'Capital Disponível' }, { value: 'LUCRO', label: 'Lucro' }]} />
        </div>
      )}
      <CurrencyInput label="Valor" cents={valor} onChange={setValor} autoFocus error={erro}
        hint={max !== null ? <span>Saldo do pote: <Money cents={max} /></span> : 'Dinheiro novo que você coloca na banca.'} />
      {max !== null && max > 0 && <Btn variant="secondary" size="sm" onClick={() => setValor(max)}>Usar todo o saldo</Btn>}
      <TextInput label="Observação (opcional)" value={obs} onChange={setObs} placeholder="Ex.: reforço de caixa" maxLength={80} />
      {tipo === 'sangria' && <p className="text-[13px] text-[#8E8E93] leading-snug">A - Saída é uma retirada sua. Ela não conta como recebimento de cliente e não aparece no Fechamento do Dia.</p>}
      {tipo === 'reinvestir' && <p className="text-[13px] text-[#8E8E93] leading-snug">O lucro fica em um pote separado e não financia empréstimos. Reinvestir move o valor para o Capital Disponível.</p>}
    </BottomSheet>
  );
}

/** Pagamentos operacionais de clientes nos últimos 30 dias (hoje e 29 dias antes), sem estornados. Só leitura do Livro-Razão. */
export function recebidoUltimos30Dias(state, hoje) {
  const ini = Engine.addDias(hoje, -29);
  const r = { ini: ini, fim: hoje, qtd: 0, recebido: 0, lucro: 0, principal: 0 };
  state.ledger.forEach((e) => {
    if (e.tipo !== 'BAIXA' || e.estornadaPor || e.data < ini || e.data > hoje) return;
    r.qtd++;
    r.recebido += e.recebido;
    r.lucro += e.deltas.lucro;
    r.principal += e.comp.prinCash;
  });
  return r;
}

export function CaixaScreen() {
  const { state, hoje, readOnly } = useApp();
  const [sheet, setSheet] = useState(null);
  const cx4 = Engine.resumoCaixa(state);
  const movs = useMemo(() => state.ledger.slice(-30).reverse(), [state.ledger]);
  const r30 = useMemo(() => recebidoUltimos30Dias(state, hoje), [state, hoje]);

  const linha = (label, cents, cor, ultimo) => (
    <div className={cx('flex items-center justify-between px-4 min-h-[52px]', !ultimo && 'border-b border-white/10')}>
      <span className="text-[16px]">{label}</span>
      <Money cents={cents} className={cx('text-[17px] font-semibold', cor)} />
    </div>
  );

  return (
    <div>
      <ScreenHeader title="Caixa" />
      <div className="px-4 space-y-3 mt-1">
        <Card>
          {linha('Capital Disponível', cx4.disponivel, 'text-[#0A84FF]')}
          {linha('Capital na Rua', cx4.naRua, 'text-[#FF9F0A]')}
          {linha('Lucro Líquido Realizado', cx4.lucro, 'text-[#30D158]')}
          {linha('Perdas / Incobráveis', cx4.perdas, 'text-[#FF453A]')}
          {linha('Resultado (Lucro − Perdas)', cx4.resultadoLiquido, cx4.resultadoLiquido < 0 ? 'text-[#FF453A]' : 'text-white', true)}
        </Card>
        <Card className="p-4" >
          <div data-testid="card-30d">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[13px] text-[#8E8E93]">Total recebido nos últimos 30 dias</p>
                <Money cents={r30.recebido} className="block text-[30px] font-bold leading-tight whitespace-nowrap" />
              </div>
              <Pill tone={r30.qtd ? 'green' : 'gray'}>{r30.qtd} {r30.qtd === 1 ? 'baixa' : 'baixas'}</Pill>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <MiniStat label="Lucro"><Money cents={r30.lucro} /></MiniStat>
              <MiniStat label="Principal"><Money cents={r30.principal} /></MiniStat>
            </div>
            <p className="text-[12px] text-[#8E8E93] mt-3 leading-snug">De {Engine.fmtDataBR(r30.ini)} a {Engine.fmtDataBR(hoje)}. Só pagamentos de clientes (sem + Entrada, - Saída ou Reinvestimento).</p>
          </div>
        </Card>
        <div className="grid grid-cols-2 gap-3">
          <Btn variant="green" onClick={() => setSheet('aporte')} disabled={readOnly}>+ Entrada</Btn>
          <Btn variant="orange" onClick={() => setSheet('sangria')} disabled={readOnly}>- Saída</Btn>
        </div>
        <Btn variant="secondary" size="md" onClick={() => setSheet('reinvestir')} disabled={readOnly || cx4.lucro <= 0}><Icon name="repeat" size={18} /> Reinvestir lucro</Btn>
      </div>

      <RelatoriosCard />

      <div className="px-4">
        <SectionTitle>Últimos movimentos</SectionTitle>
        <Card>
          {movs.length === 0 ? (
            <p className="text-center text-[15px] text-[#8E8E93] py-8 px-6" data-testid="sem-movimentos">Nenhum movimento ainda. Comece com uma + Entrada.</p>
          ) : movs.map((e, i) => {
            const info = MOV_INFO[e.tipo] || { l: e.tipo, tom: 'text-white' };
            const v = valorMov(e);
            const caixa = e.deltas.disp + e.deltas.lucro;
            return (
              <div key={e.id} className={cx('flex items-center gap-3 px-4 py-3', i < movs.length - 1 && 'border-b border-white/10')} data-testid="movimento">
                <div className="flex-1 min-w-0">
                  <p className={cx('text-[16px] font-semibold', info.tom, e.estornadaPor && 'line-through opacity-60')}>{info.l}{e.estornadaPor && <span className="ml-2 no-underline"><Pill>estornado</Pill></span>}</p>
                  <p className="text-[12px] text-[#8E8E93] truncate">{Engine.fmtDataBR(e.data)} · {e.id}{e.obs ? ' · ' + e.obs : ''}</p>
                </div>
                <Money cents={v} sign={caixa > 0} className={cx('text-[16px] font-semibold', caixa > 0 ? 'text-[#30D158]' : caixa < 0 ? 'text-white' : 'text-[#8E8E93]')} />
              </div>
            );
          })}
        </Card>
      </div>
      {sheet && <MovimentoSheet tipo={sheet} onClose={() => setSheet(null)} />}
    </div>
  );
}

/* ---------- Ajustes ---------- */
export function TaxasSheet({ onClose }) {
  const { state, run } = useApp();
  const toast = useToast();
  const c = state.config;
  const [m, setM] = useState(c.taxaPadraoBp.MENSAL);
  const [q, setQ] = useState(c.taxaPadraoBp.QUINZENAL);
  const [s, setS] = useState(c.taxaPadraoBp.SEMANAL);
  const [p, setP] = useState(c.taxaParceladoBp);
  const [enc, setEnc] = useState(encargosDe(c));
  const [base, setBase] = useState(c.baseEncargo);
  const [fds, setFds] = useState(c.carenciaFds);
  const [teto, setTeto] = useState(c.tetoPadraoCents);
  const [pix, setPix] = useState(c.chavePix);

  const salvar = () => {
    const r = run((st) => Engine.atualizarConfig(st, { taxaPadraoBp: { MENSAL: m, QUINZENAL: q, SEMANAL: s }, taxaParceladoBp: p, multaTipo: enc.multaTipo, multaBp: enc.multaBp, multaFixaCents: enc.multaFixaCents, moraTipo: enc.moraTipo, moraDiaBp: enc.moraDiaBp, moraFixaCents: enc.moraFixaCents, baseEncargo: base, carenciaFds: fds, tetoPadraoCents: teto, chavePix: pix }), { config: true });
    if (r.ok) { toast('Ajustes salvos.', 'ok'); onClose(); }
  };
  return (
    <BottomSheet open onClose={onClose} title="Taxas e encargos" footer={<Btn onClick={salvar}>Salvar</Btn>}>
      <p className="text-[13px] text-[#8E8E93] leading-snug">Valem para <b className="text-white">novos contratos</b>. Cada contrato guarda uma cópia destas regras na hora em que é criado; mudar aqui não altera contratos antigos.</p>
      <div className="grid grid-cols-2 gap-3">
        <PercentInput label="Giro mensal" bp={m} onChange={setM} />
        <PercentInput label="Giro quinzenal" bp={q} onChange={setQ} />
        <PercentInput label="Giro semanal" bp={s} onChange={setS} />
        <PercentInput label="Parcelado (total)" bp={p} onChange={setP} />
      </div>
      <EncargoFields v={enc} onChange={setEnc} />
      <div>
        <p className="text-[13px] font-medium text-[#8E8E93] mb-1.5 px-1">Multa e mora em % incidem sobre</p>
        <Segmented value={base} onChange={setBase} options={[{ value: 'MONTANTE', label: 'Montante total' }, { value: 'PRINCIPAL', label: 'Só o principal' }]} />
      </div>
      <div className="flex items-center justify-between gap-4 rounded-2xl bg-[#2C2C2E] px-4 py-3">
        <div><p className="text-[16px]">Carência de fim de semana</p><p className="text-[13px] text-[#8E8E93]">Vencimento no sáb/dom vale até a segunda, sem multa.</p></div>
        <Switch checked={fds} onChange={setFds} label="Carência de fim de semana" />
      </div>
      <CurrencyInput label="Teto de exposição por cliente (0 = sem teto)" cents={teto} onChange={setTeto} hint="Só avisa em amarelo; não bloqueia o empréstimo." />
      <TextInput label="Chave PIX (vai nos recibos e cobranças)" value={pix} onChange={setPix} placeholder="CPF, e-mail, telefone ou chave aleatória" maxLength={140} />
    </BottomSheet>
  );
}

export function IntegridadeSheet({ onClose }) {
  const { integridade } = useApp();
  return (
    <BottomSheet open onClose={onClose} title="Integridade do Livro-Razão">
      {integridade.ok ? (
        <p className="text-[15px] text-[#8E8E93] leading-relaxed">Os 4 potes do caixa batem com a soma de todos os lançamentos, e o Capital na Rua bate com os contratos ativos. Cada operação é conferida antes de ser salva; se algo não bater, ela é desfeita.</p>
      ) : (
        <>
          <p className="text-[15px] text-[#FF453A] leading-relaxed">Foram encontradas inconsistências. O app está em modo somente leitura para não piorar o problema. Baixe um backup antes de qualquer outra ação.</p>
          <ul className="space-y-2">{integridade.erros.slice(0, 8).map((e, i) => <li key={i} className="text-[13px] text-[#8E8E93] bg-[#2C2C2E] rounded-xl px-3 py-2">{e}</li>)}</ul>
        </>
      )}
    </BottomSheet>
  );
}

export function AjustesScreen() {
  const { state, hoje, user, run, setDiscreto, reloadUser, bloquear, sair, integridade, readOnly } = useApp();
  const toast = useToast();
  const [sheet, setSheet] = useState(null);
  const [pinFlow, setPinFlow] = useState(null);
  const c = state.config;
  const resumo = { clientes: Object.keys(state.clientes).length, contratos: Object.keys(state.contratos).length, lancamentos: state.ledger.length };

  const setSim = (iso) => run((s) => Engine.atualizarConfig(s, { dataSimulada: iso }), { config: true });
  const ligarSim = (on) => { if (on) setSim(Engine.hojeReal()); else { setSim(null); toast('Voltou para a data real.', 'info'); } };

  const opcoesLock = [{ value: 0, label: 'Nunca' }, { value: 30, label: '30s' }, { value: 60, label: '1 min' }, { value: 120, label: '2 min' }, { value: 300, label: '5 min' }];
  const setLock = (seg) => { Auth.configurarAutoLock(user.id, seg); reloadUser(); };

  return (
    <div className="pb-4">
      <ScreenHeader title="Ajustes" />
      <div className="px-4 space-y-1">
        <Card>
          <Row icon="user" label={user.nome} hint={'@' + user.usuario} right="" />
          <Row icon="logout" label="Sair da conta" danger last onClick={() => setSheet('sair')} />
        </Card>

        <SectionTitle>Segurança</SectionTitle>
        <Card>
          <Row icon="lock" label="PIN de 4 dígitos" hint={user.temPin ? 'Bloqueia o app ao sair ou ficar parado' : 'Recomendado: bloqueia o app'} right={<Pill tone={user.temPin ? 'green' : 'gray'}>{user.temPin ? 'Ativo' : 'Desligado'}</Pill>}
            onClick={() => (user.temPin ? setSheet('pin') : setPinFlow('criar'))} />
          {user.temPin && (
            <div className="px-4 py-3 border-b border-white/10">
              <p className="text-[15px] mb-2">Bloquear automaticamente após</p>
              <Segmented value={user.autoLockSeg} onChange={setLock} options={opcoesLock} />
            </div>
          )}
          {user.temPin && <Row icon="lock" label="Bloquear agora" onClick={bloquear} />}
          <Row icon="shield" label="Alterar senha principal" last onClick={() => setSheet('senha')} />
        </Card>

        <SectionTitle>Privacidade</SectionTitle>
        <Card>
          <Row icon={c.modoDiscreto ? 'eyeOff' : 'eye'} label="Modo discreto" hint="Troca todos os valores por R$ •••••" right={<Switch checked={c.modoDiscreto} onChange={setDiscreto} label="Modo discreto" />} last />
        </Card>

        <SectionTitle>Regras do negócio</SectionTitle>
        <Card>
          <Row icon="sliders" label="Taxas, encargos e chave PIX" hint="Padrões para novos contratos" onClick={() => setSheet('taxas')} last />
        </Card>

        <SectionTitle>Testes</SectionTitle>
        <Card>
          <Row icon="clock" label="Simular data de hoje" hint="Viagem no tempo: vencimentos, atrasos e fechamento usam esta data" right={<Switch checked={!!c.dataSimulada} onChange={ligarSim} label="Simular data" />} last={!c.dataSimulada} />
          {c.dataSimulada && (
            <div className="px-4 py-3">
              <input type="date" aria-label="Data simulada" value={c.dataSimulada} onChange={(e) => { if (e.target.value) setSim(e.target.value); }}
                className="w-full h-14 rounded-2xl bg-[#2C2C2E] px-4 text-white outline-none focus:ring-2 focus:ring-[#FF9F0A]" />
              <p className="text-[12px] text-[#8E8E93] mt-2">Hoje no app: <b className="text-[#FF9F0A]">{Engine.fmtDataBR(hoje)}</b> · data real: {Engine.fmtDataBR(Engine.hojeReal())}</p>
            </div>
          )}
        </Card>

        <SectionTitle>Dados</SectionTitle>
        <Card>
          <Row icon="shield" label="Integridade do Livro-Razão" hint={integridade.ok ? 'Tudo confere' : integridade.erros.length + ' problema(s) encontrado(s)'} right={<Pill tone={integridade.ok ? 'green' : 'red'}>{integridade.ok ? 'OK' : 'Atenção'}</Pill>} onClick={() => setSheet('integridade')} />
          <div className="px-4 py-3" data-testid="card-nuvem">
            <div className="flex items-center justify-between text-[15px]"><span>Dados na nuvem</span><Pill tone="green">Sincronizado</Pill></div>
            <p className="text-[13px] text-[#8E8E93] mt-2 tabular-nums">{resumo.clientes} cliente(s) · {resumo.contratos} contrato(s) · {resumo.lancamentos} lançamento(s)</p>
            <p className="text-[12px] text-[#8E8E93] mt-2 leading-snug">Seus dados ficam na sua conta e abrem em qualquer aparelho. Faça backup em JSON de vez em quando (aba Caixa).</p>
          </div>
        </Card>

        <p className="text-center text-[12px] text-[#636366] pt-4">Finanças · Core Engine v{Engine.VERSAO} · versão de produção</p>
      </div>

      {sheet === 'taxas' && <TaxasSheet onClose={() => setSheet(null)} />}
      {sheet === 'integridade' && <IntegridadeSheet onClose={() => setSheet(null)} />}
      <AlterarSenhaSheet open={sheet === 'senha'} onClose={() => setSheet(null)} user={user} />
      <DesativarPinSheet open={sheet === 'desativar'} onClose={() => setSheet(null)} user={user} onOk={() => { setSheet(null); reloadUser(); toast('PIN desativado.', 'info'); }} />
      <BottomSheet open={sheet === 'pin'} onClose={() => setSheet(null)} title="PIN de 4 dígitos">
        <Btn variant="secondary" onClick={() => { setSheet(null); setPinFlow('trocar'); }}>Trocar PIN</Btn>
        <Btn variant="danger" onClick={() => setSheet('desativar')}>Desativar PIN</Btn>
      </BottomSheet>
      <BottomSheet open={sheet === 'sair'} onClose={() => setSheet(null)} title="Sair da conta?"
        footer={<><Btn variant="danger" onClick={sair}>Sair</Btn><Btn variant="secondary" onClick={() => setSheet(null)}>Cancelar</Btn></>}>
        <p className="text-[15px] text-[#8E8E93] leading-relaxed">Seus dados continuam salvos na nuvem. Para voltar, entre com e-mail e senha.</p>
      </BottomSheet>
      {pinFlow && (
        <FullOverlay>
          <PinFlow user={user} modo={pinFlow} onCancel={() => setPinFlow(null)} onDone={() => { setPinFlow(null); reloadUser(); toast(pinFlow === 'criar' ? 'PIN ativado.' : 'PIN alterado.', 'ok'); }} />
        </FullOverlay>
      )}
    </div>
  );
}

/* ---------- Barra inferior (backdrop-blur-xl) ---------- */
export const TABS = [
  { id: 'inicio', label: 'Início', icon: 'home' },
  { id: 'clientes', label: 'Clientes', icon: 'users' },
  { id: 'caixa', label: 'Caixa', icon: 'dollar' },
  { id: 'ajustes', label: 'Ajustes', icon: 'sliders' },
];
export function TabBar({ aba, onChange }) {
  return (
    <nav aria-label="Navegação principal" className="absolute bottom-0 inset-x-0 z-30 border-t border-white/10 bg-[#1C1C1E]/70 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-4">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => { vibrar(8); onChange(t.id); }} aria-current={aba === t.id ? 'page' : undefined} data-testid={'tab-' + t.id}
            className={cx('h-[62px] flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition active:scale-95', aba === t.id ? 'text-[#0A84FF]' : 'text-[#8E8E93]')}>
            <Icon name={t.icon} size={26} strokeWidth={aba === t.id ? 2.4 : 1.9} />
            {t.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
