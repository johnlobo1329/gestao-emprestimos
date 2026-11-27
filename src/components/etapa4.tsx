// @ts-nocheck — porte fiel do protótipo aprovado (lógica de tela intacta).
'use client';
/* eslint-disable */
import React, { useState, useEffect, useRef, useMemo, useCallback, useContext, createContext } from 'react';
import { createPortal } from 'react-dom';
import Engine from '@/lib/engine';
import { BottomSheet, Btn, Card, CurrencyInput, Icon, Money, PercentInput, Pill, Row, SectionTitle, Segmented, baixarTexto, cx, useApp, useToast } from './ui';
import { CICLOS_UI, PERIODOS, dataCurta } from './clientes';
import { DateField, copiarTexto, mascararMsg, msgErro } from './operacao';

/* ============================================================================
 * 60-etapa4.jsx — Calculadora de Balcão, Backup (JSON/CSV), Importar backup,
 * Arquivar período e medidor de armazenamento.
 * Só chama a API pública do motor; nada aqui refaz cálculo financeiro.
 * ========================================================================== */

export const PERIODO_TXT = { DIARIA: 'diárias (sem domingos)', SEMANAL: 'semanais', QUINZENAL: 'quinzenais', MENSAL: 'mensais' };

export function montarProposta(p) {
  const L = ['*Proposta de empréstimo*', 'Valor: ' + Engine.fmtBRL(p.principal)];
  if (p.giro) {
    L.push('Modalidade: Giro ' + p.ciclo.toLowerCase() + ' (' + Engine.CICLOS[p.ciclo] + ' dias)');
    L.push('Juros do ciclo (' + Engine.fmtPercent(p.taxaBp) + '): ' + Engine.fmtBRL(p.giro.juros));
    L.push('Total no vencimento: ' + Engine.fmtBRL(p.giro.totalNoVencimento));
    L.push('Vencimento: ' + Engine.fmtDataBR(p.giro.vencimento));
    L.push('Você pode renovar pagando só os juros do ciclo.');
  } else {
    const ps = p.parc.parcelas;
    L.push('Modalidade: Parcelado em ' + p.n + 'x ' + PERIODO_TXT[p.per]);
    L.push('Parcela: ' + Engine.fmtBRL(ps[0].valor));
    L.push('Juros total (' + Engine.fmtPercent(p.taxaBp) + '): ' + Engine.fmtBRL(p.parc.jurosTotal));
    L.push('Total a pagar: ' + Engine.fmtBRL(p.parc.total));
    L.push('Primeiro vencimento: ' + Engine.fmtDataBR(ps[0].venc));
    if (ps.length > 1) L.push('Último vencimento: ' + Engine.fmtDataBR(ps[ps.length - 1].venc));
  }
  L.push('');
  L.push('Proposta simulada em ' + Engine.fmtDataBR(p.data) + '. Sujeita a confirmação.');
  return L.join('\n');
}

