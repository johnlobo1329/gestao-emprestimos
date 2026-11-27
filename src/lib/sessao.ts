/**
 * Sessão do app = Supabase Auth (e-mail + senha, no servidor) + PIN local do aparelho.
 *
 * - Conta: login/cadastro/senha via Supabase. A senha NUNCA fica no aparelho.
 * - Auth: PIN de 4 dígitos guardado só neste aparelho (hash com sal). Bloqueia a TELA;
 *   quem protege os dados é o login + RLS. "Esqueci o PIN" exige a senha da conta.
 */
import AppCore from './appcore';
import { supabase } from './supabase/client';

export interface UsuarioApp {
  id: string; nome: string; usuario: string; email: string; temPin: boolean; autoLockSeg: number;
}

/* ---------------- PIN local ---------------- */
interface PinLocal { pin: { salt: string; hash: string } | null; autoLockSeg: number; falhas: number; bloqueadoAte: number }
const chavePin = (uid: string) => 'financas.pin.' + uid;

function lerPin(uid: string): PinLocal {
  try {
    const raw = window.localStorage.getItem(chavePin(uid));
    if (raw) { const o = JSON.parse(raw); return { pin: o.pin || null, autoLockSeg: Number.isInteger(o.autoLockSeg) ? o.autoLockSeg : 120, falhas: o.falhas || 0, bloqueadoAte: o.bloqueadoAte || 0 }; }
  } catch { /* storage bloqueado: segue sem PIN */ }
  return { pin: null, autoLockSeg: 120, falhas: 0, bloqueadoAte: 0 };
}
function gravarPin(uid: string, p: PinLocal) {
  try { window.localStorage.setItem(chavePin(uid), JSON.stringify(p)); } catch { /* sem storage */ }
}
function igual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export const Auth = {
  temPin: (uid: string) => !!lerPin(uid).pin,
  autoLock: (uid: string) => lerPin(uid).autoLockSeg,

  definirPin(uid: string, pin: string) {
    if (!/^\d{4}$/.test(String(pin))) return { ok: false as const, erro: 'PIN_FORMATO', mensagem: 'O PIN precisa ter exatamente 4 dígitos.' };
    const p = lerPin(uid);
    const salt = AppCore.randomHex(16);
    p.pin = { salt, hash: AppCore.hashSegredo(String(pin), salt, 10000) };
    p.falhas = 0; p.bloqueadoAte = 0;
    gravarPin(uid, p);
    return { ok: true as const };
  },

  verificarPin(uid: string, pin: string) {
    const p = lerPin(uid);
    if (!p.pin) return { ok: false as const, erro: 'SEM_PIN', restantes: 0, esperaSeg: 0 };
    const agora = Date.now();
    if (p.bloqueadoAte > agora) return { ok: false as const, erro: 'BLOQUEADO', esperaSeg: Math.ceil((p.bloqueadoAte - agora) / 1000), restantes: 0 };
    if (igual(AppCore.hashSegredo(String(pin), p.pin.salt, 10000), p.pin.hash)) { p.falhas = 0; p.bloqueadoAte = 0; gravarPin(uid, p); return { ok: true as const }; }
    p.falhas++;
    const espera = AppCore.esperaPorFalhas(p.falhas);
    if (espera > 0) p.bloqueadoAte = agora + espera * 1000;
    gravarPin(uid, p);
    return { ok: false as const, erro: espera > 0 ? 'BLOQUEADO' : 'PIN_INCORRETO', esperaSeg: espera, restantes: Math.max(0, AppCore.MAX_TENTATIVAS_LIVRES - p.falhas) };
  },

  removerPin(uid: string) { const p = lerPin(uid); p.pin = null; p.falhas = 0; p.bloqueadoAte = 0; gravarPin(uid, p); },

  configurarAutoLock(uid: string, seg: number) {
    if (!Number.isInteger(seg) || seg < 0 || seg > 3600) return { ok: false as const };
    const p = lerPin(uid); p.autoLockSeg = seg; gravarPin(uid, p);
    return { ok: true as const };
  },
};

/* ---------------- Conta (Supabase Auth) ---------------- */
function montarUsuario(u: { id: string; email?: string | null; user_metadata?: Record<string, unknown> }): UsuarioApp {
  const email = String(u.email || '');
  const nome = String((u.user_metadata && u.user_metadata.nome) || email.split('@')[0] || 'Você');
  return { id: u.id, nome, usuario: email, email, temPin: Auth.temPin(u.id), autoLockSeg: Auth.autoLock(u.id) };
}

