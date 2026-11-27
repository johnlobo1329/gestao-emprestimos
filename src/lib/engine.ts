// @ts-nocheck  — motor v4 portado 1:1 do protótipo (mesma lógica, mesmos 69 testes). Tipos públicos em ./types.ts
/* eslint-disable */
/* ============================================================================
 * CORE ENGINE v4 — Motor financeiro (100% em centavos inteiros)
 *
 * Módulo puro: não toca em tela, LocalStorage nem relógio (exceto o carimbo
 * `ts` de auditoria, que pode ser injetado). Todas as operações recebem um
 * `state` e devolvem um NOVO state (o original nunca é alterado). Se algo
 * falhar, lança EngineError e o state original continua intacto.
 *
 * Funciona no Node (testes) e no navegador (window.Engine, file://).
 *
 * Decisões fechadas com o dono (ver doc do Projeto):
 *  1A  Parcelado = juros "flat" sobre o total; valor da parcela fixo, sobra de
 *      centavos na última; juros distribuído por soma acumulada (nunca < 0).
 *  2   Multa/mora sobre Montante Total (padrão) ou Principal; regras copiadas
 *      para dentro do contrato na criação; Giro vencido NÃO gera ciclo novo;
 *      Parcelado cobra encargo por parcela; carência sáb/dom -> segunda.
 *  3A  Pro-rata é só sugestão de desconto; cobra-se o juros cheio do ciclo.
 *  4   Ordem de abatimento: Encargos -> Juros -> Principal. Desconto consome
 *      a frente da fila, depois o dinheiro. Excesso é bloqueado. Cenários B/C/D
 *      sempre perguntam "Manter Dia Fixo" ou "+Ciclo a partir de Hoje".
 *  5   Juros Pendente: saldo separado, sem juros sobre juros e sem mora.
 *      Parcelado: baixa por parcela; sobra adianta a próxima; menor = Parcial.
 *  6A  Lucro é pote separado; Reinvestir move Lucro -> Disponível; Sangria
 *      escolhe a origem; nunca deixa pote negativo; Perdas é pote próprio.
 *  7B  Estorno por contrato (última baixa/perda ativa daquele contrato),
 *      por lançamento inverso; Aporte/Sangria não são estornáveis.
 * ========================================================================== */
