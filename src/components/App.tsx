// @ts-nocheck — raiz do app (porte do protótipo + integração Supabase)
'use client';
/* eslint-disable */
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Engine from '@/lib/engine';
import { Conta } from '@/lib/sessao';
import { supabase } from '@/lib/supabase/client';
import { carregarEstado, Sincronizador } from '@/lib/persistencia';
import { AppCtx, UICtx, ToastHost, ErrorBoundary, Banner, Btn, Icon, useToast } from './ui';
import { HomeScreen, CaixaScreen, AjustesScreen, TabBar } from './screens';
import { ClientesScreen } from './clientes';
import { ClienteScreen, ContratoScreen } from './operacao';
import { AuthScreen, PinFlow, LockScreen, RedefinirSenhaScreen } from './auth-screens';

/** Moldura de celular (430px) + camada dos bottom sheets. */
function Frame({ children }) {
  const [pronto, setPronto] = useState(false);
  useEffect(() => setPronto(true), []);
  return (
    <div id="frame">
      <div id="root">{pronto ? children : null}</div>
      <div id="overlay-root" />
    </div>
  );
}

function Splash({ msg }) {
  return (
    <div className="splash">
      <div className="dot" />
      <b>Finanças</b>
      <span>{msg || 'Carregando…'}</span>
    </div>
  );
}

function ErroCarga({ mensagem, tentar, sair }) {
  return (
    <div className="h-full overflow-y-auto px-6 pt-[calc(env(safe-area-inset-top)+48px)] pb-10 flex flex-col items-center text-center gap-4">
      <span className="text-[#FF453A]"><Icon name="alert" size={48} /></span>
      <h1 className="text-[24px] font-bold">Não consegui abrir seus dados</h1>
      <p className="text-[15px] text-[#8E8E93] leading-relaxed">{mensagem}</p>
      <p className="text-[14px] text-[#8E8E93] leading-relaxed">Nada foi apagado nem alterado. Confira a internet e tente de novo.</p>
      <Btn variant="primary" onClick={tentar}>Tentar de novo</Btn>
      <Btn variant="ghost" onClick={sair}>Sair da conta</Btn>
    </div>
  );
}

function Workspace({ user, reloadUser, bloquear, sair }) {
  const [carga, setCarga] = useState(null);
  const [erro, setErro] = useState(null);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let vivo = true;
    setCarga(null); setErro(null);
    carregarEstado(supabase(), user.id)
      .then((c) => { if (vivo) setCarga(c); })
      .catch((e) => { if (vivo) setErro(String(e && e.message ? e.message : e)); });
    return () => { vivo = false; };
  }, [user.id, tentativa]);

  if (erro) return <ErroCarga mensagem={erro} tentar={() => setTentativa((t) => t + 1)} sair={sair} />;
  if (!carga) return <Splash msg="Abrindo sua banca…" />;
  return <WorkspaceOk key={user.id + ':' + tentativa} user={user} carga={carga} reloadUser={reloadUser} bloquear={bloquear} sair={sair} />;
}

