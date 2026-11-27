/* eslint-disable @typescript-eslint/no-explicit-any */
/** Tipos públicos do motor (o motor em si é JS portado 1:1; estes tipos descrevem o ESTADO que ele troca). */
export interface Deltas { disp: number; rua: number; lucro: number; perdas: number }

export interface ConfigMotor {
  taxaPadraoBp: { MENSAL: number; QUINZENAL: number; SEMANAL: number };
  taxaParceladoBp: number;
  multaBp: number; moraDiaBp: number;
  multaTipo: 'PCT' | 'FIXO'; multaFixaCents: number;
  moraTipo: 'PCT' | 'FIXO'; moraFixaCents: number;
  baseEncargo: 'MONTANTE' | 'PRINCIPAL';
  carenciaFds: boolean; tetoPadraoCents: number;
  chavePix: string; dataSimulada: string | null; modoDiscreto: boolean;
}

export interface ClienteMotor {
  id: string; nome: string; telefone: string; cpf: string; email: string;
  tags: string[]; tetoCents: number; scoreDec: number; obs: string; criadoEm: string;
}

export interface ParcelaMotor {
  n: number; venc: string; valor: number; principal: number; juros: number;
  abatEnc: number; abatJuros: number; abatPrincipal: number; diasPenalizados: number;
  [extra: string]: unknown;
}

export interface RegrasContrato {
  multaBp: number; moraDiaBp: number; baseEncargo: 'MONTANTE' | 'PRINCIPAL'; carenciaFds: boolean;
  multaTipo?: 'PCT' | 'FIXO'; multaFixaCents?: number; moraTipo?: 'PCT' | 'FIXO'; moraFixaCents?: number;
}

export interface ContratoMotor {
  id: string; tipo: 'GIRO' | 'PARCELADO'; clienteId: string;
  ciclo?: string; cicloDias?: number; n?: number; periodicidade?: string;
  principalOriginal: number; principalAberto: number; principalPerdido?: number; taxaBp: number;
  regras: RegrasContrato; dataInicio: string; vencimento: string | null;
  jurosPendente: number; renovacoes: number; renovacoesSeguidas: number;
  status: 'ATIVO' | 'QUITADO' | 'PERDA' | 'CANCELADO';
  promessa: unknown | null; acordo: unknown | null; pausas: unknown[];
  parcelas: ParcelaMotor[] | null; obs: string;
}

export interface LancamentoMotor {
  id: string; ts: string; estornadaPor: string | null;
  tipo: 'APORTE' | 'SANGRIA' | 'REINVESTIMENTO' | 'EMPRESTIMO' | 'BAIXA' | 'PERDA' | 'ESTORNO' | 'ARQUIVO';
  data: string; deltas: Deltas; obs?: string;
  [extra: string]: unknown;
}

export interface EstadoMotor {
  versao: number;
  config: ConfigMotor;
  clientes: Record<string, ClienteMotor>;
  contratos: Record<string, ContratoMotor>;
  ledger: LancamentoMotor[];
  caixa: Deltas;
  seq: { cliente: number; contrato: number; ledger: number };
}

/** Pacote enviado à função aplicar_mudancas (só o que mudou). */
export interface Pacote {
  config?: Record<string, unknown>;
  clientes?: Record<string, unknown>[];
  contratos?: Record<string, unknown>[];
  parcelas?: Record<string, unknown>[];
  ledger?: Record<string, unknown>[];
  del_clientes?: string[];
  del_contratos?: string[];
  del_ledger?: string[];
  arquivo?: { ate: string; conteudo: unknown };
}

type Linha = Record<string, any>;
/** Linhas exatamente como vêm do Supabase (select *). */
export interface LinhasBanco {
  config: Linha; clientes: Linha[]; contratos: Linha[]; parcelas: Linha[]; ledger: Linha[];
}