type ErroAuth = { status?: number; message?: string; code?: string };
function classificar(e: ErroAuth | null | undefined) {
  const m = String((e && e.message) || '').toLowerCase();
  if (e && e.status === 429) return 'MUITAS_TENTATIVAS';
  if (m.includes('invalid login') || m.includes('invalid credentials')) return 'CREDENCIAIS';
  if (m.includes('not confirmed')) return 'NAO_CONFIRMADO';
  if (m.includes('already') && m.includes('registered')) return 'EXISTE';
  if (m.includes('password') && m.includes('characters')) return 'SENHA_CURTA';
  if (m.includes('fetch') || m.includes('network')) return 'REDE';
  return 'OUTRO';
}

export const Conta = {
  /** Usuário da sessão salva (renova o token sozinho) ou null. */
  async sessao(): Promise<UsuarioApp | null> {
    const { data } = await supabase().auth.getSession();
    return data.session ? montarUsuario(data.session.user) : null;
  },

  async entrar(email: string, senha: string) {
    try {
      const { data, error } = await supabase().auth.signInWithPassword({ email: String(email).trim().toLowerCase(), password: senha });
      if (error || !data.user) return { ok: false as const, erro: classificar(error), mensagem: error?.message };
      return { ok: true as const, usuario: montarUsuario(data.user) };
    } catch (e) { return { ok: false as const, erro: 'REDE', mensagem: String((e as Error).message) }; }
  },

  async cadastrar(d: { nome: string; email: string; senha: string }) {
    const nome = String(d.nome || '').trim();
    const email = String(d.email || '').trim().toLowerCase();
    if (nome.length < 2 || nome.length > 40) return { ok: false as const, erro: 'NOME', mensagem: 'Informe um nome de 2 a 40 letras.' };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false as const, erro: 'EMAIL', mensagem: 'Informe um e-mail válido.' };
    if (String(d.senha || '').length < 6) return { ok: false as const, erro: 'SENHA', mensagem: 'A senha precisa ter pelo menos 6 caracteres.' };
    try {
      const { data, error } = await supabase().auth.signUp({ email, password: d.senha, options: { data: { nome } } });
      if (error) return { ok: false as const, erro: classificar(error), mensagem: error.message };
      // e-mail já cadastrado: o Supabase devolve usuário "falso" sem identidades (proteção contra enumeração)
      if (data.user && data.user.identities && data.user.identities.length === 0) return { ok: false as const, erro: 'EXISTE', mensagem: 'Este e-mail já tem conta. Use "Entrar".' };
      if (!data.session) return { ok: true as const, confirmar: true as const };
      return { ok: true as const, confirmar: false as const, usuario: montarUsuario(data.session.user) };
    } catch (e) { return { ok: false as const, erro: 'REDE', mensagem: String((e as Error).message) }; }
  },

  async sair() { try { await supabase().auth.signOut(); } catch { /* sem rede: o token local é descartado mesmo assim */ } },

  /** Reconfirma a senha da conta (usado em "Esqueci o PIN", "Desativar PIN", "Alterar senha"). */
  async verificarSenha(email: string, senha: string) {
    try {
      const { error } = await supabase().auth.signInWithPassword({ email, password: senha });
      if (error) return { ok: false as const, erro: classificar(error) };
      return { ok: true as const };
    } catch { return { ok: false as const, erro: 'REDE' }; }
  },

  async alterarSenha(email: string, atual: string, nova: string) {
    if (String(nova || '').length < 6) return { ok: false as const, erro: 'SENHA', mensagem: 'A nova senha precisa ter pelo menos 6 caracteres.' };
    const v = await Conta.verificarSenha(email, atual);
    if (!v.ok) return v;
    try {
      const { error } = await supabase().auth.updateUser({ password: nova });
      if (error) return { ok: false as const, erro: classificar(error), mensagem: error.message };
      return { ok: true as const };
    } catch { return { ok: false as const, erro: 'REDE' }; }
  },

  /** Nova senha logo após o link do e-mail de recuperação (a sessão de recuperação já está ativa). */
  async definirNovaSenha(nova: string) {
    if (String(nova || '').length < 6) return { ok: false as const, erro: 'SENHA', mensagem: 'A senha precisa ter pelo menos 6 caracteres.' };
    try {
      const { error } = await supabase().auth.updateUser({ password: nova });
      return error ? { ok: false as const, erro: classificar(error), mensagem: error.message } : { ok: true as const };
    } catch { return { ok: false as const, erro: 'REDE' }; }
  },

  /** E-mail de redefinição de senha (link volta para este site). */
  async esqueciSenha(email: string) {
    try {
      const { error } = await supabase().auth.resetPasswordForEmail(String(email).trim().toLowerCase(), { redirectTo: window.location.origin });
      return error ? { ok: false as const, erro: classificar(error) } : { ok: true as const };
    } catch { return { ok: false as const, erro: 'REDE' }; }
  },
};