/* ---------- Calculadora de Balcão ---------- */
export function CalculadoraSheet({ onClose }) {
  const { state, hoje } = useApp();
  const toast = useToast();
  const cfg = state.config;
  const [tipo, setTipo] = useState('GIRO');
  const [principal, setPrincipal] = useState(0);
  const [ciclo, setCiclo] = useState('MENSAL');
  const [taxaGiro, setTaxaGiro] = useState(cfg.taxaPadraoBp.MENSAL);
  const [taxaParc, setTaxaParc] = useState(cfg.taxaParceladoBp === undefined ? cfg.taxaPadraoBp.MENSAL : cfg.taxaParceladoBp);
  const [n, setN] = useState(4);
  const [per, setPer] = useState('SEMANAL');
  const [data, setData] = useState(hoje);
  const dataOk = /^\d{4}-\d{2}-\d{2}$/.test(data);

  const sim = useMemo(() => {
    if (principal < 100 || !dataOk) return null;
    try {
      return tipo === 'GIRO' ? { giro: Engine.simularGiro(principal, taxaGiro, ciclo, data) } : { parc: Engine.simularParcelado(principal, taxaParc, n, per, data) };
    } catch (e) { return { erro: e instanceof Engine.EngineError ? e.message : 'Dados inválidos.' }; }
  }, [tipo, principal, taxaGiro, taxaParc, ciclo, n, per, data, dataOk]);

  const proposta = sim && !sim.erro ? montarProposta({ principal, ciclo, taxaBp: tipo === 'GIRO' ? taxaGiro : taxaParc, n, per, data, giro: sim.giro, parc: sim.parc }) : null;
  const copiar = async () => { const ok = await copiarTexto(proposta); toast(ok ? 'Proposta copiada.' : 'Não consegui copiar. Use o WhatsApp.', ok ? 'ok' : 'erro'); };
  const giro = sim && sim.giro, parc = sim && sim.parc;

  return (
    <BottomSheet open onClose={onClose} title="Calculadora de Balcão"
      footer={<>
        <Btn variant="green" disabled={!proposta} onClick={copiar}>Copiar proposta</Btn>
        {proposta
          ? <a href={'https://wa.me/?text=' + encodeURIComponent(proposta)} target="_blank" rel="noopener noreferrer" data-testid="proposta-whatsapp"
              className="w-full h-11 rounded-2xl bg-[#2C2C2E] text-white text-[15px] font-semibold flex items-center justify-center gap-2 active:scale-95 transition"><Icon name="chat" size={18} /> Enviar no WhatsApp</a>
          : <Btn variant="secondary" size="md" disabled>Enviar no WhatsApp</Btn>}
      </>}>
      <p className="text-[13px] text-[#8E8E93] leading-snug">Simulação rápida: não grava nada e não mexe no caixa.</p>
      <Segmented value={tipo} onChange={setTipo} options={[{ value: 'GIRO', label: 'Giro / Renovável' }, { value: 'PARCELADO', label: 'Parcelado' }]} />
      <CurrencyInput label="Valor a emprestar" cents={principal} onChange={setPrincipal} autoFocus />
      {tipo === 'GIRO' ? (
        <>
          <div><p className="text-[13px] font-medium text-[#8E8E93] mb-1.5 px-1">Ciclo</p><Segmented value={ciclo} onChange={(c) => { setCiclo(c); setTaxaGiro(cfg.taxaPadraoBp[c]); }} options={CICLOS_UI} /></div>
          <PercentInput label="Juros por ciclo" bp={taxaGiro} onChange={setTaxaGiro} />
        </>
      ) : (
        <>
          <div><p className="text-[13px] font-medium text-[#8E8E93] mb-1.5 px-1">Periodicidade</p><Segmented value={per} onChange={setPer} options={PERIODOS} /></div>
          <div>
            <p className="text-[13px] font-medium text-[#8E8E93] mb-1.5 px-1">Número de parcelas</p>
            <div className="flex items-center gap-3">
              <button type="button" aria-label="Menos uma parcela" onClick={() => setN(Math.max(1, n - 1))} className="h-14 w-14 rounded-2xl bg-[#2C2C2E] text-[24px] font-semibold active:scale-95 transition">−</button>
              <div className="flex-1 h-14 rounded-2xl bg-[#2C2C2E] flex items-center justify-center text-[22px] font-bold tabular-nums" data-testid="calc-n">{n}x</div>
              <button type="button" aria-label="Mais uma parcela" onClick={() => setN(Math.min(120, n + 1))} className="h-14 w-14 rounded-2xl bg-[#2C2C2E] text-[24px] font-semibold active:scale-95 transition">+</button>
            </div>
            <div className="flex gap-2 mt-2">
              {[3, 4, 10, 20, 30].map((v) => <button key={v} type="button" onClick={() => setN(v)} className={cx('flex-1 h-9 rounded-full text-[14px] font-semibold active:scale-95 transition', n === v ? 'bg-[#0A84FF] text-white' : 'bg-[#2C2C2E] text-[#8E8E93]')}>{v}x</button>)}
            </div>
          </div>
          <PercentInput label="Juros total do contrato" bp={taxaParc} onChange={setTaxaParc} />
        </>
      )}
      <DateField label="Data do empréstimo" value={data} onChange={setData} />
      {giro && (
        <div className="rounded-2xl bg-[#2C2C2E] p-4 space-y-1.5" data-testid="calc-giro">
          <div className="flex justify-between text-[15px]"><span className="text-[#8E8E93]">Juros do ciclo</span><Money cents={giro.juros} className="font-semibold" /></div>
          <div className="flex justify-between text-[15px]"><span className="text-[#8E8E93]">Total no vencimento</span><Money cents={giro.totalNoVencimento} className="font-bold" /></div>
          <div className="flex justify-between text-[15px]"><span className="text-[#8E8E93]">Vencimento</span><span className="font-semibold tabular-nums">{Engine.fmtDataBR(giro.vencimento)}</span></div>
        </div>
      )}
      {parc && (
        <div className="rounded-2xl bg-[#2C2C2E] p-4 space-y-1.5" data-testid="calc-parcelado">
          <div className="flex justify-between text-[15px]"><span className="text-[#8E8E93]">{n}x de</span><Money cents={parc.parcelas[0].valor} className="font-bold" /></div>
          <div className="flex justify-between text-[15px]"><span className="text-[#8E8E93]">Juros total</span><Money cents={parc.jurosTotal} className="font-semibold" /></div>
          <div className="flex justify-between text-[15px]"><span className="text-[#8E8E93]">Total a pagar</span><Money cents={parc.total} className="font-bold" /></div>
          <div className="flex justify-between text-[15px]"><span className="text-[#8E8E93]">Vencimentos</span><span className="font-semibold tabular-nums">{dataCurta(parc.parcelas[0].venc)} → {Engine.fmtDataBR(parc.parcelas[parc.parcelas.length - 1].venc)}</span></div>
        </div>
      )}
      {sim && sim.erro && <p className="text-[14px] text-[#FF453A] px-1" role="alert">{sim.erro}</p>}
      {state.config.modoDiscreto && proposta && <p className="text-[12px] text-[#8E8E93]">Modo Discreto: valores ocultos na tela. A proposta copiada e enviada leva os valores completos.</p>}
    </BottomSheet>
  );
}