function WorkspaceOk({ user, carga, reloadUser, bloquear, sair }) {
  const toastRaw = useToast();
  const [state, setState] = useState(carga.estado);
  const stateRef = useRef(carga.estado);
  const [falha, setFalha] = useState(null);       // { tipo, mensagem } => escrita travada
  const [aba, setAba] = useState('inicio');
  const [pilha, setPilha] = useState([]);          // telas empilhadas sobre a aba (ficha do cliente, contrato)
  const [, setTick] = useState(0);
  const mainRef = useRef(null);
  const [sync] = useState(() => new Sincronizador(supabase(), carga.estado, carga.versao, { onFalha: (f) => setFalha(f) }));

  const integridade = useMemo(() => Engine.verificarIntegridade(state), [state]);
  const baseOk = carga.integridade.ok && integridade.ok;
  const readOnly = !baseOk || !!falha;
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  const falhaRef = useRef(null);
  falhaRef.current = falha;

  const hoje = Engine.hojeEfetivo(state);
  const discreto = state.config.modoDiscreto;

  /** Mensagens de erro do motor trazem valores (R$): no Modo Discreto, mascara. */
  const toast = useCallback((m, k) => {
    let txt = String(m).replace(/\b[Aa]porte\b/g, '+ Entrada').replace(/\b[Ss]angria\b/g, '- Saída');
    if (stateRef.current.config.modoDiscreto) txt = txt.replace(/-?R\$ [\d.]+,\d{2}/g, 'R$ •••••');
    toastRaw(txt, k);
  }, [toastRaw]);

  /**
   * ÚNICO caminho de escrita do app:
   * motor (memória) -> confere integridade -> tela atualiza na hora -> fila grava só a diferença no Supabase (RPC atômica).
   * Se a gravação falhar, a escrita é travada e o app pede para recarregar (o banco nunca fica pela metade).
   */
  const run = useCallback((op, opts) => {
    const o = opts || {};
    if (falhaRef.current) { toast('Escrita pausada: recarregue os dados.', 'erro'); return { ok: false }; }
    if (readOnlyRef.current && !o.config) { toast('Livro-Razão com inconsistência: modo somente leitura.', 'erro'); return { ok: false }; }
    try {
      const r = op(stateRef.current);
      if (!o.config) {
        const v = Engine.verificarIntegridade(r.state);
        if (!v.ok) { console.error('Integridade violada:', v.erros); toast('Operação desfeita: falha de integridade interna.', 'erro'); return { ok: false }; }
      }
      stateRef.current = r.state;
      setState(r.state);
      sync.enfileirar(r.state, r.arquivo ? { ate: r.arquivo.ate, conteudo: r.arquivo } : undefined);
      return { ok: true, res: r };
    } catch (e) {
      if (e instanceof Engine.EngineError) toast(e.message, 'erro');
      else { console.error(e); toast('Erro inesperado: ' + e.message, 'erro'); }
      return { ok: false, erro: e };
    }
  }, [sync, toast]);

  const setDiscreto = useCallback((v) => { run((s) => Engine.atualizarConfig(s, { modoDiscreto: v }), { config: true }); }, [run]);

  const ir = useCallback((tela) => setPilha((p) => p.concat([tela])), []);
  const voltar = useCallback(() => setPilha((p) => p.slice(0, -1)), []);
  const trocarAba = useCallback((id) => { setPilha([]); setAba(id); }, []);

  /** Sair só depois que tudo foi gravado. */
  const sairSeguro = useCallback(async () => { try { await sync.esperar(); } catch (e) {} sair(); }, [sync, sair]);

  useEffect(() => { if (mainRef.current) mainRef.current.scrollTop = 0; }, [aba, pilha.length]);

  /* vira o dia sem precisar recarregar */
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  /* bloqueio automático por inatividade */
  const lastRef = useRef(Date.now());
  useEffect(() => {
    const toque = () => { lastRef.current = Date.now(); };
    const evs = ['pointerdown', 'keydown', 'touchstart', 'scroll'];
    evs.forEach((e) => window.addEventListener(e, toque, { passive: true, capture: true }));
    const expirou = () => user.temPin && user.autoLockSeg > 0 && Date.now() - lastRef.current > user.autoLockSeg * 1000;
    const id = setInterval(() => { if (expirou()) bloquear(); }, 1000);
    const vis = () => { if (document.visibilityState === 'visible' && expirou()) bloquear(); };
    document.addEventListener('visibilitychange', vis);
    return () => {
      evs.forEach((e) => window.removeEventListener(e, toque, { capture: true }));
      clearInterval(id);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [user.temPin, user.autoLockSeg, bloquear]);

  /* outro aparelho gravou? (a cada 30 s e ao voltar para o app): trava escrita para não sobrescrever */
  useEffect(() => {
    const checar = () => { sync.verificarAtualizacao(user.id); };
    const id = setInterval(checar, 30000);
    const vis = () => { if (document.visibilityState === 'visible') checar(); };
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', vis); };
  }, [sync, user.id]);

  /* fechar a aba com gravação pendente: avisa */
  useEffect(() => {
    const h = (e) => { if (sync.estaOcupado) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [sync]);

  const ctx = useMemo(() => ({
    user, state, hoje, run, readOnly, integridade, setDiscreto, reloadUser, bloquear, sair: sairSeguro, ir, voltar,
  }), [user, state, hoje, run, readOnly, integridade, setDiscreto, reloadUser, bloquear, sairSeguro, ir, voltar]);

  const banners = [];
  if (falha) {
    const sessao = falha.tipo === 'SESSAO';
    banners.push(
      <Banner key="c" tone="red" action={<button type="button" onClick={() => (sessao ? sairSeguro() : window.location.reload())} className="rounded-full bg-[#FF453A] text-white px-3 h-8 text-[13px] font-semibold active:scale-95">{sessao ? 'Entrar' : 'Recarregar'}</button>}>
        {falha.mensagem} {sessao ? '' : 'Recarregue para continuar sem perder nada.'}
      </Banner>
    );
  }
  if (!baseOk) banners.push(<Banner key="i" tone="red"><button type="button" className="text-left" onClick={() => trocarAba('ajustes')}>Livro-Razão com inconsistência. Modo somente leitura. Toque para ver.</button></Banner>);
  if (state.config.dataSimulada) banners.push(
    <Banner key="d" tone="orange" icon="clock" action={<button type="button" onClick={() => run((s) => Engine.atualizarConfig(s, { dataSimulada: null }), { config: true })} className="rounded-full bg-[#FF9F0A] text-black px-3 h-8 text-[13px] font-semibold active:scale-95">Voltar ao real</button>}>
      Data simulada: <b>{Engine.fmtDataBR(hoje)}</b>
    </Banner>
  );

  return (
    <AppCtx.Provider value={ctx}>
      <UICtx.Provider value={{ discreto }}>
        <div className="h-full flex flex-col relative bg-black">
          <main ref={mainRef} data-testid="main" className="flex-1 min-h-0 overflow-y-auto pb-[calc(78px+env(safe-area-inset-bottom))]">
            {banners.length > 0 && <div className="sticky top-0 z-20 bg-black/90 backdrop-blur-xl pt-[env(safe-area-inset-top)]" data-testid="banners">{banners}</div>}
            {pilha.length > 0 ? (() => {
              const topo = pilha[pilha.length - 1];
              return topo.t === 'cliente' ? <ClienteScreen key={'c' + topo.id} id={topo.id} /> : <ContratoScreen key={'k' + topo.id} id={topo.id} />;
            })() : (
              <>
                {aba === 'inicio' && <HomeScreen />}
                {aba === 'clientes' && <ClientesScreen />}
                {aba === 'caixa' && <CaixaScreen />}
                {aba === 'ajustes' && <AjustesScreen />}
              </>
            )}
          </main>
          <TabBar aba={aba} onChange={trocarAba} />
        </div>
      </UICtx.Provider>
    </AppCtx.Provider>
  );
}

function App() {
  const [user, setUser] = useState(undefined);       // undefined = verificando sessão
  const [trava, setTrava] = useState(false);
  const [fluxoPin, setFluxoPin] = useState(null);
  const [recuperando, setRecuperando] = useState(false);

  useEffect(() => {
    let vivo = true;
    Conta.sessao().then((u) => { if (!vivo) return; setUser(u); setTrava(!!(u && u.temPin)); }).catch(() => { if (vivo) setUser(null); });
    const { data } = supabase().auth.onAuthStateChange((evento) => {
      if (evento === 'PASSWORD_RECOVERY') setRecuperando(true);
      if (evento === 'SIGNED_OUT') { setUser(null); setTrava(false); setFluxoPin(null); }
    });
    return () => { vivo = false; data.subscription.unsubscribe(); };
  }, []);

  const reloadUser = useCallback(() => { Conta.sessao().then((u) => setUser(u)); }, []);
  const bloquear = useCallback(() => setTrava(true), []);
  const sair = useCallback(async () => { await Conta.sair(); setUser(null); setTrava(false); setFluxoPin(null); }, []);
  const onEntrou = (u, novo) => { setUser(u); setTrava(false); setFluxoPin(novo ? 'criar' : null); };

  if (user === undefined) return <Splash msg="Verificando sua sessão…" />;
  if (recuperando) return <RedefinirSenhaScreen onConcluir={() => { setRecuperando(false); reloadUser(); }} />;
  if (!user) return <AuthScreen onEntrou={onEntrou} />;
  if (fluxoPin) {
    return <PinFlow user={user} modo="criar" cancelLabel="Pular por enquanto" onCancel={() => setFluxoPin(null)} onDone={() => { setFluxoPin(null); reloadUser(); }} />;
  }
  if (trava && user.temPin) {
    return <LockScreen user={user} onUnlock={() => setTrava(false)} onSair={sair} onPinRemovido={() => { reloadUser(); setTrava(false); setFluxoPin('criar'); }} />;
  }
  return <Workspace key={user.id} user={user} reloadUser={reloadUser} bloquear={bloquear} sair={sair} />;
}

export default function Raiz() {
  return (
    <Frame>
      <ErrorBoundary>
        <ToastHost>
          <App />
        </ToastHost>
      </ErrorBoundary>
    </Frame>
  );
}