const Engine = (function () {
  'use strict';

  /* ======================================================================
   * 0. ERROS E CONSTANTES
   * ==================================================================== */
  class EngineError extends Error {
    constructor(code, message, extra) {
      super(message || code);
      this.name = 'EngineError';
      this.code = code;
      this.extra = extra || null;
    }
  }

  const MAX_CENTS = 100000000000; // R$ 1 bilhão: teto de sanidade
  const CICLOS = { MENSAL: 30, QUINZENAL: 15, SEMANAL: 7 };
  const PERIODICIDADES = { DIARIA: 1, SEMANAL: 7, QUINZENAL: 15, MENSAL: 30 };
  const SCORE_INICIAL = 40; // em décimos: 40 = 4,0 estrelas
  const SCORE_MIN = 10;
  const SCORE_MAX = 50;
  const VERSAO = 4;

  const STATUS_LABEL = {
    EM_DIA: 'Em Dia',
    VENCE_HOJE: 'Vence Hoje',
    ATRASADO: 'Atrasado',
    PROMESSA: 'Promessa Agendada',
    ACORDO: 'Acordo / Congelado',
    QUITADO: 'Quitado',
    PERDA: 'Perda / Incobrável',
    CANCELADO: 'Cancelado',
  };

  const CENARIO_LABEL = {
    A: 'Quitação Integral',
    B: 'Só Juros / Renovação Pura',
    C: 'Parcial / Amortização',
    D: 'A Menor dos Juros',
    PARCELA: 'Pagamento de Parcela',
  };

  /* ======================================================================
   * 1. DINHEIRO (centavos inteiros)
   * ==================================================================== */
  function assertCents(v, nome, opts) {
    const o = opts || {};
    const min = o.min === undefined ? 0 : o.min;
    if (!Number.isSafeInteger(v) || v < min || v > MAX_CENTS) {
      throw new EngineError('VALOR_INVALIDO', (nome || 'Valor') + ' inválido (inteiro em centavos, mín. ' + min + ').', { nome: nome, valor: v });
    }
    return v;
  }

  function assertBp(v, nome, max) {
    if (!Number.isSafeInteger(v) || v < 0 || v > (max || 100000)) {
      throw new EngineError('TAXA_INVALIDA', (nome || 'Taxa') + ' inválida (pontos-base inteiros).', { nome: nome, valor: v });
    }
    return v;
  }

  /** round-half-up de (a*b/c) sem estourar precisão (BigInt). */
  function mulDivRound(a, b, c) {
    if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || !Number.isSafeInteger(c) || a < 0 || b < 0 || c <= 0) {
      throw new EngineError('ARITMETICA', 'mulDivRound exige inteiros não negativos e divisor > 0.');
    }
    return Number((BigInt(a) * BigInt(b) * 2n + BigInt(c)) / (BigInt(c) * 2n));
  }

  /** centavos × taxa em pontos-base (10000 bp = 100%), arredondando meio-para-cima. */
  function mulBp(cents, bp) {
    return mulDivRound(cents, bp, 10000);
  }

  function fmtBRL(cents) {
    const neg = cents < 0;
    const a = Math.abs(cents);
    const reais = Math.floor(a / 100);
    const cent = a % 100;
    const s = String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (neg ? '-' : '') + 'R$ ' + s + ',' + String(cent).padStart(2, '0');
  }

  /** "1.234,56" sem o prefixo R$ (para campos de input). */
  function fmtNumBR(cents) {
    return fmtBRL(cents).replace(/^-?R\$ /, '');
  }

  /** Máscara de moeda da direita p/ esquerda: recebe o texto digitado, devolve centavos. */
  function centavosDeDigitos(texto, maxDigitos) {
    const d = String(texto || '').replace(/\D/g, '').slice(0, maxDigitos || 11);
    return d ? Number(d) : 0;
  }

  /** "20", "20,5", "20.25" -> pontos-base (2000, 2050, 2025). Sem float. */
  function parsePercentBp(texto) {
    const t = String(texto || '').trim().replace(',', '.');
    if (!/^\d+(\.\d{0,2})?$/.test(t)) throw new EngineError('TAXA_INVALIDA', 'Taxa inválida: ' + texto);
    const partes = t.split('.');
    const frac = ((partes[1] || '') + '00').slice(0, 2);
    return Number(partes[0]) * 100 + Number(frac);
  }

  function fmtPercent(bp) {
    const i = Math.floor(bp / 100);
    const f = bp % 100;
    if (f === 0) return i + '%';
    return i + ',' + (f % 10 === 0 ? String(f / 10) : String(f).padStart(2, '0')) + '%';
  }

  /* ======================================================================
   * 2. DATAS (strings ISO "YYYY-MM-DD", sem fuso: contagem de dias UTC)
   * ==================================================================== */
  function parseISO(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
    if (!m) throw new EngineError('DATA_INVALIDA', 'Data inválida: ' + s);
    const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    const d = new Date(t);
    if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) {
      throw new EngineError('DATA_INVALIDA', 'Data inexistente: ' + s);
    }
    return Math.round(t / 86400000);
  }
  function fromDayNum(n) { return new Date(n * 86400000).toISOString().slice(0, 10); }
  function diasEntre(a, b) { return parseISO(b) - parseISO(a); } // b - a
  function addDias(iso, n) { return fromDayNum(parseISO(iso) + n); }
  /** 0=Dom ... 6=Sáb (1970-01-01 foi quinta = 4) */
  function diaSemana(iso) { return (((parseISO(iso) + 4) % 7) + 7) % 7; }
  function fmtDataBR(iso) { return iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4); }
  function hojeReal() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  /** "Hoje" do app: data simulada (viagem no tempo) ou a real. */
  function hojeEfetivo(state, real) { return (state.config && state.config.dataSimulada) || real || hojeReal(); }

  /** Sáb/Dom -> segunda (carência), se ligada. */
  function vencEfetivo(venc, carenciaFds) {
    if (!carenciaFds) return venc;
    const dw = diaSemana(venc);
    if (dw === 6) return addDias(venc, 2);
    if (dw === 0) return addDias(venc, 1);
    return venc;
  }

  /* ======================================================================
   * 3. ESTADO, CONFIG, CLIENTES
   * ==================================================================== */
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function tsAgora(opts) { return (opts && opts.ts) || new Date().toISOString(); }

  function configPadrao() {
    return {
      taxaPadraoBp: { MENSAL: 2000, QUINZENAL: 1000, SEMANAL: 500 },
      taxaParceladoBp: 2000,
      multaBp: 200,       // 2% (única)
      moraDiaBp: 33,      // 0,33% ao dia (simples)
      multaTipo: 'PCT',   // 'PCT' (multaBp) | 'FIXO' (multaFixaCents, valor único por vencimento em atraso)
      multaFixaCents: 0,
      moraTipo: 'PCT',    // 'PCT' (moraDiaBp por dia) | 'FIXO' (moraFixaCents por dia de atraso)
      moraFixaCents: 0,
      baseEncargo: 'MONTANTE', // 'MONTANTE' | 'PRINCIPAL'
      carenciaFds: true,
      tetoPadraoCents: 0, // 0 = sem teto
      chavePix: '',
      dataSimulada: null,
      modoDiscreto: false,
    };
  }

  function novoEstado() {
    return {
      versao: VERSAO,
      config: configPadrao(),
      clientes: {},
      contratos: {},
      ledger: [],
      caixa: { disp: 0, rua: 0, lucro: 0, perdas: 0 },
      seq: { cliente: 0, contrato: 0, ledger: 0 },
    };
  }

  /**
   * Multa e mora podem ser em % (padrão) ou em valor fixo (centavos).
   * Dado salvo sem o tipo (versões anteriores) é tratado como PCT: nada muda para quem já usa.
   */
  function _normalizarTipoEncargo(o) {
    const mt = o.multaTipo === undefined || o.multaTipo === null ? 'PCT' : o.multaTipo;
    const ot = o.moraTipo === undefined || o.moraTipo === null ? 'PCT' : o.moraTipo;
    if (mt !== 'PCT' && mt !== 'FIXO') throw new EngineError('CONFIG_INVALIDA', 'Tipo de multa inválido (use % ou R$).');
    if (ot !== 'PCT' && ot !== 'FIXO') throw new EngineError('CONFIG_INVALIDA', 'Tipo de mora inválido (use %/dia ou R$/dia).');
    o.multaTipo = mt; o.moraTipo = ot;
    o.multaFixaCents = assertCents(o.multaFixaCents === undefined ? 0 : o.multaFixaCents, 'Multa fixa');
    o.moraFixaCents = assertCents(o.moraFixaCents === undefined ? 0 : o.moraFixaCents, 'Mora fixa por dia');
  }

  function atualizarConfig(state, patch) {
    const s = clone(state);
    const cfg = Object.assign({}, s.config, patch);
    assertBp(cfg.multaBp, 'Multa', 10000);
    assertBp(cfg.moraDiaBp, 'Mora diária', 1000);
    _normalizarTipoEncargo(cfg);
    if (cfg.baseEncargo !== 'MONTANTE' && cfg.baseEncargo !== 'PRINCIPAL') throw new EngineError('CONFIG_INVALIDA', 'Base de encargo inválida.');
    assertCents(cfg.tetoPadraoCents, 'Teto');
    ['MENSAL', 'QUINZENAL', 'SEMANAL'].forEach(function (k) { assertBp(cfg.taxaPadraoBp[k], 'Taxa ' + k.toLowerCase()); });
    assertBp(cfg.taxaParceladoBp, 'Taxa do parcelado');
    cfg.carenciaFds = !!cfg.carenciaFds;
    cfg.modoDiscreto = !!cfg.modoDiscreto;
    cfg.chavePix = String(cfg.chavePix || '').trim();
    if (cfg.chavePix.length > 140) throw new EngineError('CONFIG_INVALIDA', 'Chave PIX muito longa.');
    if (cfg.dataSimulada) parseISO(cfg.dataSimulada); else cfg.dataSimulada = null;
    s.config = cfg;
    return { state: s };
  }

  function criarCliente(state, dados) {
    const s = clone(state);
    const nome = String((dados && dados.nome) || '').trim();
    if (!nome) throw new EngineError('NOME_OBRIGATORIO', 'Informe o nome do cliente.');
    const teto = dados.tetoCents === undefined ? 0 : assertCents(dados.tetoCents, 'Teto do cliente');
    s.seq.cliente++;
    const cli = {
      id: 'C' + s.seq.cliente,
      nome: nome,
      telefone: String(dados.telefone || '').replace(/\D/g, ''),
      cpf: String(dados.cpf || '').replace(/\D/g, '').slice(0, 11),
      email: String(dados.email || '').trim().toLowerCase().slice(0, 120),
      tags: Array.isArray(dados.tags) ? dados.tags.slice(0, 10) : [],
      tetoCents: teto,
      scoreDec: SCORE_INICIAL,
      obs: dados.obs || '',
      criadoEm: tsAgora(dados),
    };
    s.clientes[cli.id] = cli;
    return { state: s, cliente: cli };
  }

  /** Edita só o cadastro (nome, contatos, tags, teto, obs). Não mexe em score, contratos nem caixa. */
  function atualizarCliente(state, clienteId, dados) {
    const s = clone(state);
    const cli = s.clientes[clienteId];
    if (!cli) throw new EngineError('CLIENTE_INEXISTENTE', 'Cliente não encontrado.');
    const d = dados || {};
    if ('nome' in d) {
      const nome = String(d.nome || '').trim();
      if (!nome) throw new EngineError('NOME_OBRIGATORIO', 'Informe o nome do cliente.');
      cli.nome = nome.slice(0, 80);
    }
    if ('telefone' in d) cli.telefone = String(d.telefone || '').replace(/\D/g, '');
    if ('cpf' in d) cli.cpf = String(d.cpf || '').replace(/\D/g, '').slice(0, 11);
    if ('email' in d) cli.email = String(d.email || '').trim().toLowerCase().slice(0, 120);
    if ('tags' in d) cli.tags = (Array.isArray(d.tags) ? d.tags : []).map(function (x) { return String(x).trim().slice(0, 24); }).filter(Boolean).slice(0, 10);
    if ('tetoCents' in d) cli.tetoCents = assertCents(d.tetoCents, 'Teto do cliente');
    if ('obs' in d) cli.obs = String(d.obs || '').slice(0, 300);
    return { state: s, cliente: cli };
  }

  function exposicaoCliente(state, clienteId) {
    let t = 0;
    Object.keys(state.contratos).forEach(function (k) {
      const c = state.contratos[k];
      if (c.clienteId === clienteId && c.status === 'ATIVO') t += c.principalAberto;
    });
    return t;
  }

  function _alertaTeto(s, cli, novoPrincipal) {
    const teto = cli.tetoCents || s.config.tetoPadraoCents || 0;
    const atual = exposicaoCliente(s, cli.id);
    const apos = atual + novoPrincipal;
    return { teto: teto, exposicaoAtual: atual, exposicaoApos: apos, excede: teto > 0 && apos > teto };
  }

  /* ======================================================================
   * 4. LEDGER (Livro-Razão) — todo dinheiro passa por aqui
   * ==================================================================== */
  function _D(disp, rua, lucro, perdas) {
    return { disp: disp || 0, rua: rua || 0, lucro: lucro || 0, perdas: perdas || 0 };
  }

  function _aplicarDeltas(caixa, deltas) {
    const novo = Object.assign({}, caixa);
    Object.keys(deltas).forEach(function (k) {
      if (!(k in novo)) throw new EngineError('INCONSISTENCIA', 'Pote desconhecido: ' + k);
      if (!Number.isSafeInteger(deltas[k])) throw new EngineError('INCONSISTENCIA', 'Delta não inteiro em ' + k);
      novo[k] += deltas[k];
    });
    if (novo.disp < 0) throw new EngineError('SALDO_INSUFICIENTE', 'Capital Disponível insuficiente: faltam ' + fmtBRL(-novo.disp) + '.', { pote: 'disp', falta: -novo.disp });
    if (novo.lucro < 0) throw new EngineError('SALDO_INSUFICIENTE', 'Lucro Líquido insuficiente: faltam ' + fmtBRL(-novo.lucro) + '.', { pote: 'lucro', falta: -novo.lucro });
    if (novo.rua < 0 || novo.perdas < 0) throw new EngineError('INCONSISTENCIA', 'Operação deixaria Capital na Rua/Perdas negativo.');
    return novo;
  }

  function _lancar(s, base, ts) {
    const caixa = _aplicarDeltas(s.caixa, base.deltas);
    s.seq.ledger++;
    const e = Object.assign({ id: 'L' + s.seq.ledger, ts: ts, estornadaPor: null }, base);
    s.ledger.push(e);
    s.caixa = caixa;
    return e;
  }

  function aporte(state, dados) {
    const s = clone(state);
    const v = assertCents(dados.valor, 'Aporte', { min: 1 });
    const data = dados.data || hojeEfetivo(s);
    parseISO(data);
    const e = _lancar(s, { tipo: 'APORTE', data: data, deltas: _D(v, 0, 0, 0), obs: dados.obs || '' }, tsAgora(dados));
    return { state: s, lancamento: e };
  }

  function sangria(state, dados) {
    const s = clone(state);
    const v = assertCents(dados.valor, 'Sangria', { min: 1 });
    const origem = dados.origem || 'DISPONIVEL';
    if (origem !== 'DISPONIVEL' && origem !== 'LUCRO') throw new EngineError('ORIGEM_INVALIDA', 'Origem da sangria inválida.');
    const data = dados.data || hojeEfetivo(s);
    parseISO(data);
    const deltas = origem === 'DISPONIVEL' ? _D(-v, 0, 0, 0) : _D(0, 0, -v, 0);
    const e = _lancar(s, { tipo: 'SANGRIA', origem: origem, data: data, deltas: deltas, obs: dados.obs || '' }, tsAgora(dados));
    return { state: s, lancamento: e };
  }

  /** Move Lucro -> Capital Disponível (reinvestir). */
  function reinvestirLucro(state, dados) {
    const s = clone(state);
    const v = assertCents(dados.valor, 'Reinvestimento', { min: 1 });
    const data = dados.data || hojeEfetivo(s);
    parseISO(data);
    const e = _lancar(s, { tipo: 'REINVESTIMENTO', data: data, deltas: _D(v, 0, -v, 0), obs: dados.obs || '' }, tsAgora(dados));
    return { state: s, lancamento: e };
  }

  /* ======================================================================
   * 5. CONTRATOS — criação
   * ==================================================================== */
  function _prepararContrato(s, dados) {
    const cli = s.clientes[dados.clienteId];
    if (!cli) throw new EngineError('CLIENTE_INEXISTENTE', 'Cliente não encontrado.');
    assertCents(dados.principal, 'Principal', { min: 100 });
    assertBp(dados.taxaBp, 'Taxa');
    parseISO(dados.dataInicio);
    const r = Object.assign(
      { multaBp: s.config.multaBp, moraDiaBp: s.config.moraDiaBp, baseEncargo: s.config.baseEncargo, carenciaFds: s.config.carenciaFds,
        multaTipo: s.config.multaTipo, multaFixaCents: s.config.multaFixaCents, moraTipo: s.config.moraTipo, moraFixaCents: s.config.moraFixaCents },
      dados.regras || {}
    );
    assertBp(r.multaBp, 'Multa', 10000);
    assertBp(r.moraDiaBp, 'Mora', 1000);
    _normalizarTipoEncargo(r);
    if (r.baseEncargo !== 'MONTANTE' && r.baseEncargo !== 'PRINCIPAL') throw new EngineError('CONFIG_INVALIDA', 'Base de encargo inválida.');
    r.carenciaFds = !!r.carenciaFds;
    return { cli: cli, regras: r };
  }

  function criarContratoGiro(state, dados) {
    const s = clone(state);
    const p = _prepararContrato(s, dados);
    const cicloDias = CICLOS[dados.ciclo];
    if (!cicloDias) throw new EngineError('CICLO_INVALIDO', 'Ciclo deve ser MENSAL, QUINZENAL ou SEMANAL.');
    const alerta = _alertaTeto(s, p.cli, dados.principal);
    s.seq.contrato++;
    const c = {
      id: 'K' + s.seq.contrato,
      tipo: 'GIRO',
      clienteId: p.cli.id,
      ciclo: dados.ciclo,
      cicloDias: cicloDias,
      principalOriginal: dados.principal,
      principalAberto: dados.principal,
      taxaBp: dados.taxaBp,
      regras: p.regras,
      dataInicio: dados.dataInicio,
      vencimento: addDias(dados.dataInicio, cicloDias),
      jurosPendente: 0,
      renovacoes: 0,
      renovacoesSeguidas: 0,
      status: 'ATIVO',
      promessa: null,
      acordo: null,
      pausas: [],
      parcelas: null,
      obs: dados.obs || '',
    };
    s.contratos[c.id] = c;
    const e = _lancar(s, { tipo: 'EMPRESTIMO', contratoId: c.id, clienteId: c.clienteId, data: dados.dataInicio, deltas: _D(-dados.principal, dados.principal, 0, 0), obs: dados.obs || '' }, tsAgora(dados));
    return { state: s, contrato: c, lancamento: e, alertas: { teto: alerta } };
  }

  /**
   * Gera o cronograma. Valor da parcela fixo (sobra de centavos na última);
   * juros por soma acumulada => cada parcela tem juros >= 0 e principal >= 0,
   * e as somas batem exatamente com o principal e o juros total.
   */
  function gerarParcelas(principal, taxaBp, n, periodicidade, dataInicio) {
    if (!Number.isInteger(n) || n < 1 || n > 120) throw new EngineError('PARCELAS_INVALIDAS', 'Número de parcelas deve ir de 1 a 120.');
    const dias = PERIODICIDADES[periodicidade];
    if (!dias) throw new EngineError('PERIODICIDADE_INVALIDA', 'Periodicidade inválida.');
    parseISO(dataInicio);
    const jurosTotal = mulBp(principal, taxaBp);
    const T = principal + jurosTotal;
    const base = Math.floor(T / n);
    if (base < 100) throw new EngineError('PARCELA_MUITO_PEQUENA', 'Cada parcela precisa ter pelo menos R$ 1,00.');
    const out = [];
    let cumV = 0, cumJ = 0, d = dataInicio;
    for (let i = 1; i <= n; i++) {
      const v = i === n ? T - base * (n - 1) : base;
      cumV += v;
      const cj = i === n ? jurosTotal : mulDivRound(jurosTotal, cumV, T);
      const juros = cj - cumJ;
      cumJ = cj;
      let venc;
      if (periodicidade === 'DIARIA') {
        d = addDias(d, 1);
        if (diaSemana(d) === 0) d = addDias(d, 1); // pula domingo
        venc = d;
      } else {
        venc = addDias(dataInicio, dias * i);
      }
      const prin = v - juros;
      if (juros < 0 || prin < 0) throw new EngineError('INCONSISTENCIA', 'Parcela gerada com componente negativo.');
      out.push({ n: i, venc: venc, valor: v, principal: prin, juros: juros, abatEnc: 0, abatJuros: 0, abatPrincipal: 0, diasPenalizados: 0 });
    }
    return out;
  }

  function criarContratoParcelado(state, dados) {
    const s = clone(state);
    const p = _prepararContrato(s, dados);
    const parcelas = gerarParcelas(dados.principal, dados.taxaBp, dados.n, dados.periodicidade, dados.dataInicio);
    const alerta = _alertaTeto(s, p.cli, dados.principal);
    s.seq.contrato++;
    const c = {
      id: 'K' + s.seq.contrato,
      tipo: 'PARCELADO',
      clienteId: p.cli.id,
      n: dados.n,
      periodicidade: dados.periodicidade,
      principalOriginal: dados.principal,
      principalAberto: dados.principal,
      taxaBp: dados.taxaBp,
      regras: p.regras,
      dataInicio: dados.dataInicio,
      vencimento: null,
      jurosPendente: 0,
      renovacoes: 0,
      renovacoesSeguidas: 0,
      status: 'ATIVO',
      promessa: null,
      acordo: null,
      pausas: [],
      parcelas: parcelas,
      obs: dados.obs || '',
    };
    s.contratos[c.id] = c;
    const e = _lancar(s, { tipo: 'EMPRESTIMO', contratoId: c.id, clienteId: c.clienteId, data: dados.dataInicio, deltas: _D(-dados.principal, dados.principal, 0, 0), obs: dados.obs || '' }, tsAgora(dados));
    return { state: s, contrato: c, lancamento: e, alertas: { teto: alerta } };
  }

  /** Calculadora de Balcão (não grava nada). */
  function simularGiro(principal, taxaBp, ciclo, dataInicio) {
    assertCents(principal, 'Principal', { min: 1 });
    const cicloDias = CICLOS[ciclo];
    if (!cicloDias) throw new EngineError('CICLO_INVALIDO', 'Ciclo inválido.');
    const juros = mulBp(principal, taxaBp);
    return { principal: principal, juros: juros, totalNoVencimento: principal + juros, vencimento: addDias(dataInicio, cicloDias) };
  }
  function simularParcelado(principal, taxaBp, n, periodicidade, dataInicio) {
    assertCents(principal, 'Principal', { min: 1 });
    const parcelas = gerarParcelas(principal, taxaBp, n, periodicidade, dataInicio);
    const jurosTotal = parcelas.reduce(function (a, p) { return a + p.juros; }, 0);
    return { principal: principal, jurosTotal: jurosTotal, total: principal + jurosTotal, parcelas: parcelas };
  }

  /* ======================================================================
   * 6. ATRASO, ENCARGOS, DÍVIDA
   * ==================================================================== */
  /**
   * Dias de atraso que geram encargo: dias corridos após o vencimento efetivo
   * (com carência), descontando as pausas (promessa que congela, acordo).
   */
  function diasAtraso(c, venc, hoje) {
    const vEf = vencEfetivo(venc, c.regras.carenciaFds);
    const a = parseISO(vEf);
    const b = parseISO(hoje);
    if (b <= a) return 0;
    const ints = [];
    function push(ini, fim) {
      const si = Math.max(parseISO(ini), a);
      const e = Math.min(fim === null || fim === undefined ? b : parseISO(fim), b);
      if (e > si) ints.push([si, e]);
    }
    (c.pausas || []).forEach(function (p) { push(p.ini, p.fim); });
    if (c.promessa && c.promessa.congelar) push(c.promessa.criadaEm, c.promessa.data);
    if (c.acordo) push(c.acordo.desde, null);
    ints.sort(function (x, y) { return x[0] - y[0]; });
    let frozen = 0, curS = null, curE = null;
    ints.forEach(function (iv) {
      if (curS === null) { curS = iv[0]; curE = iv[1]; }
      else if (iv[0] <= curE) { curE = Math.max(curE, iv[1]); }
      else { frozen += curE - curS; curS = iv[0]; curE = iv[1]; }
    });
    if (curS !== null) frozen += curE - curS;
    return Math.max(0, (b - a) - frozen);
  }

  function encargosAcumulados(base, regras, dias) {
    if (dias <= 0) return { multa: 0, mora: 0, total: 0 };
    // Regra sem tipo (contrato antigo) = percentual. Em valor fixo, tudo segue em centavos inteiros.
    const multa = regras.multaTipo === 'FIXO' ? regras.multaFixaCents : mulBp(base, regras.multaBp);
    const mora = regras.moraTipo === 'FIXO' ? regras.moraFixaCents * dias : mulBp(base, regras.moraDiaBp * dias);
    return { multa: multa, mora: mora, total: multa + mora };
  }

  function dividaGiro(c, hoje) {
    const jurosCiclo = mulBp(c.principalAberto, c.taxaBp);
    const base = c.regras.baseEncargo === 'PRINCIPAL' ? c.principalAberto : c.principalAberto + jurosCiclo;
    const dias = diasAtraso(c, c.vencimento, hoje);
    const e = encargosAcumulados(base, c.regras, dias);
    const juros = jurosCiclo + c.jurosPendente;
    return {
      tipo: 'GIRO',
      principal: c.principalAberto,
      jurosCiclo: jurosCiclo,
      jurosPendente: c.jurosPendente,
      juros: juros,
      multa: e.multa,
      mora: e.mora,
      encargos: e.total,
      dias: dias,
      venc: c.vencimento,
      vencEfetivo: vencEfetivo(c.vencimento, c.regras.carenciaFds),
      total: c.principalAberto + juros + e.total,
    };
  }

  function _parcelaQuitada(p) { return p.abatJuros === p.juros && p.abatPrincipal === p.principal; }

  function dividaParcela(c, p, hoje) {
    if (_parcelaQuitada(p)) {
      return { n: p.n, venc: p.venc, dias: 0, multa: 0, mora: 0, enc: 0, jur: 0, prin: 0, total: 0, quitada: true, status: 'PAGA' };
    }
    const dias = diasAtraso(c, p.venc, hoje);
    const base = c.regras.baseEncargo === 'PRINCIPAL' ? p.principal : p.principal + p.juros;
    const e = encargosAcumulados(base, c.regras, dias);
    const enc = Math.max(0, e.total - p.abatEnc);
    const jur = p.juros - p.abatJuros;
    const prin = p.principal - p.abatPrincipal;
    const vEf = vencEfetivo(p.venc, c.regras.carenciaFds);
    const status = hoje < p.venc ? 'EM_DIA' : hoje <= vEf ? 'VENCE_HOJE' : 'ATRASADO';
    return { n: p.n, venc: p.venc, dias: dias, multa: e.multa, mora: e.mora, enc: enc, jur: jur, prin: prin, total: enc + jur + prin, quitada: false, status: status };
  }

  function dividaParcelado(c, hoje) {
    const parcelas = c.parcelas.map(function (p) { return dividaParcela(c, p, hoje); });
    const abertas = parcelas.filter(function (x) { return !x.quitada; });
    const soma = function (f) { return abertas.reduce(function (a, x) { return a + x[f]; }, 0); };
    const exigivel = abertas.filter(function (x) { return x.status !== 'EM_DIA'; }).reduce(function (a, x) { return a + x.total; }, 0);
    return {
      tipo: 'PARCELADO',
      parcelas: parcelas,
      enc: soma('enc'), jur: soma('jur'), prin: soma('prin'),
      total: soma('total'),
      exigivel: exigivel,
      dias: abertas.reduce(function (a, x) { return Math.max(a, x.dias); }, 0),
    };
  }

  function dividaContrato(c, hoje) {
    return c.tipo === 'GIRO' ? dividaGiro(c, hoje) : dividaParcelado(c, hoje);
  }

  function proximoVencimento(c) {
    if (c.tipo === 'GIRO') return c.vencimento;
    const p = c.parcelas.find(function (x) { return !_parcelaQuitada(x); });
    return p ? p.venc : null;
  }

  function _statusPorVencimento(c, hoje) {
    if (c.tipo === 'GIRO') {
      const vEf = vencEfetivo(c.vencimento, c.regras.carenciaFds);
      return hoje < c.vencimento ? 'EM_DIA' : hoje <= vEf ? 'VENCE_HOJE' : 'ATRASADO';
    }
    let pior = 'EM_DIA';
    c.parcelas.forEach(function (p) {
      if (_parcelaQuitada(p)) return;
      const vEf = vencEfetivo(p.venc, c.regras.carenciaFds);
      const st = hoje < p.venc ? 'EM_DIA' : hoje <= vEf ? 'VENCE_HOJE' : 'ATRASADO';
      if (st === 'ATRASADO') pior = 'ATRASADO';
      else if (st === 'VENCE_HOJE' && pior === 'EM_DIA') pior = 'VENCE_HOJE';
    });
    return pior;
  }

  function statusContrato(c, hoje) {
    if (c.status !== 'ATIVO') return c.status;
    if (c.acordo) return 'ACORDO';
    const base = _statusPorVencimento(c, hoje);
    if (c.promessa && hoje <= c.promessa.data && base !== 'EM_DIA') return 'PROMESSA';
    return base;
  }

  function alertaRenovacoes(c) { return c.status === 'ATIVO' && c.renovacoesSeguidas >= 3; }

  /** Pro-rata (3A): só sugestão de desconto antes do vencimento. */
  function proRataGiro(c, hoje) {
    if (c.tipo !== 'GIRO' || c.status !== 'ATIVO' || hoje >= c.vencimento) return { aplicavel: false };
    const jurosCiclo = mulBp(c.principalAberto, c.taxaBp);
    const inicio = addDias(c.vencimento, -c.cicloDias);
    const dec = Math.min(c.cicloDias, Math.max(1, diasEntre(inicio, hoje))); // mínimo 1 dia cobrado
    const proRata = mulDivRound(jurosCiclo, dec, c.cicloDias);
    return { aplicavel: true, decorridos: dec, cicloDias: c.cicloDias, jurosCiclo: jurosCiclo, proRata: proRata, sugestaoDesconto: jurosCiclo - proRata };
  }

  /* ======================================================================
   * 7. BAIXA — planejamento (preview) e efetivação
   * ==================================================================== */
  function _contratoAtivo(s, id) {
    const c = s.contratos[id];
    if (!c) throw new EngineError('CONTRATO_INEXISTENTE', 'Contrato não encontrado.');
    if (c.status !== 'ATIVO') throw new EngineError('CONTRATO_ENCERRADO', 'Contrato não está ativo (' + STATUS_LABEL[c.status] + ').');
    return c;
  }

  function _planoGiro(c, hoje, R, D) {
    const d = dividaGiro(c, hoje);
    const J = d.encargos + d.juros;
    const total = J + d.principal;
    if (R + D <= 0) throw new EngineError('VALOR_ZERO', 'Informe um valor recebido ou desconto.');
    if (R + D > total) throw new EngineError('EXCESSO', 'Valor (recebido + desconto) maior que o total devido de ' + fmtBRL(total) + '.', { total: total, excesso: R + D - total });

    // Desconto consome a frente da fila (Encargos -> Juros -> Principal); depois o dinheiro.
    let dRest = D, rRest = R;
    const dEnc = Math.min(dRest, d.encargos); dRest -= dEnc;
    const dJur = Math.min(dRest, d.juros); dRest -= dJur;
    const dPrin = dRest;
    const rEnc = Math.min(rRest, d.encargos - dEnc); rRest -= rEnc;
    const rJur = Math.min(rRest, d.juros - dJur); rRest -= rJur;
    const rPrin = rRest;

    const credito = R + D;
    const cenario = credito === total ? 'A' : credito === J ? 'B' : credito > J ? 'C' : 'D';
    return {
      tipo: 'GIRO', hoje: hoje, recebido: R, desconto: D, divida: d, J: J, total: total, credito: credito,
      cenario: cenario,
      diff: cenario === 'D' ? J - credito : 0,
      comp: { encCash: rEnc, jurCash: rJur, prinCash: rPrin, encDesc: dEnc, jurDesc: dJur, prinDesc: dPrin },
      prinAbat: dPrin + rPrin,
      dias: d.dias,
      requerEscolhaD: cenario === 'D',
      requerEscolhaData: cenario !== 'A',
    };
  }

  function _planoParcelado(c, hoje, R, D, parcelaN) {
    const abertas = c.parcelas.filter(function (p) { return !_parcelaQuitada(p); });
    if (!abertas.length) throw new EngineError('CONTRATO_ENCERRADO', 'Todas as parcelas já estão pagas.');
    let ordem = abertas.slice();
    if (parcelaN !== undefined && parcelaN !== null) {
      const alvo = abertas.find(function (p) { return p.n === parcelaN; });
      if (!alvo) throw new EngineError('PARCELA_INVALIDA', 'Parcela ' + parcelaN + ' não está em aberto.');
      ordem = [alvo].concat(abertas.filter(function (p) { return p.n !== parcelaN; }));
    }
    const dv = ordem.map(function (p) { return dividaParcela(c, p, hoje); });
    const totalAberto = dv.reduce(function (a, x) { return a + x.total; }, 0);
    if (R + D <= 0) throw new EngineError('VALOR_ZERO', 'Informe um valor recebido ou desconto.');
    if (R + D > totalAberto) throw new EngineError('EXCESSO', 'Valor (recebido + desconto) maior que o total em aberto de ' + fmtBRL(totalAberto) + '.', { total: totalAberto, excesso: R + D - totalAberto });

    let dRest = D, rRest = R;
    const itens = [];
    const comp = { encCash: 0, jurCash: 0, prinCash: 0, encDesc: 0, jurDesc: 0, prinDesc: 0 };
    for (let i = 0; i < dv.length; i++) {
      if (dRest === 0 && rRest === 0) break;
      const v = dv[i];
      const dE = Math.min(dRest, v.enc); dRest -= dE;
      const dJ = Math.min(dRest, v.jur); dRest -= dJ;
      const dP = Math.min(dRest, v.prin); dRest -= dP;
      const rE = Math.min(rRest, v.enc - dE); rRest -= rE;
      const rJ = Math.min(rRest, v.jur - dJ); rRest -= rJ;
      const rP = Math.min(rRest, v.prin - dP); rRest -= rP;
      itens.push({ n: v.n, dias: v.dias, dEnc: dE, dJur: dJ, dPrin: dP, rEnc: rE, rJur: rJ, rPrin: rP, quitaApos: (dJ + rJ === v.jur) && (dP + rP === v.prin) });
      comp.encCash += rE; comp.jurCash += rJ; comp.prinCash += rP;
      comp.encDesc += dE; comp.jurDesc += dJ; comp.prinDesc += dP;
    }
    if (dRest !== 0 || rRest !== 0) throw new EngineError('INCONSISTENCIA', 'Sobra não alocada na baixa parcelada.');
    return {
      tipo: 'PARCELADO', hoje: hoje, recebido: R, desconto: D, total: totalAberto, credito: R + D,
      cenario: R + D === totalAberto ? 'A' : 'PARCELA',
      comp: comp, itens: itens,
      prinAbat: comp.prinCash + comp.prinDesc,
      dias: itens.reduce(function (a, x) { return Math.max(a, x.dias); }, 0),
      requerEscolhaD: false, requerEscolhaData: false,
    };
  }

  function _planejar(c, dados) {
    const hoje = dados.hoje;
    parseISO(hoje);
    const R = assertCents(dados.recebido === undefined ? 0 : dados.recebido, 'Valor recebido');
    const D = assertCents(dados.desconto === undefined ? 0 : dados.desconto, 'Desconto');
    return c.tipo === 'GIRO' ? _planoGiro(c, hoje, R, D) : _planoParcelado(c, hoje, R, D, dados.parcelaN);
  }

  /** Preview para o modal "Registrar Pagamento": classifica sem gravar nada. */
  function previewBaixa(state, contratoId, dados) {
    const c = _contratoAtivo(state, contratoId);
    const plan = _planejar(c, dados);
    plan.cenarioLabel = CENARIO_LABEL[plan.cenario];
    return plan;
  }

  function registrarBaixa(state, contratoId, dados) {
    const s = clone(state);
    const c = _contratoAtivo(s, contratoId);
    const cli = s.clientes[c.clienteId];
    const plan = _planejar(c, dados);
    const hoje = plan.hoje;

    if (plan.requerEscolhaD && dados.escolhaD !== 'SOMAR_PRINCIPAL' && dados.escolhaD !== 'JUROS_PENDENTE') {
      throw new EngineError('ESCOLHA_D_OBRIGATORIA', 'Escolha: somar a diferença no Principal ou deixar como Juros Pendente.');
    }
    if (plan.requerEscolhaData && dados.escolhaData !== 'MANTER_DIA' && dados.escolhaData !== 'CICLO_HOJE') {
      throw new EngineError('ESCOLHA_DATA_OBRIGATORIA', 'Escolha: Manter Dia Fixo ou +Ciclo a partir de Hoje.');
    }

    const snapshot = { contrato: clone(c), scoreDec: cli.scoreDec };
    let capitalizado = 0;
    let parcelasTocadas = [];
    let penalDias = 0;

    if (plan.tipo === 'GIRO') {
      c.principalAberto -= plan.prinAbat;
      penalDias = plan.dias;
      if (plan.cenario === 'A') {
        c.status = 'QUITADO';
        c.jurosPendente = 0;
        c.promessa = null; c.acordo = null; c.pausas = [];
      } else {
        if (plan.cenario === 'D') {
          if (dados.escolhaD === 'SOMAR_PRINCIPAL') {
            capitalizado = plan.diff;
            c.principalAberto += capitalizado;
            c.jurosPendente = 0;
          } else {
            c.jurosPendente = plan.diff;
          }
        } else {
          c.jurosPendente = 0;
        }
        if (dados.escolhaData === 'MANTER_DIA') {
          let v = c.vencimento;
          do { v = addDias(v, c.cicloDias); } while (v <= hoje);
          c.vencimento = v;
        } else {
          c.vencimento = addDias(hoje, c.cicloDias);
        }
        c.renovacoes += 1;
        c.renovacoesSeguidas = plan.cenario === 'C' ? 0 : c.renovacoesSeguidas + 1;
        c.promessa = null; c.pausas = [];
      }
    } else {
      plan.itens.forEach(function (it) {
        const p = c.parcelas.find(function (x) { return x.n === it.n; });
        p.abatEnc += it.dEnc + it.rEnc;
        p.abatJuros += it.dJur + it.rJur;
        p.abatPrincipal += it.dPrin + it.rPrin;
        penalDias += Math.max(0, it.dias - p.diasPenalizados);
        p.diasPenalizados = Math.max(p.diasPenalizados, it.dias);
        parcelasTocadas.push(it.n);
      });
      c.principalAberto -= plan.prinAbat;
      if (c.parcelas.every(_parcelaQuitada)) {
        c.status = 'QUITADO';
        c.promessa = null; c.acordo = null; c.pausas = [];
      }
    }

    // Score: -0,1 por dia de atraso efetivamente pago (piso 1,0)
    if (penalDias > 0) cli.scoreDec = Math.max(SCORE_MIN, cli.scoreDec - penalDias);

    const comp = plan.comp;
    const deltas = _D(comp.prinCash, -plan.prinAbat + capitalizado, comp.encCash + comp.jurCash, comp.prinDesc);
    const entry = _lancar(s, {
      tipo: 'BAIXA',
      contratoId: c.id,
      clienteId: c.clienteId,
      data: hoje,
      recebido: plan.recebido,
      desconto: plan.desconto,
      obs: dados.obs || '',
      cenario: plan.cenario,
      comp: comp,
      capitalizado: capitalizado,
      parcelas: parcelasTocadas,
      diasAtraso: plan.dias,
      escolhaD: plan.cenario === 'D' ? dados.escolhaD : null,
      escolhaData: plan.requerEscolhaData ? dados.escolhaData : null,
      deltas: deltas,
      snapshot: snapshot,
      recibo: {
        saldoPrincipalApos: c.principalAberto,
        jurosPendenteApos: c.jurosPendente,
        proximoVenc: proximoVencimento(c),
        quitado: c.status === 'QUITADO',
      },
    }, tsAgora(dados));
    _podarSnapshots(s, c.id);
    return { state: s, lancamento: entry, plano: plan, contrato: c };
  }

  function marcarPerda(state, contratoId, dados) {
    const s = clone(state);
    const c = _contratoAtivo(s, contratoId);
    const cli = s.clientes[c.clienteId];
    const hoje = dados.hoje;
    parseISO(hoje);
    const perda = c.principalAberto;
    const snapshot = { contrato: clone(c), scoreDec: cli.scoreDec };
    c.status = 'PERDA';
    c.principalPerdido = perda;
    c.principalAberto = 0;
    c.jurosPendente = 0;
    c.promessa = null; c.acordo = null; c.pausas = [];
    cli.scoreDec = SCORE_MIN;
    const e = _lancar(s, { tipo: 'PERDA', contratoId: c.id, clienteId: c.clienteId, data: hoje, obs: dados.obs || '', deltas: _D(0, -perda, 0, perda), snapshot: snapshot }, tsAgora(dados));
    _podarSnapshots(s, c.id);
    return { state: s, lancamento: e, contrato: c };
  }

  /* ======================================================================
   * 8. ESTORNO (LIFO por contrato) e CANCELAMENTO
   * ==================================================================== */
  /**
   * Janela de estorno: só as N últimas movimentações ativas (baixa/perda) de cada
   * contrato guardam o retrato do estado anterior. Sem isso o estado crescia ~6 MB
   * em 4 meses de uso intenso e estourava o LocalStorage (limite ~5 MB).
   */
  const JANELA_ESTORNO = 3;
  function _podarSnapshots(s, contratoId) {
    let vivos = 0;
    for (let i = s.ledger.length - 1; i >= 0; i--) {
      const e = s.ledger[i];
      if (e.contratoId !== contratoId || (e.tipo !== 'BAIXA' && e.tipo !== 'PERDA') || e.estornadaPor) continue;
      vivos++;
      if (vivos > JANELA_ESTORNO) e.snapshot = null;
    }
  }

  function _ultimaMovimentacaoAtiva(s, contratoId) {
    for (let i = s.ledger.length - 1; i >= 0; i--) {
      const e = s.ledger[i];
      if (e.contratoId === contratoId && (e.tipo === 'BAIXA' || e.tipo === 'PERDA') && !e.estornadaPor) return e;
    }
    return null;
  }

  function estornarUltimaBaixa(state, contratoId, dados) {
    const d = dados || {};
    const s = clone(state);
    if (!s.contratos[contratoId]) throw new EngineError('CONTRATO_INEXISTENTE', 'Contrato não encontrado.');
    const alvo = _ultimaMovimentacaoAtiva(s, contratoId);
    if (!alvo) throw new EngineError('NADA_PARA_ESTORNAR', 'Não há baixa ativa para estornar neste contrato.');
    if (!alvo.snapshot) throw new EngineError('ESTORNO_EXPIRADO', 'Esta baixa é antiga demais para estorno automático (janela de ' + JANELA_ESTORNO + ' movimentações por contrato). Corrija com um lançamento manual.');
    const inv = {};
    Object.keys(alvo.deltas).forEach(function (k) { inv[k] = -alvo.deltas[k]; });
    const data = d.hoje || hojeEfetivo(s);
    let est;
    try {
      est = _lancar(s, { tipo: 'ESTORNO', estornoDe: alvo.id, contratoId: contratoId, clienteId: alvo.clienteId, data: data, deltas: inv, obs: d.obs || '' }, tsAgora(d));
    } catch (err) {
      if (err instanceof EngineError && err.code === 'SALDO_INSUFICIENTE') {
        throw new EngineError('ESTORNO_BLOQUEADO', 'Estorno deixaria o caixa negativo. Faça um Aporte de ' + fmtBRL(err.extra.falta) + ' e tente de novo.', err.extra);
      }
      throw err;
    }
    alvo.estornadaPor = est.id;
    s.contratos[contratoId] = clone(alvo.snapshot.contrato);
    s.clientes[alvo.clienteId].scoreDec = alvo.snapshot.scoreDec;
    return { state: s, lancamento: est, estornado: alvo };
  }

  /** "Desfazer" contrato criado por engano: só se não houver baixa ativa. */
  function cancelarContrato(state, contratoId, dados) {
    const d = dados || {};
    const s = clone(state);
    const c = s.contratos[contratoId];
    if (!c) throw new EngineError('CONTRATO_INEXISTENTE', 'Contrato não encontrado.');
    if (c.status !== 'ATIVO') throw new EngineError('CONTRATO_ENCERRADO', 'Só contratos ativos podem ser cancelados.');
    if (_ultimaMovimentacaoAtiva(s, contratoId)) throw new EngineError('POSSUI_BAIXAS', 'Estorne as baixas antes de cancelar o contrato.');
    const emp = s.ledger.find(function (e) { return e.contratoId === contratoId && e.tipo === 'EMPRESTIMO' && !e.estornadaPor; });
    if (!emp) throw new EngineError('INCONSISTENCIA', 'Lançamento de empréstimo não encontrado.');
    const inv = {};
    Object.keys(emp.deltas).forEach(function (k) { inv[k] = -emp.deltas[k]; });
    let est;
    try {
      est = _lancar(s, { tipo: 'ESTORNO', estornoDe: emp.id, contratoId: contratoId, clienteId: c.clienteId, data: d.hoje || hojeEfetivo(s), deltas: inv, obs: d.obs || 'Contrato cancelado' }, tsAgora(d));
    } catch (err) {
      if (err instanceof EngineError && err.code === 'SALDO_INSUFICIENTE') throw new EngineError('ESTORNO_BLOQUEADO', 'Cancelamento deixaria o caixa negativo.', err.extra);
      throw err;
    }
    emp.estornadaPor = est.id;
    c.status = 'CANCELADO';
    c.principalAberto = 0;
    return { state: s, lancamento: est };
  }

  /* ======================================================================
   * 9. PROMESSA e ACORDO
   * ==================================================================== */
  function _fecharPromessaComoPausa(c, hoje) {
    if (c.promessa && c.promessa.congelar) {
      const fim = hoje < c.promessa.data ? hoje : c.promessa.data;
      if (fim > c.promessa.criadaEm) c.pausas.push({ ini: c.promessa.criadaEm, fim: fim });
    }
    c.promessa = null;
  }

  function registrarPromessa(state, contratoId, dados) {
    const s = clone(state);
    const c = _contratoAtivo(s, contratoId);
    parseISO(dados.hoje); parseISO(dados.data);
    if (dados.data < dados.hoje) throw new EngineError('DATA_INVALIDA', 'A data prometida não pode ser no passado.');
    _fecharPromessaComoPausa(c, dados.hoje);
    c.promessa = { criadaEm: dados.hoje, data: dados.data, congelar: !!dados.congelar, obs: dados.obs || '' };
    return { state: s, contrato: c };
  }

  function cancelarPromessa(state, contratoId, dados) {
    const s = clone(state);
    const c = _contratoAtivo(s, contratoId);
    parseISO(dados.hoje);
    _fecharPromessaComoPausa(c, dados.hoje);
    return { state: s, contrato: c };
  }

  function registrarAcordo(state, contratoId, dados) {
    const s = clone(state);
    const c = _contratoAtivo(s, contratoId);
    parseISO(dados.hoje);
    if (c.acordo) throw new EngineError('JA_EM_ACORDO', 'Contrato já está em acordo.');
    _fecharPromessaComoPausa(c, dados.hoje);
    c.acordo = { desde: dados.hoje, obs: dados.obs || '' };
    return { state: s, contrato: c };
  }

  function encerrarAcordo(state, contratoId, dados) {
    const s = clone(state);
    const c = _contratoAtivo(s, contratoId);
    parseISO(dados.hoje);
    if (!c.acordo) throw new EngineError('SEM_ACORDO', 'Contrato não está em acordo.');
    if (dados.hoje > c.acordo.desde) c.pausas.push({ ini: c.acordo.desde, fim: dados.hoje });
    c.acordo = null;
    return { state: s, contrato: c };
  }

  /* ======================================================================
   * 10. RELATÓRIOS: agenda, fechamento do dia, recibo, WhatsApp, CSV
   * ==================================================================== */
  function agendaDoDia(state, hoje) {
    const itens = [];
    Object.keys(state.contratos).forEach(function (id) {
      const c = state.contratos[id];
      if (c.status !== 'ATIVO') return;
      const st = statusContrato(c, hoje);
      if (st !== 'VENCE_HOJE' && st !== 'ATRASADO' && st !== 'PROMESSA') return;
      const d = dividaContrato(c, hoje);
      const cli = state.clientes[c.clienteId];
      itens.push({
        contratoId: c.id, clienteId: c.clienteId, nome: cli.nome, telefone: cli.telefone,
        status: st, dias: d.dias, venc: proximoVencimento(c),
        cobrarAgora: c.tipo === 'GIRO' ? d.encargos + d.juros : d.exigivel,
        quitacao: d.total, tipo: c.tipo,
      });
    });
    const peso = { ATRASADO: 0, VENCE_HOJE: 1, PROMESSA: 2 };
    itens.sort(function (a, b) { return peso[a.status] - peso[b.status] || b.dias - a.dias || a.nome.localeCompare(b.nome); });
    return itens;
  }

  /** Só entradas operacionais de clientes (baixas ativas) com data efetiva = data. */
  function fechamentoDoDia(state, data) {
    const r = { data: data, qtd: 0, recebido: 0, lucro: 0, principalDevolvido: 0, descontos: 0, encargos: 0, juros: 0 };
    state.ledger.forEach(function (e) {
      if (e.tipo !== 'BAIXA' || e.data !== data || e.estornadaPor) return;
      r.qtd++;
      r.recebido += e.recebido;
      r.descontos += e.desconto;
      r.lucro += e.deltas.lucro;
      r.principalDevolvido += e.comp.prinCash;
      r.encargos += e.comp.encCash;
      r.juros += e.comp.jurCash;
    });
    return r;
  }

  function resumoCaixa(state) {
    const c = state.caixa;
    return { disponivel: c.disp, naRua: c.rua, lucro: c.lucro, perdas: c.perdas, resultadoLiquido: c.lucro - c.perdas };
  }

  function gerarRecibo(state, lancamentoId) {
    const e = state.ledger.find(function (x) { return x.id === lancamentoId && x.tipo === 'BAIXA'; });
    if (!e) throw new EngineError('RECIBO_INEXISTENTE', 'Baixa não encontrada.');
    const cli = state.clientes[e.clienteId];
    const c = state.contratos[e.contratoId];
    const L = [];
    L.push('*RECIBO ' + e.id + '*');
    L.push('Data: ' + fmtDataBR(e.data));
    L.push('Cliente: ' + cli.nome);
    L.push('Contrato: ' + e.contratoId + (c ? ' (' + (c.tipo === 'GIRO' ? 'Giro ' + c.ciclo.toLowerCase() : 'Parcelado ' + c.n + 'x') + ')' : ''));
    L.push('');
    L.push('Valor recebido: ' + fmtBRL(e.recebido));
    if (e.desconto > 0) L.push('Desconto concedido: ' + fmtBRL(e.desconto));
    const enc = e.comp.encCash + e.comp.encDesc, jur = e.comp.jurCash + e.comp.jurDesc, pr = e.comp.prinCash + e.comp.prinDesc;
    if (enc > 0) L.push('• Multa/mora: ' + fmtBRL(enc));
    if (jur > 0) L.push('• Juros: ' + fmtBRL(jur));
    if (pr > 0) L.push('• Principal: ' + fmtBRL(pr));
    if (e.parcelas && e.parcelas.length) L.push('Parcela(s): ' + e.parcelas.join(', '));
    L.push('');
    if (e.recibo.quitado) {
      L.push('✅ *CONTRATO QUITADO*');
    } else {
      L.push('Saldo do principal: ' + fmtBRL(e.recibo.saldoPrincipalApos));
      if (e.recibo.jurosPendenteApos > 0) L.push('Juros pendente: ' + fmtBRL(e.recibo.jurosPendenteApos));
      if (e.recibo.proximoVenc) L.push('Próximo vencimento: ' + fmtDataBR(e.recibo.proximoVenc));
    }
    if (e.obs) L.push('Obs: ' + e.obs);
    if (state.config.chavePix) { L.push(''); L.push('PIX: ' + state.config.chavePix); }
    return L.join('\n');
  }

  function linkWhatsApp(telefone, texto) {
    let t = String(telefone || '').replace(/\D/g, '');
    if (t.length === 10 || t.length === 11) t = '55' + t;
    return 'https://wa.me/' + t + '?text=' + encodeURIComponent(texto);
  }

  function mensagemCobranca(item, state) {
    const L = [];
    L.push('Olá, ' + item.nome.split(' ')[0] + '! Tudo bem?');
    if (item.status === 'ATRASADO') L.push('Seu pagamento está em atraso há ' + item.dias + ' dia(s).');
    else L.push('Seu pagamento vence ' + (item.venc === hojeEfetivo(state) ? 'hoje' : 'em ' + fmtDataBR(item.venc)) + '.');
    L.push('Valor para renovar/regularizar: ' + fmtBRL(item.cobrarAgora));
    L.push('Para quitar tudo: ' + fmtBRL(item.quitacao));
    if (state.config.chavePix) L.push('PIX: ' + state.config.chavePix);
    return L.join('\n');
  }

  function _csvNum(c) { return fmtNumBR(c).replace('-', '-'); }
  function _csvTxt(t) { return '"' + String(t === undefined || t === null ? '' : t).replace(/"/g, '""') + '"'; }

  function ledgerParaCSV(state) {
    const linhas = ['Data;Lancamento;Tipo;Contrato;Cliente;Recebido;Desconto;Disponivel;NaRua;Lucro;Perdas;Estornado;Obs'];
    state.ledger.forEach(function (e) {
      const cli = e.clienteId && state.clientes[e.clienteId] ? state.clientes[e.clienteId].nome : '';
      linhas.push([
        e.data, e.id, e.tipo, e.contratoId || '', _csvTxt(cli),
        e.recebido === undefined ? '' : _csvNum(e.recebido),
        e.desconto === undefined ? '' : _csvNum(e.desconto),
        _csvNum(e.deltas.disp), _csvNum(e.deltas.rua), _csvNum(e.deltas.lucro), _csvNum(e.deltas.perdas),
        e.estornadaPor ? 'SIM' : 'NAO', _csvTxt(e.obs),
      ].join(';'));
    });
    return linhas.join('\r\n');
  }

  /* ======================================================================
   * 11. AUDITORIA — verificador de integridade (roda em testes e no app)
   * ==================================================================== */
  function verificarIntegridade(state) {
    const erros = [];
    const r = { disp: 0, rua: 0, lucro: 0, perdas: 0 };
    const porId = {};
    state.ledger.forEach(function (e) {
      porId[e.id] = e;
      Object.keys(e.deltas).forEach(function (k) { r[k] += e.deltas[k]; });
    });
    ['disp', 'rua', 'lucro', 'perdas'].forEach(function (k) {
      if (r[k] !== state.caixa[k]) erros.push('Pote ' + k + ' difere do replay do ledger: ' + state.caixa[k] + ' vs ' + r[k]);
    });
    if (state.caixa.disp < 0 || state.caixa.lucro < 0) erros.push('Pote negativo.');

    let ruaContratos = 0;
    Object.keys(state.contratos).forEach(function (id) {
      const c = state.contratos[id];
      if (!Number.isSafeInteger(c.principalAberto) || c.principalAberto < 0) erros.push(id + ': principalAberto inválido');
      if (c.status === 'ATIVO') ruaContratos += c.principalAberto;
      else if (c.principalAberto !== 0) erros.push(id + ': contrato encerrado com principal em aberto');
      if (c.tipo === 'PARCELADO') {
        let sp = 0, aberto = 0;
        c.parcelas.forEach(function (p) {
          sp += p.principal;
          aberto += p.principal - p.abatPrincipal;
          if (p.abatJuros > p.juros || p.abatPrincipal > p.principal || p.abatEnc < 0) erros.push(id + ' parcela ' + p.n + ': abatimento maior que o devido');
          if (p.principal + p.juros !== p.valor) erros.push(id + ' parcela ' + p.n + ': principal+juros != valor');
        });
        if (sp !== c.principalOriginal) erros.push(id + ': soma dos principais das parcelas != principal original');
        if (c.status === 'ATIVO' && aberto !== c.principalAberto) erros.push(id + ': principalAberto != soma dos saldos das parcelas');
        if (c.status === 'QUITADO' && !c.parcelas.every(_parcelaQuitada)) erros.push(id + ': QUITADO com parcela aberta');
      }
      if (c.tipo === 'GIRO' && c.status === 'ATIVO' && (c.principalAberto < 1)) erros.push(id + ': giro ativo sem principal');
      const cli = state.clientes[c.clienteId];
      if (!cli) erros.push(id + ': cliente inexistente');
      else if (cli.scoreDec < SCORE_MIN || cli.scoreDec > SCORE_MAX) erros.push(c.clienteId + ': score fora de 1,0–5,0');
    });
    if (ruaContratos !== state.caixa.rua) erros.push('Capital na Rua (' + state.caixa.rua + ') != soma dos principais ativos (' + ruaContratos + ')');

    state.ledger.forEach(function (e) {
      if (e.tipo === 'BAIXA') {
        const cc = e.comp;
        if (e.recebido !== cc.encCash + cc.jurCash + cc.prinCash) erros.push(e.id + ': recebido != soma dos componentes em dinheiro');
        if (e.desconto !== cc.encDesc + cc.jurDesc + cc.prinDesc) erros.push(e.id + ': desconto != soma dos componentes de desconto');
        if (e.deltas.lucro !== cc.encCash + cc.jurCash) erros.push(e.id + ': lucro != encargos+juros em dinheiro');
        if (e.deltas.disp !== cc.prinCash) erros.push(e.id + ': disponível != principal em dinheiro');
      }
      if (e.estornadaPor) {
        const x = porId[e.estornadaPor];
        if (!x || x.tipo !== 'ESTORNO' || x.estornoDe !== e.id) erros.push(e.id + ': estorno referenciado inválido');
        else Object.keys(e.deltas).forEach(function (k) { if (x.deltas[k] !== -e.deltas[k]) erros.push(e.id + ': estorno não é o inverso exato em ' + k); });
      }
      if (e.tipo === 'ESTORNO') {
        const o = porId[e.estornoDe];
        if (!o || o.estornadaPor !== e.id) erros.push(e.id + ': estorno sem original correspondente');
      }
    });
    return { ok: erros.length === 0, erros: erros };
  }

  /* ======================================================================
   * 11b. ARQUIVAR PERÍODO (mantém o LocalStorage leve sem quebrar o Livro-Razão)
   * ==================================================================== */
  /**
   * Arquiva contratos ENCERRADOS (quitado/perda/cancelado) cujos lançamentos são todos
   * até a data de corte, e os movimentos soltos (+Entrada, -Saída, Reinvestimento) até o corte.
   * Os lançamentos viram UM lançamento "ARQUIVO" com a soma exata dos deltas: os potes não
   * mudam e o replay do Livro-Razão continua batendo. Contratos ativos nunca são arquivados.
   * Um contrato sai inteiro (todos os lançamentos juntos), então pares estorno/original nunca se separam.
   */
  function _planoArquivo(s, ate, hoje) {
    parseISO(ate); parseISO(hoje);
    const limite = addDias(hoje, -31);
    if (ate > limite) throw new EngineError('PERIODO_RECENTE', 'Só dá para arquivar movimentos com mais de 30 dias. Escolha uma data até ' + fmtDataBR(limite) + '.');
    const maxData = {};
    s.ledger.forEach(function (e) { if (e.contratoId && (!maxData[e.contratoId] || e.data > maxData[e.contratoId])) maxData[e.contratoId] = e.data; });
    const contratos = Object.keys(s.contratos).filter(function (id) {
      const c = s.contratos[id];
      return c.status !== 'ATIVO' && maxData[id] !== undefined && maxData[id] <= ate;
    });
    const set = {};
    contratos.forEach(function (id) { set[id] = true; });
    const lanc = s.ledger.filter(function (e) { return e.contratoId ? !!set[e.contratoId] : e.data <= ate; });
    if (!lanc.length) throw new EngineError('NADA_PARA_ARQUIVAR', 'Não há nada para arquivar até ' + fmtDataBR(ate) + '.');
    const qtd = lanc.reduce(function (a, e) { return a + (e.tipo === 'ARQUIVO' ? e.arquivados : 1); }, 0);
    return { ate: ate, contratos: contratos, lancamentos: lanc, qtd: qtd };
  }

  function previaArquivamento(state, dados) {
    const p = _planoArquivo(state, dados.ate, dados.hoje);
    return { ate: p.ate, qtdLancamentos: p.qtd, qtdContratos: p.contratos.length };
  }

  function arquivarPeriodo(state, dados) {
    const s = clone(state);
    const p = _planoArquivo(s, dados.ate, dados.hoje);
    const ids = {};
    p.lancamentos.forEach(function (e) { ids[e.id] = true; });
    const soma = _D(0, 0, 0, 0);
    p.lancamentos.forEach(function (e) { Object.keys(soma).forEach(function (k) { soma[k] += e.deltas[k] || 0; }); });
    const contratosRem = {};
    p.contratos.forEach(function (id) { contratosRem[id] = s.contratos[id]; delete s.contratos[id]; });
    const clientes = {};
    Object.keys(contratosRem).forEach(function (id) { const cid = contratosRem[id].clienteId; if (s.clientes[cid]) clientes[cid] = s.clientes[cid].nome; });
    s.ledger = s.ledger.filter(function (e) { return !ids[e.id]; });
    s.seq.ledger++;
    const ts = tsAgora(dados);
    s.ledger.unshift({ id: 'L' + s.seq.ledger, ts: ts, estornadaPor: null, tipo: 'ARQUIVO', data: p.ate, deltas: soma, arquivados: p.qtd, obs: 'Saldo de ' + p.qtd + ' lançamentos arquivados até ' + fmtDataBR(p.ate) });
    return {
      state: s,
      resumo: { qtdLancamentos: p.qtd, qtdContratos: p.contratos.length },
      arquivo: { tipo: 'ARQUIVO_PERIODO', versao: VERSAO, ate: p.ate, geradoEm: ts, clientes: clientes, contratos: contratosRem, ledger: p.lancamentos },
    };
  }

  /* ======================================================================
   * 12. PERSISTÊNCIA (export/import JSON com verificação)
   * ==================================================================== */
  function exportarJSON(state) { return JSON.stringify(state); }
  function importarJSON(texto) {
    let st;
    try { st = JSON.parse(texto); } catch (e) { throw new EngineError('JSON_INVALIDO', 'Arquivo JSON inválido.'); }
    if (!st || st.versao !== VERSAO || !st.caixa || !st.contratos || !st.clientes || !Array.isArray(st.ledger)) {
      throw new EngineError('VERSAO_INCOMPATIVEL', 'Arquivo não é um backup da versão ' + VERSAO + '.');
    }
    const v = verificarIntegridade(st);
    if (!v.ok) throw new EngineError('BACKUP_CORROMPIDO', 'Backup com inconsistências: ' + v.erros.slice(0, 3).join(' | '), { erros: v.erros });
    return st;
  }

  function estrelas(scoreDec) { return (scoreDec / 10).toFixed(1).replace('.', ','); }

  return {
    EngineError: EngineError, VERSAO: VERSAO, JANELA_ESTORNO: JANELA_ESTORNO, CICLOS: CICLOS, PERIODICIDADES: PERIODICIDADES,
    STATUS_LABEL: STATUS_LABEL, CENARIO_LABEL: CENARIO_LABEL,
    // dinheiro / datas
    mulBp: mulBp, mulDivRound: mulDivRound, fmtBRL: fmtBRL, fmtNumBR: fmtNumBR, centavosDeDigitos: centavosDeDigitos,
    parsePercentBp: parsePercentBp, fmtPercent: fmtPercent,
    parseISO: parseISO, addDias: addDias, diasEntre: diasEntre, diaSemana: diaSemana, fmtDataBR: fmtDataBR,
    hojeReal: hojeReal, hojeEfetivo: hojeEfetivo, vencEfetivo: vencEfetivo,
    // estado
    novoEstado: novoEstado, configPadrao: configPadrao, atualizarConfig: atualizarConfig,
    criarCliente: criarCliente, atualizarCliente: atualizarCliente, exposicaoCliente: exposicaoCliente, estrelas: estrelas,
    // caixa
    aporte: aporte, sangria: sangria, reinvestirLucro: reinvestirLucro,
    // contratos
    criarContratoGiro: criarContratoGiro, criarContratoParcelado: criarContratoParcelado,
    simularGiro: simularGiro, simularParcelado: simularParcelado, gerarParcelas: gerarParcelas,
    // cálculo
    dividaContrato: dividaContrato, dividaGiro: dividaGiro, dividaParcelado: dividaParcelado,
    statusContrato: statusContrato, proximoVencimento: proximoVencimento, alertaRenovacoes: alertaRenovacoes,
    proRataGiro: proRataGiro, diasAtraso: diasAtraso,
    // movimentos
    previewBaixa: previewBaixa, registrarBaixa: registrarBaixa, marcarPerda: marcarPerda,
    estornarUltimaBaixa: estornarUltimaBaixa, cancelarContrato: cancelarContrato,
    registrarPromessa: registrarPromessa, cancelarPromessa: cancelarPromessa,
    registrarAcordo: registrarAcordo, encerrarAcordo: encerrarAcordo,
    // relatórios
    agendaDoDia: agendaDoDia, fechamentoDoDia: fechamentoDoDia, resumoCaixa: resumoCaixa,
    gerarRecibo: gerarRecibo, linkWhatsApp: linkWhatsApp, mensagemCobranca: mensagemCobranca, ledgerParaCSV: ledgerParaCSV,
    // auditoria / persistência
    previaArquivamento: previaArquivamento, arquivarPeriodo: arquivarPeriodo, verificarIntegridade: verificarIntegridade, exportarJSON: exportarJSON, importarJSON: importarJSON,
  };
})();

export const EngineError = Engine.EngineError;
export default Engine;