/* ---------- Importar backup ---------- */
export function ImportarSheet({ novo, nomeArquivo, onClose }) {
  const { state, hoje, run } = useApp();
  const toast = useToast();
  const [enviando, setEnviando] = useState(false);
  const cont = (s) => ({ cli: Object.keys(s.clientes).length, con: Object.keys(s.contratos).length, led: s.ledger.length });
  const a = cont(state), b = cont(novo);
  const baixarAtual = () => baixarTexto('financas-backup-antes-da-importacao-' + hoje + '.json', Engine.exportarJSON(state));
  const confirmar = () => {
    if (enviando) return;
    setEnviando(true);
    const r = run(() => ({ state: novo }), { config: true });
    if (r.ok) { toast('Backup importado.', 'ok'); onClose(); } else setEnviando(false);
  };
  const linha = (rot, x, y) => <div className="flex justify-between text-[14px]"><span className="text-[#8E8E93]">{rot}</span><span className="tabular-nums font-semibold">{x} → {y}</span></div>;
  return (
    <BottomSheet open onClose={onClose} title="Importar backup"
      footer={<>
        <Btn variant="danger" onClick={confirmar} disabled={enviando}>Substituir meus dados</Btn>
        <Btn variant="ghost" size="md" onClick={onClose}>Cancelar</Btn>
      </>}>
      <p className="text-[15px] text-[#8E8E93] leading-snug">O arquivo <b className="text-white break-all">{nomeArquivo}</b> é um backup válido e confere com o Livro-Razão. Importar <b className="text-white">substitui tudo</b> que está na sua conta.</p>
      <div className="rounded-2xl bg-[#2C2C2E] p-4 space-y-1.5" data-testid="importar-resumo">
        {linha('Clientes', a.cli, b.cli)}
        {linha('Contratos', a.con, b.con)}
        {linha('Lançamentos', a.led, b.led)}
        <div className="flex justify-between text-[14px]"><span className="text-[#8E8E93]">Capital Disponível</span><span className="font-semibold"><Money cents={state.caixa.disp} /> → <Money cents={novo.caixa.disp} /></span></div>
      </div>
      <Btn variant="secondary" size="md" onClick={baixarAtual}>Baixar backup atual antes (recomendado)</Btn>
    </BottomSheet>
  );
}

