// @ts-nocheck — porte fiel do protótipo aprovado (lógica de tela intacta).
'use client';
/* eslint-disable */
import React, { useState, useEffect, useRef, useMemo, useCallback, useContext, createContext } from 'react';
import { createPortal } from 'react-dom';
import Engine from '@/lib/engine';
import { Auth, Conta } from '@/lib/sessao';
import { BottomSheet, Btn, Icon, PinPad, Segmented, TextInput, useToast, vibrar } from './ui';

/* ============================================================================
 * 20-auth.jsx — Login/Cadastro, Bloqueio por PIN, criação/troca/recuperação
 * ========================================================================== */

/** Contagem regressiva em segundos (para bloqueios por tentativas). */
export function useEspera() {
  const [seg, setSeg] = useState(0);
  useEffect(() => {
    if (seg <= 0) return undefined;
    const id = setTimeout(() => setSeg((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [seg]);
  return [seg, setSeg];
}

export function Brand({ sub }) {
  return (
    <div className="flex flex-col items-center text-center mb-6">
      <div className="h-[72px] w-[72px] rounded-[22px] bg-gradient-to-br from-[#0A84FF] to-[#30D158] flex items-center justify-center shadow-lg">
        <Icon name="dollar" size={38} strokeWidth={2.4} className="text-white" />
      </div>
      <h1 className="text-[32px] font-bold mt-4">Finanças</h1>
      <p className="text-[15px] text-[#8E8E93] mt-1">{sub}</p>
    </div>
  );
}

/* ---------- Login / Cadastro (Supabase Auth: e-mail + senha) ---------- */
const MSG_ERRO_CONTA = {
  CREDENCIAIS: 'E-mail ou senha incorretos.',
  NAO_CONFIRMADO: 'Confirme seu e-mail: abra a mensagem que enviamos e toque no link.',
  MUITAS_TENTATIVAS: 'Muitas tentativas. Aguarde um minuto e tente de novo.',
  EXISTE: 'Este e-mail já tem conta. Use "Entrar".',
  SENHA_CURTA: 'A senha precisa ter pelo menos 6 caracteres.',
  REDE: 'Sem conexão com a internet. Tente de novo.',
};
const msgConta = (r, padrao) => MSG_ERRO_CONTA[r.erro] || r.mensagem || padrao;

export function AuthScreen({ onEntrou }) {
  const [modo, setModo] = useState('login');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [senha2, setSenha2] = useState('');
  const [erro, setErro] = useState('');
  const [info, setInfo] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const trocarModo = (m) => { setModo(m); setErro(''); setInfo(''); setSenha(''); setSenha2(''); };

  const entrar = async () => {
    setErro(''); setInfo(''); setOcupado(true);
    const r = await Conta.entrar(email, senha);
    setOcupado(false);
    if (r.ok) { onEntrou(r.usuario, false); return; }
    vibrar(60);
    setErro(msgConta(r, 'Não foi possível entrar.'));
  };

  const cadastrar = async () => {
    setErro(''); setInfo('');
    if (senha !== senha2) { setErro('As senhas não conferem.'); vibrar(60); return; }
    setOcupado(true);
    const r = await Conta.cadastrar({ nome, email, senha });
    setOcupado(false);
    if (r.ok && r.confirmar) { setInfo('Conta criada! Enviamos um e-mail de confirmação para ' + email.trim().toLowerCase() + '. Toque no link e depois volte e entre.'); setModo('login'); setSenha(''); setSenha2(''); return; }
    if (r.ok) { onEntrou(r.usuario, true); return; }
    vibrar(60);
    setErro(msgConta(r, 'Não foi possível criar a conta.'));
  };

  const esqueci = async () => {
    setErro(''); setInfo('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) { setErro('Digite seu e-mail no campo acima e toque de novo.'); return; }
    setOcupado(true);
    const r = await Conta.esqueciSenha(email);
    setOcupado(false);
    if (r.ok) setInfo('Se esse e-mail tiver conta, enviamos o link para criar uma nova senha.');
    else setErro(msgConta(r, 'Não foi possível enviar o e-mail.'));
  };

  const enviar = () => { if (!ocupado) (modo === 'login' ? entrar() : cadastrar()); };

  return (
    <div className="h-full overflow-y-auto px-5 pt-[calc(env(safe-area-inset-top)+40px)] pb-[calc(env(safe-area-inset-bottom)+24px)]">
      <Brand sub={modo === 'login' ? 'Entre para abrir sua banca' : 'Crie sua conta'} />
      <div className="mb-5">
        <Segmented value={modo} onChange={trocarModo} options={[{ value: 'login', label: 'Entrar' }, { value: 'cadastro', label: 'Criar conta' }]} />
      </div>
      <div className="space-y-4">
        {modo === 'cadastro' && <TextInput label="Seu nome" value={nome} onChange={setNome} placeholder="Ex.: João da Banca" autoComplete="name" maxLength={40} />}
        <TextInput label="E-mail" type="email" inputMode="email" value={email} onChange={setEmail} placeholder="voce@email.com" autoComplete="email" maxLength={120} onEnter={enviar} />
        <TextInput label="Senha" type="password" value={senha} onChange={setSenha} placeholder={modo === 'cadastro' ? 'Mínimo 6 caracteres' : 'Sua senha'} autoComplete={modo === 'login' ? 'current-password' : 'new-password'} onEnter={enviar} />
        {modo === 'cadastro' && <TextInput label="Repita a senha" type="password" value={senha2} onChange={setSenha2} placeholder="Repita a senha" autoComplete="new-password" onEnter={enviar} />}
      </div>
      <p className="min-h-[24px] mt-3 text-[14px] font-medium px-1" role="alert">
        {erro && <span className="text-[#FF453A]">{erro}</span>}
        {!erro && info && <span className="text-[#30D158]">{info}</span>}
      </p>
      <div className="mt-2">
        <Btn onClick={enviar} disabled={ocupado || !email || !senha}>{ocupado ? 'Aguarde…' : modo === 'login' ? 'Entrar' : 'Criar conta'}</Btn>
      </div>
      {modo === 'login' && <div className="mt-2"><Btn variant="ghost" size="md" onClick={esqueci} disabled={ocupado}>Esqueci minha senha</Btn></div>}
      <p className="text-[13px] text-[#8E8E93] text-center mt-5 leading-relaxed px-2">
        Seus dados ficam <b className="text-white">na nuvem, protegidos pela sua conta</b>, e abrem em qualquer aparelho. O PIN de 4 dígitos
        bloqueia a tela só neste aparelho.
      </p>
    </div>
  );
}

/* ---------- Nova senha (vem do link do e-mail "Esqueci minha senha") ---------- */
export function RedefinirSenhaScreen({ onConcluir }) {
  const toast = useToast();
  const [nova, setNova] = useState('');
  const [nova2, setNova2] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const salvar = async () => {
    setErro('');
    if (nova.length < 6) { setErro('A senha precisa ter pelo menos 6 caracteres.'); return; }
    if (nova !== nova2) { setErro('As senhas não conferem.'); return; }
    setOcupado(true);
    const r = await Conta.definirNovaSenha(nova);
    setOcupado(false);
    if (r.ok) { toast('Senha alterada.', 'ok'); onConcluir(); } else setErro(msgConta(r, 'Não foi possível alterar a senha.'));
  };
  return (
    <div className="h-full overflow-y-auto px-5 pt-[calc(env(safe-area-inset-top)+40px)]">
      <Brand sub="Crie sua nova senha" />
      <div className="space-y-4">
        <TextInput label="Nova senha" type="password" value={nova} onChange={setNova} autoComplete="new-password" placeholder="Mínimo 6 caracteres" />
        <TextInput label="Repita a nova senha" type="password" value={nova2} onChange={setNova2} autoComplete="new-password" onEnter={salvar} error={erro} />
      </div>
      <div className="mt-6"><Btn onClick={salvar} disabled={ocupado || !nova || !nova2}>{ocupado ? 'Aguarde…' : 'Salvar nova senha'}</Btn></div>
    </div>
  );
}

/* ---------- Criar / trocar PIN ---------- */
export function PinFlow({ user, modo, onDone, onCancel, cancelLabel }) {
  const [etapa, setEtapa] = useState(modo === 'trocar' ? 'atual' : 'novo');
  const [novo, setNovo] = useState('');
  const [erro, setErro] = useState('');
  const [chave, setChave] = useState(0);
  const [espera, setEspera] = useEspera();

  const reset = () => setChave((c) => c + 1);
  const falha = (msg) => { setErro(msg); vibrar(60); reset(); };

  const onComplete = (pin) => {
    if (etapa === 'atual') {
      const r = Auth.verificarPin(user.id, pin);
      if (r.ok) { setErro(''); setEtapa('novo'); reset(); return; }
      if (r.erro === 'BLOQUEADO') { setEspera(r.esperaSeg); falha('Muitas tentativas erradas.'); return; }
      falha('PIN incorreto. ' + r.restantes + ' tentativa(s) restante(s).');
      return;
    }
    if (etapa === 'novo') { setNovo(pin); setErro(''); setEtapa('confirma'); reset(); return; }
    if (pin !== novo) { setEtapa('novo'); setNovo(''); falha('Os PINs não conferem. Digite o novo PIN de novo.'); return; }
    const r = Auth.definirPin(user.id, pin);
    if (r.ok) onDone(); else falha(r.mensagem || 'Não foi possível salvar o PIN.');
  };

  const titulos = { atual: 'Digite o PIN atual', novo: modo === 'trocar' ? 'Digite o novo PIN' : 'Crie um PIN de 4 dígitos', confirma: 'Confirme o PIN' };
  const subs = { atual: 'Para trocar, confirme que é você', novo: 'Ele bloqueia o app quando você sai ou fica parado', confirma: 'Digite o mesmo PIN mais uma vez' };

  return (
    <PinPad title={titulos[etapa]} subtitle={espera > 0 ? 'Aguarde ' + espera + 's' : subs[etapa]} erro={erro} shakeKey={chave} disabled={espera > 0} onComplete={onComplete}>
      <Btn variant="ghost" size="md" onClick={onCancel}>{cancelLabel || 'Cancelar'}</Btn>
    </PinPad>
  );
}

/* ---------- Recuperar PIN com a senha principal ---------- */
export function RecuperarPinSheet({ open, onClose, user, onOk }) {
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [espera, setEspera] = useEspera();
  useEffect(() => { if (open) { setSenha(''); setErro(''); } }, [open]);

  const [ocupado, setOcupado] = useState(false);
  const confirmar = async () => {
    setOcupado(true);
    const r = await Conta.verificarSenha(user.email, senha);
    setOcupado(false);
    if (r.ok) { Auth.removerPin(user.id); onOk(); return; }
    vibrar(60);
    setErro(msgConta(r, 'Senha incorreta.').replace('E-mail ou senha incorretos.', 'Senha incorreta.'));
  };
  return (
    <BottomSheet open={open} onClose={onClose} title="Esqueci o PIN"
      footer={<Btn onClick={confirmar} disabled={!senha || ocupado}>{ocupado ? 'Aguarde…' : 'Confirmar e criar novo PIN'}</Btn>}>
      <p className="text-[15px] text-[#8E8E93] leading-relaxed">Digite a <b className="text-white">senha da sua conta</b>. O PIN antigo será removido e você cria um novo em seguida.</p>
      <TextInput label="Senha da conta" type="password" value={senha} onChange={setSenha} autoComplete="current-password" autoFocus onEnter={confirmar} error={erro} />
    </BottomSheet>
  );
}

/* ---------- Tela de bloqueio ---------- */
export function LockScreen({ user, onUnlock, onSair, onPinRemovido }) {
  const [erro, setErro] = useState('');
  const [chave, setChave] = useState(0);
  const [espera, setEspera] = useEspera();
  const [recuperar, setRecuperar] = useState(false);

  const onComplete = (pin) => {
    const r = Auth.verificarPin(user.id, pin);
    if (r.ok) { onUnlock(); return; }
    vibrar(80); setChave((c) => c + 1);
    if (r.erro === 'BLOQUEADO') { setEspera(r.esperaSeg); setErro('Muitas tentativas erradas.'); return; }
    setErro('PIN incorreto. ' + r.restantes + ' tentativa(s) antes do bloqueio.');
  };

  return (
    <div className="h-full relative">
      <PinPad title={'Olá, ' + user.nome.split(' ')[0]} subtitle={espera > 0 ? 'Aguarde ' + espera + 's para tentar de novo' : 'Digite seu PIN'} erro={erro} shakeKey={chave} disabled={espera > 0} onComplete={onComplete}>
        <Btn variant="ghost" size="md" onClick={() => setRecuperar(true)}>Esqueci o PIN</Btn>
        <Btn variant="ghost" size="md" onClick={onSair} className="!text-[#8E8E93]">Sair da conta</Btn>
      </PinPad>
      <RecuperarPinSheet open={recuperar} onClose={() => setRecuperar(false)} user={user} onOk={() => { setRecuperar(false); onPinRemovido(); }} />
    </div>
  );
}

/* ---------- Alterar senha principal (usado em Ajustes) ---------- */
export function AlterarSenhaSheet({ open, onClose, user }) {
  const toast = useToast();
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [nova2, setNova2] = useState('');
  const [erro, setErro] = useState('');
  const [espera, setEspera] = useEspera();
  useEffect(() => { if (open) { setAtual(''); setNova(''); setNova2(''); setErro(''); } }, [open]);

  const [ocupado, setOcupado] = useState(false);
  const salvar = async () => {
    if (nova !== nova2) { setErro('As senhas novas não conferem.'); return; }
    setOcupado(true);
    const r = await Conta.alterarSenha(user.email, atual, nova);
    setOcupado(false);
    if (r.ok) { toast('Senha alterada.', 'ok'); onClose(); return; }
    vibrar(60);
    if (r.erro === 'SENHA') { setErro(r.mensagem); return; }
    setErro(r.erro === 'CREDENCIAIS' ? 'Senha atual incorreta.' : msgConta(r, 'Não foi possível alterar a senha.'));
  };
  return (
    <BottomSheet open={open} onClose={onClose} title="Alterar senha"
      footer={<Btn onClick={salvar} disabled={!atual || !nova || ocupado}>{ocupado ? 'Aguarde…' : 'Salvar nova senha'}</Btn>}>
      <TextInput label="Senha atual" type="password" value={atual} onChange={setAtual} autoComplete="current-password" />
      <TextInput label="Nova senha" type="password" value={nova} onChange={setNova} autoComplete="new-password" placeholder="Mínimo 6 caracteres" />
      <TextInput label="Repita a nova senha" type="password" value={nova2} onChange={setNova2} autoComplete="new-password" error={erro} onEnter={salvar} />
    </BottomSheet>
  );
}

/* ---------- Desativar PIN (exige a senha principal) ---------- */
export function DesativarPinSheet({ open, onClose, user, onOk }) {
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [espera, setEspera] = useEspera();
  useEffect(() => { if (open) { setSenha(''); setErro(''); } }, [open]);
  const [ocupado, setOcupado] = useState(false);
  const confirmar = async () => {
    setOcupado(true);
    const r = await Conta.verificarSenha(user.email, senha);
    setOcupado(false);
    if (r.ok) { Auth.removerPin(user.id); onOk(); return; }
    vibrar(60);
    setErro(msgConta(r, 'Senha incorreta.').replace('E-mail ou senha incorretos.', 'Senha incorreta.'));
  };
  return (
    <BottomSheet open={open} onClose={onClose} title="Desativar PIN"
      footer={<Btn variant="danger" onClick={confirmar} disabled={!senha || ocupado}>{ocupado ? 'Aguarde…' : 'Desativar PIN'}</Btn>}>
      <p className="text-[15px] text-[#8E8E93] leading-relaxed">Sem PIN, qualquer pessoa com acesso a este navegador abre o app direto neste aparelho. Confirme com a senha da sua conta.</p>
      <TextInput label="Senha da conta" type="password" value={senha} onChange={setSenha} autoComplete="current-password" autoFocus onEnter={confirmar} error={erro} />
    </BottomSheet>
  );
}
