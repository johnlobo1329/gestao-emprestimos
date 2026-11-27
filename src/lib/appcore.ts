// @ts-nocheck
/* eslint-disable */
/* ============================================================================
 * APP CORE — segurança, autenticação local, PIN e armazenamento.
 *
 * Módulo puro (sem React, sem DOM): roda no navegador (window.AppCore) e no
 * Node (testes). Tudo que toca em relógio/armazenamento/aleatório é injetado.
 *
 * AVISO HONESTO (Professor Didático): esta é uma proteção de TELA, não um
 * cofre. Os dados ficam no LocalStorage do navegador, sem criptografia.
 * Senha e PIN impedem que alguém curioso use o app; não impedem quem tem
 * acesso ao computador e sabe abrir as ferramentas do navegador. A segurança
 * de verdade chega na migração para Supabase (login no servidor).
 * ========================================================================== */
const AppCore = (function () {
  'use strict';

  /* ======================================================================
   * 1. SHA-256 em JS puro (não depende de crypto.subtle: funciona em file://)
   * ==================================================================== */
  const K = new Array(64);
  const H0 = new Array(8);
  (function init() {
    let n = 2, c = 0;
    const fr = function (x) { return x - Math.floor(x); };
    while (c < 64) {
      let primo = true;
      for (let i = 2; i * i <= n; i++) { if (n % i === 0) { primo = false; break; } }
      if (primo) {
        if (c < 8) H0[c] = Math.floor(fr(Math.sqrt(n)) * 4294967296) >>> 0;
        K[c] = Math.floor(fr(Math.cbrt(n)) * 4294967296) >>> 0;
        c++;
      }
      n++;
    }
  })();

  function sha256(msg) {
    const l = msg.length;
    const padLen = ((l + 9 + 63) >> 6) << 6;
    const buf = new Uint8Array(padLen);
    buf.set(msg);
    buf[l] = 0x80;
    const dv = new DataView(buf.buffer);
    dv.setUint32(padLen - 8, Math.floor(l / 0x20000000));
    dv.setUint32(padLen - 4, (l << 3) >>> 0);
    let h0 = H0[0], h1 = H0[1], h2 = H0[2], h3 = H0[3], h4 = H0[4], h5 = H0[5], h6 = H0[6], h7 = H0[7];
    const w = new Uint32Array(64);
    for (let off = 0; off < padLen; off += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
      for (let i = 16; i < 64; i++) {
        const a = w[i - 15], b = w[i - 2];
        const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
        const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }
      let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
      for (let i = 0; i < 64; i++) {
        const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
        const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
      h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
    }
    const out = new Uint8Array(32);
    const ov = new DataView(out.buffer);
    [h0, h1, h2, h3, h4, h5, h6, h7].forEach(function (v, i) { ov.setUint32(i * 4, v); });
    return out;
  }

  function utf8(s) { return new TextEncoder().encode(String(s)); }
  function toHex(u8) { let s = ''; for (let i = 0; i < u8.length; i++) s += u8[i].toString(16).padStart(2, '0'); return s; }
  function concat(a, b) { const r = new Uint8Array(a.length + b.length); r.set(a); r.set(b, a.length); return r; }
  function sha256Hex(str) { return toHex(sha256(utf8(str))); }

  const ITER_PADRAO = 10000;
  /** Hash com sal e iterações (esticamento simples). */
  function hashSegredo(segredo, saltHex, iter) {
    const salt = utf8(saltHex);
    let h = sha256(concat(salt, utf8('|' + segredo)));
    for (let i = 0; i < (iter || ITER_PADRAO); i++) h = sha256(concat(h, salt));
    return toHex(h);
  }

  function randomHex(nBytes) {
    const a = new Uint8Array(nBytes);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(a);
    else for (let i = 0; i < nBytes; i++) a[i] = Math.floor(Math.random() * 256);
    return toHex(a);
  }

  function igual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    let r = 0;
    for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return r === 0;
  }

  /* ======================================================================
   * 2. ARMAZENAMENTO (com fallback em memória se o navegador bloquear)
   * ==================================================================== */
  function memoriaStorage() {
    const m = {};
    return {
      persistente: false,
      get length() { return Object.keys(m).length; },
      key: function (i) { return Object.keys(m)[i] === undefined ? null : Object.keys(m)[i]; },
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
      setItem: function (k, v) { m[k] = String(v); },
      removeItem: function (k) { delete m[k]; },
    };
  }

  /** Escolhe localStorage se funcionar de verdade; senão memória (e avisa). */
  function escolherStorage(win) {
    try {
      const ls = win && win.localStorage;
      if (!ls) throw new Error('sem localStorage');
      const t = 'fin4.__teste__';
      ls.setItem(t, '1');
      if (ls.getItem(t) !== '1') throw new Error('leitura falhou');
      ls.removeItem(t);
      ls.persistente = true;
      return ls;
    } catch (e) {
      return memoriaStorage();
    }
  }

  function ehQuota(e) {
    return !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014 || /quota/i.test(String(e.name) + String(e.message)));
  }

  const P = 'fin4.';
  const CHAVE_USERS = P + 'users';
  const CHAVE_SESSAO = P + 'session';
  const chaveDados = function (userId) { return P + 'data.' + userId; };

  function criarStore(deps) {
    const st = deps.storage;
    const engine = deps.engine;

    function carregarEstado(userId) {
      let raw;
      try { raw = st.getItem(chaveDados(userId)); } catch (e) { return { ok: false, erro: 'LEITURA', bruto: null }; }
      if (raw === null || raw === undefined) return { ok: true, novo: true, state: engine.novoEstado(), integridade: { ok: true, erros: [] } };
      let obj;
      try { obj = JSON.parse(raw); } catch (e) { return { ok: false, erro: 'JSON_INVALIDO', bruto: raw }; }
      const forma = obj && obj.versao === engine.VERSAO && obj.caixa && obj.contratos && obj.clientes && Array.isArray(obj.ledger) && obj.config && obj.seq;
      if (!forma) return { ok: false, erro: 'VERSAO_OU_FORMA', bruto: raw };
      let integridade;
      try { integridade = engine.verificarIntegridade(obj); } catch (e) { integridade = { ok: false, erros: ['Verificador falhou: ' + e.message] }; }
      return { ok: true, novo: false, state: obj, integridade: integridade };
    }

    function salvarEstado(userId, state) {
      try {
        st.setItem(chaveDados(userId), JSON.stringify(state));
        return { ok: true };
      } catch (e) {
        return { ok: false, erro: ehQuota(e) ? 'QUOTA' : 'FALHA', mensagem: String(e && e.message) };
      }
    }

    function zerarEstado(userId) { st.removeItem(chaveDados(userId)); }

    /** Caracteres usados por todas as chaves do app (estimativa do uso do limite ~5 milhões). */
    function uso() {
      let total = 0;
      for (let i = 0; i < st.length; i++) {
        const k = st.key(i);
        if (k && k.indexOf(P) === 0) { const v = st.getItem(k); total += k.length + (v ? v.length : 0); }
      }
      return { caracteres: total, limite: 5000000, pct: Math.min(100, Math.round((total / 5000000) * 1000) / 10) };
    }

    return { carregarEstado: carregarEstado, salvarEstado: salvarEstado, zerarEstado: zerarEstado, uso: uso, chaveDados: chaveDados };
  }

  /* ======================================================================
   * 3. AUTENTICAÇÃO LOCAL, SESSÃO, PIN
   * ==================================================================== */
  const MAX_TENTATIVAS_LIVRES = 5;
  /** 5ª falha seguida = 30 s; cada falha extra dobra, teto de 15 min. */
  function esperaPorFalhas(falhas) {
    if (falhas < MAX_TENTATIVAS_LIVRES) return 0;
    return Math.min(900, 30 * Math.pow(2, falhas - MAX_TENTATIVAS_LIVRES));
  }

  function criarAuth(deps) {
    const st = deps.storage;
    const agora = deps.agora || function () { return Date.now(); };
    const iter = deps.iter || ITER_PADRAO;

    function lerUsers() {
      try {
        const raw = st.getItem(CHAVE_USERS);
        if (!raw) return { versao: 1, usuarios: [] };
        const o = JSON.parse(raw);
        return o && Array.isArray(o.usuarios) ? o : { versao: 1, usuarios: [] };
      } catch (e) { return { versao: 1, usuarios: [] }; }
    }
    function gravarUsers(o) { st.setItem(CHAVE_USERS, JSON.stringify(o)); }
    function publico(u) {
      return { id: u.id, nome: u.nome, usuario: u.usuario, temPin: !!u.pin, autoLockSeg: u.autoLockSeg, criadoEm: u.criadoEm };
    }
    function achar(o, userId) { return o.usuarios.find(function (u) { return u.id === userId; }); }
    function restaEspera(bloqueadoAte) { return Math.max(0, Math.ceil((bloqueadoAte - agora()) / 1000)); }

    function listar() { return lerUsers().usuarios.map(publico); }

    function cadastrar(d) {
      const nome = String((d && d.nome) || '').trim();
      const usuario = String((d && d.usuario) || '').trim().toLowerCase();
      const senha = String((d && d.senha) || '');
      if (nome.length < 2 || nome.length > 40) return { ok: false, erro: 'NOME', mensagem: 'Informe um nome de 2 a 40 letras.' };
      if (!/^[a-z0-9._-]{3,24}$/.test(usuario)) return { ok: false, erro: 'USUARIO', mensagem: 'Usuário: 3 a 24 caracteres (letras, números, ponto, traço).' };
      if (senha.length < 6) return { ok: false, erro: 'SENHA', mensagem: 'A senha precisa ter pelo menos 6 caracteres.' };
      const o = lerUsers();
      if (o.usuarios.some(function (u) { return u.usuario === usuario; })) return { ok: false, erro: 'USUARIO_EXISTE', mensagem: 'Este usuário já existe neste aparelho.' };
      const salt = randomHex(16);
      const u = {
        id: 'u' + randomHex(6), nome: nome, usuario: usuario, salt: salt, iter: iter, hash: hashSegredo(senha, salt, iter),
        pin: null, autoLockSeg: 120, senhaFalhas: 0, senhaBloqueadoAte: 0, pinFalhas: 0, pinBloqueadoAte: 0, criadoEm: new Date(agora()).toISOString(),
      };
      o.usuarios.push(u);
      gravarUsers(o);
      st.setItem(CHAVE_SESSAO, JSON.stringify({ userId: u.id, desde: agora() }));
      return { ok: true, usuario: publico(u) };
    }

    /** Confere a senha principal respeitando o bloqueio por tentativas. */
    function _conferirSenha(o, u, senha) {
      if (u.senhaBloqueadoAte > agora()) return { ok: false, erro: 'BLOQUEADO', esperaSeg: restaEspera(u.senhaBloqueadoAte) };
      if (igual(hashSegredo(String(senha || ''), u.salt, u.iter), u.hash)) {
        u.senhaFalhas = 0; u.senhaBloqueadoAte = 0; gravarUsers(o);
        return { ok: true };
      }
      u.senhaFalhas++;
      const espera = esperaPorFalhas(u.senhaFalhas);
      if (espera > 0) u.senhaBloqueadoAte = agora() + espera * 1000;
      gravarUsers(o);
      return { ok: false, erro: espera > 0 ? 'BLOQUEADO' : 'SENHA_INCORRETA', esperaSeg: espera, restantes: Math.max(0, MAX_TENTATIVAS_LIVRES - u.senhaFalhas) };
    }

    function entrar(usuario, senha) {
      const o = lerUsers();
      const u = o.usuarios.find(function (x) { return x.usuario === String(usuario || '').trim().toLowerCase(); });
      if (!u) {
        // custo equivalente para não revelar se o usuário existe pelo tempo de resposta
        hashSegredo(String(senha || ''), '0'.repeat(32), iter);
        return { ok: false, erro: 'CREDENCIAIS' };
      }
      const r = _conferirSenha(o, u, senha);
      if (!r.ok) return r.erro === 'SENHA_INCORRETA' ? { ok: false, erro: 'CREDENCIAIS', restantes: r.restantes } : r;
      st.setItem(CHAVE_SESSAO, JSON.stringify({ userId: u.id, desde: agora() }));
      return { ok: true, usuario: publico(u) };
    }

    function sessao() {
      try {
        const raw = st.getItem(CHAVE_SESSAO);
        if (!raw) return null;
        const s = JSON.parse(raw);
        const u = achar(lerUsers(), s.userId);
        return u ? publico(u) : null;
      } catch (e) { return null; }
    }

    function sair() { st.removeItem(CHAVE_SESSAO); }

    function temPin(userId) { const u = achar(lerUsers(), userId); return !!(u && u.pin); }

    function definirPin(userId, pin) {
      if (!/^\d{4}$/.test(String(pin))) return { ok: false, erro: 'PIN_FORMATO', mensagem: 'O PIN precisa ter exatamente 4 dígitos.' };
      const o = lerUsers(); const u = achar(o, userId);
      if (!u) return { ok: false, erro: 'USUARIO' };
      const salt = randomHex(16);
      u.pin = { salt: salt, hash: hashSegredo(String(pin), salt, u.iter) };
      u.pinFalhas = 0; u.pinBloqueadoAte = 0;
      gravarUsers(o);
      return { ok: true };
    }

    function verificarPin(userId, pin) {
      const o = lerUsers(); const u = achar(o, userId);
      if (!u || !u.pin) return { ok: false, erro: 'SEM_PIN' };
      if (u.pinBloqueadoAte > agora()) return { ok: false, erro: 'BLOQUEADO', esperaSeg: restaEspera(u.pinBloqueadoAte) };
      if (igual(hashSegredo(String(pin), u.pin.salt, u.iter), u.pin.hash)) {
        u.pinFalhas = 0; u.pinBloqueadoAte = 0; gravarUsers(o);
        return { ok: true };
      }
      u.pinFalhas++;
      const espera = esperaPorFalhas(u.pinFalhas);
      if (espera > 0) u.pinBloqueadoAte = agora() + espera * 1000;
      gravarUsers(o);
      return { ok: false, erro: espera > 0 ? 'BLOQUEADO' : 'PIN_INCORRETO', esperaSeg: espera, restantes: Math.max(0, MAX_TENTATIVAS_LIVRES - u.pinFalhas) };
    }

    function verificarSenha(userId, senha) {
      const o = lerUsers(); const u = achar(o, userId);
      if (!u) return { ok: false, erro: 'USUARIO' };
      return _conferirSenha(o, u, senha);
    }

    /** Remove o PIN após conferir a senha principal (recuperação / desativação). */
    function removerPinComSenha(userId, senha) {
      const o = lerUsers(); const u = achar(o, userId);
      if (!u) return { ok: false, erro: 'USUARIO' };
      const r = _conferirSenha(o, u, senha);
      if (!r.ok) return r;
      u.pin = null; u.pinFalhas = 0; u.pinBloqueadoAte = 0;
      gravarUsers(o);
      return { ok: true };
    }

    function alterarSenha(userId, atual, nova) {
      if (String(nova || '').length < 6) return { ok: false, erro: 'SENHA', mensagem: 'A nova senha precisa ter pelo menos 6 caracteres.' };
      const o = lerUsers(); const u = achar(o, userId);
      if (!u) return { ok: false, erro: 'USUARIO' };
      const r = _conferirSenha(o, u, atual);
      if (!r.ok) return r;
      u.salt = randomHex(16); u.iter = iter; u.hash = hashSegredo(String(nova), u.salt, u.iter);
      gravarUsers(o);
      return { ok: true };
    }

    function configurarAutoLock(userId, seg) {
      const o = lerUsers(); const u = achar(o, userId);
      if (!u || !Number.isInteger(seg) || seg < 0 || seg > 3600) return { ok: false };
      u.autoLockSeg = seg; gravarUsers(o);
      return { ok: true };
    }

    return {
      listar: listar, cadastrar: cadastrar, entrar: entrar, sessao: sessao, sair: sair,
      temPin: temPin, definirPin: definirPin, verificarPin: verificarPin, verificarSenha: verificarSenha,
      removerPinComSenha: removerPinComSenha, alterarSenha: alterarSenha, configurarAutoLock: configurarAutoLock,
    };
  }

  return {
    sha256Hex: sha256Hex, hashSegredo: hashSegredo, randomHex: randomHex, esperaPorFalhas: esperaPorFalhas,
    memoriaStorage: memoriaStorage, escolherStorage: escolherStorage, criarStore: criarStore, criarAuth: criarAuth,
    CHAVE_USERS: CHAVE_USERS, CHAVE_SESSAO: CHAVE_SESSAO, chaveDados: chaveDados, MAX_TENTATIVAS_LIVRES: MAX_TENTATIVAS_LIVRES,
  };
})();

export default AppCore;