/* ---------- Arquivar período ---------- */
export function ArquivarSheet({ onClose }) {
  const { state, hoje, run } = useApp();
  const toast = useToast();
  const discreto = state.config.modoDiscreto;
  const limite = Engine.addDias(hoje, -31);
  const [ate, setAte] = useState(Engine.addDias(hoje, -90));
  const [enviando, setEnviando] = useState(false);
  const dataOk = /^\d{4}-\d{2}-\d{2}$/.test(ate);

  const pv = useMemo(() => {
    if (!dataOk) return { erro: 'Informe a data de corte.' };
    try { return { ok: Engine.previaArquivamento(state, { ate, hoje }) }; } catch (e) { return { erro: msgErro(e) }; }
  }, [state, ate, hoje, dataOk]);

  const confirmar = () => {
    if (!pv.ok || enviando) return;
    setEnviando(true);
    let res;
    try { res = Engine.arquivarPeriodo(state, { ate, hoje }); } catch (e) { toast(msgErro(e), 'erro'); setEnviando(false); return; }
    // 1º o arquivo vai para o seu aparelho; só depois os dados saem do app.
    baixarTexto('financas-arquivo-ate-' + ate + '.json', JSON.stringify(res.arquivo));
    const r = run(() => res);
    if (r.ok) { toast('Arquivado: ' + res.resumo.qtdLancamentos + ' lançamentos de ' + res.resumo.qtdContratos + ' contratos.', 'ok'); onClose(); } else setEnviando(false);
  };
  const atalho = (rot, dias) => <button type="button" onClick={() => setAte(Engine.addDias(hoje, -dias))} className={cx('flex-1 h-9 rounded-full text-[14px] font-semibold active:scale-95 transition', ate === Engine.addDias(hoje, -dias) ? 'bg-[#0A84FF] text-white' : 'bg-[#2C2C2E] text-[#8E8E93]')}>{rot}</button>;

  return (
    <BottomSheet open onClose={onClose} title="Arquivar período"
      footer={<>
        <Btn variant="orange" onClick={confirmar} disabled={!pv.ok || enviando}>Baixar arquivo e arquivar</Btn>
        <Btn variant="ghost" size="md" onClick={onClose}>Cancelar</Btn>
      </>}>
      <p className="text-[14px] text-[#8E8E93] leading-snug">Tira do app os contratos <b className="text-white">encerrados</b> (quitados, perdas, cancelados) e os movimentos soltos até a data de corte, para o armazenamento ficar leve. Os saldos dos 4 potes <b className="text-white">não mudam</b>: o histórico vira um único lançamento “Saldo arquivado”. Contratos ativos nunca saem.</p>
      <DateField label="Arquivar até" value={ate} onChange={setAte} />
      <div className="flex gap-2">{atalho('90 dias', 90)}{atalho('180 dias', 180)}{atalho('1 ano', 365)}</div>
      <p className="text-[12px] text-[#8E8E93] px-1">Só vale para datas com mais de 30 dias (até {Engine.fmtDataBR(limite)}), para não bagunçar o “recebido nos últimos 30 dias”.</p>
      {pv.erro && <p className="text-[14px] text-[#FF9F0A] px-1" role="alert" data-testid="arq-erro">{mascararMsg(pv.erro, discreto)}</p>}
      {pv.ok && (
        <div className="rounded-2xl bg-[#2C2C2E] p-4 space-y-1" data-testid="arq-previa">
          <p className="text-[16px] font-semibold">{pv.ok.qtdLancamentos} lançamentos serão arquivados</p>
          <p className="text-[14px] text-[#8E8E93]">{pv.ok.qtdContratos} {pv.ok.qtdContratos === 1 ? 'contrato encerrado' : 'contratos encerrados'} saem da ficha dos clientes.</p>
        </div>
      )}
      <p className="text-[13px] text-[#FF9F0A] leading-snug">O app baixa um arquivo .json com todo o detalhe antes de arquivar. Guarde esse arquivo: depois, esses contratos não podem mais ser estornados no app.</p>
    </BottomSheet>
  );
}

/* ---------- cartão Relatórios & Backup (aba Caixa) ---------- */
export function RelatoriosCard() {
  const { state, hoje } = useApp();
  const toast = useToast();
  const [sheet, setSheet] = useState(null);
  const inputRef = useRef(null);
  const nLanc = state.ledger.length;

  const exportarJSON = () => { baixarTexto('financas-backup-' + hoje + '.json', Engine.exportarJSON(state)); toast('Backup JSON baixado.', 'ok'); };
  const exportarCSV = () => { baixarTexto('financas-livro-razao-' + hoje + '.csv', '﻿' + Engine.ledgerParaCSV(state), 'text/csv;charset=utf-8'); toast('CSV do Livro-Razão baixado.', 'ok'); };

  const aoEscolherArquivo = (ev) => {
    const f = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!f) return;
    const rd = new FileReader();
    rd.onerror = () => toast('Não consegui ler o arquivo.', 'erro');
    rd.onload = () => {
      try { setSheet({ t: 'importar', novo: Engine.importarJSON(String(rd.result)), nome: f.name }); }
      catch (e) { toast(msgErro(e) === 'Valores inválidos.' ? 'Arquivo inválido.' : e.message, 'erro'); }
    };
    rd.readAsText(f);
  };

  return (
    <div className="px-4">
      <SectionTitle>Relatórios e backup</SectionTitle>
      <Card data-testid="card-backup">
        <Row icon="database" label="Exportar backup (JSON)" hint="Tudo: clientes, contratos, Livro-Razão e ajustes" onClick={exportarJSON} />
        <Row icon="database" label="Exportar Livro-Razão (CSV)" hint="Abre no Excel; um lançamento por linha" onClick={exportarCSV} />
        <Row icon="repeat" label="Importar backup (JSON)" hint="Substitui os dados da sua conta" onClick={() => { if (inputRef.current) inputRef.current.click(); }} />
        <Row icon="shield" label="Arquivar período" hint="Tira contratos encerrados antigos do app" onClick={() => setSheet({ t: 'arquivar' })} last />
      </Card>
      <input ref={inputRef} type="file" accept=".json,application/json" onChange={aoEscolherArquivo} className="hidden" data-testid="input-importar" aria-label="Escolher arquivo de backup" />
      <Card className="p-4 mt-3" data-testid="card-armazenamento">
        <div className="flex items-center justify-between">
          <p className="text-[15px] font-semibold">Dados na nuvem</p>
          <Pill tone={nLanc > 20000 ? 'orange' : 'green'}>{nLanc} lançamentos</Pill>
        </div>
        <p className="text-[12px] text-[#8E8E93] mt-2 leading-snug">{nLanc > 20000 ? 'Muitos lançamentos: arquive períodos antigos para o app abrir mais rápido.' : 'Sem limite de 5 MB como no protótipo. Tudo certo.'}</p>
      </Card>
      {sheet && sheet.t === 'arquivar' && <ArquivarSheet onClose={() => setSheet(null)} />}
      {sheet && sheet.t === 'importar' && <ImportarSheet novo={sheet.novo} nomeArquivo={sheet.nome} onClose={() => setSheet(null)} />}
    </div>
  );
}
