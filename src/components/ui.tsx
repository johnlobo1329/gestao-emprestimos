// @ts-nocheck — porte fiel do protótipo aprovado (lógica de tela intacta).
'use client';
/* eslint-disable */
import React, { useState, useEffect, useRef, useMemo, useCallback, useContext, createContext } from 'react';
import { createPortal } from 'react-dom';
import Engine from '@/lib/engine';

/* ============================================================================
 * 10-ui.jsx — Design System Apple iOS Dark Mode + primitivas reutilizáveis
 * Fundo #000, cartões #1C1C1E / #2C2C2E, cinza #8E8E93, semânticas iOS.
 * ========================================================================== */


/* ---------- contextos ---------- */
export const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);
export const ToastCtx = createContext(function () {});
export const useToast = () => useContext(ToastCtx);
export const UICtx = createContext({ discreto: false });

/* ---------- utilidades ---------- */
export const cx = (...a) => a.filter(Boolean).join(' ');
export const vibrar = (ms) => { try { if (navigator.vibrate) navigator.vibrate(ms || 12); } catch (e) { /* sem vibração */ } };
export const overlayEl = () => document.getElementById('overlay-root');
export const pad2 = (n) => String(n).padStart(2, '0');

export function baixarTexto(nome, texto, mime) {
  const blob = new Blob([texto], { type: mime || 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/* ---------- ícones SVG inline ---------- */
export const ICON_PATHS = {
  home: 'M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V9.5z',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  dollar: 'M12 1v22 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  sliders: 'M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6',
  eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeOff: 'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94 M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19 M14.12 14.12a3 3 0 1 1-4.24-4.24 M1 1l22 22',
  lock: 'M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z M7 11V7a5 5 0 0 1 10 0v4',
  plus: 'M12 5v14 M5 12h14',
  minus: 'M5 12h14',
  check: 'M20 6L9 17l-5-5',
  x: 'M18 6L6 18 M6 6l12 12',
  backspace: 'M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z M18 9l-6 6 M12 9l6 6',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2',
  alert: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4 M12 17h.01',
  repeat: 'M17 1l4 4-4 4 M3 11V9a4 4 0 0 1 4-4h14 M7 23l-4-4 4-4 M21 13v2a4 4 0 0 1-4 4H3',
  chat: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z',
  chevron: 'M9 18l6-6-6-6',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9',
  database: 'M12 8c4.97 0 9-1.34 9-3s-4.03-3-9-3-9 1.34-9 3 4.03 3 9 3z M21 12c0 1.66-4 3-9 3s-9-1.34-9-3 M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5',
};
export function Icon({ name, size = 24, className = '', strokeWidth = 2 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

/* ---------- dinheiro (respeita o Modo Discreto) ---------- */
export function Money({ cents, className = '', sign = false }) {
  const { discreto } = useContext(UICtx);
  if (discreto) return <span className={cx('tabular-nums', className)}>R$ •••••</span>;
  const txt = (sign && cents > 0 ? '+' : '') + Engine.fmtBRL(cents);
  return <span className={cx('tabular-nums', className)}>{txt}</span>;
}

/* ---------- botões, cartões, linhas ---------- */
export const BTN_VAR = {
  primary: 'bg-[#0A84FF] text-white',
  green: 'bg-[#30D158] text-black',
  orange: 'bg-[#FF9F0A] text-black',
  danger: 'bg-[#FF453A] text-white',
  secondary: 'bg-[#2C2C2E] text-white',
  ghost: 'bg-transparent text-[#0A84FF]',
};
export const BTN_SIZE = { lg: 'h-14 text-[17px]', md: 'h-11 text-[15px]', sm: 'h-9 text-[14px] px-3' };
export function Btn({ children, variant = 'primary', size = 'lg', onClick, disabled, className = '', type = 'button', ariaLabel }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} aria-label={ariaLabel}
      className={cx('w-full rounded-2xl font-semibold transition active:scale-95 disabled:opacity-40 disabled:active:scale-100 select-none flex items-center justify-center gap-2', BTN_VAR[variant], BTN_SIZE[size], className)}>
      {children}
    </button>
  );
}

export function Card({ children, className = '', ...rest }) {
  return <div {...rest} className={cx('bg-[#1C1C1E] rounded-3xl border border-white/10', className)}>{children}</div>;
}

export function SectionTitle({ children, right }) {
  return (
    <div className="flex items-center justify-between px-1 pt-5 pb-2">
      <h3 className="text-[13px] font-semibold uppercase tracking-wide text-[#8E8E93]">{children}</h3>
      {right}
    </div>
  );
}

export function Row({ label, hint, right, onClick, danger, icon, last }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} className={cx('w-full text-left flex items-center gap-3 min-h-[56px] px-4 py-2', !last && 'border-b border-white/10', onClick && 'active:bg-white/5 transition')}>
      {icon && <span className={cx('shrink-0', danger ? 'text-[#FF453A]' : 'text-[#0A84FF]')}><Icon name={icon} size={22} /></span>}
      <span className="flex-1 min-w-0">
        <span className={cx('block text-[17px]', danger ? 'text-[#FF453A]' : 'text-white')}>{label}</span>
        {hint && <span className="block text-[13px] text-[#8E8E93] leading-snug">{hint}</span>}
      </span>
      {right !== undefined && <span className="shrink-0 text-[#8E8E93] text-[15px] flex items-center gap-1">{right}</span>}
      {onClick && right === undefined && <span className="text-[#8E8E93]"><Icon name="chevron" size={18} /></span>}
    </Tag>
  );
}

export function Pill({ children, tone = 'gray' }) {
  const t = {
    gray: 'bg-white/10 text-[#8E8E93]', red: 'bg-[#FF453A]/15 text-[#FF453A]', orange: 'bg-[#FF9F0A]/15 text-[#FF9F0A]',
    green: 'bg-[#30D158]/15 text-[#30D158]', blue: 'bg-[#0A84FF]/15 text-[#0A84FF]',
  };
  return <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-semibold', t[tone])}>{children}</span>;
}

export function Banner({ tone = 'orange', icon = 'alert', children, action }) {
  const t = { orange: 'bg-[#FF9F0A]/15 text-[#FF9F0A] border-[#FF9F0A]/30', red: 'bg-[#FF453A]/15 text-[#FF453A] border-[#FF453A]/30', blue: 'bg-[#0A84FF]/15 text-[#0A84FF] border-[#0A84FF]/30' };
  return (
    <div className={cx('mx-4 my-2 rounded-2xl border px-3 py-2.5 flex items-center gap-2 text-[14px] font-medium', t[tone])} role="alert">
      <Icon name={icon} size={18} className="shrink-0" />
      <div className="flex-1 leading-snug">{children}</div>
      {action}
    </div>
  );
}

/* ---------- campos ---------- */
export function TextInput({ label, value, onChange, type = 'text', placeholder, autoComplete, inputMode, maxLength, error, autoFocus, name, onEnter, right }) {
  const [ver, setVer] = useState(false);
  const ehSenha = type === 'password';
  return (
    <label className="block">
      {label && <span className="block text-[13px] font-medium text-[#8E8E93] mb-1.5 px-1">{label}</span>}
      <span className="relative block">
        <input
          name={name} type={ehSenha && ver ? 'text' : type} value={value} placeholder={placeholder} autoComplete={autoComplete}
          inputMode={inputMode} maxLength={maxLength} autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && onEnter) onEnter(); }}
          className={cx('w-full h-14 rounded-2xl bg-[#2C2C2E] px-4 text-white placeholder-[#8E8E93] outline-none border focus:ring-2 focus:ring-[#0A84FF]', error ? 'border-[#FF453A]' : 'border-transparent', (ehSenha || right) && 'pr-14')}
        />
        {ehSenha && (
          <button type="button" onClick={() => setVer(!ver)} aria-label={ver ? 'Ocultar senha' : 'Mostrar senha'} className="absolute right-3 top-1/2 -translate-y-1/2 h-9 w-9 flex items-center justify-center text-[#8E8E93] active:scale-95">
            <Icon name={ver ? 'eyeOff' : 'eye'} size={20} />
          </button>
        )}
        {!ehSenha && right && <span className="absolute right-3 top-1/2 -translate-y-1/2">{right}</span>}
      </span>
      {error && <span className="block text-[13px] text-[#FF453A] mt-1.5 px-1">{error}</span>}
    </label>
  );
}

/** Moeda estilo app de banco: digita da direita para a esquerda; o estado é em CENTAVOS. */
export function CurrencyInput({ label, cents, onChange, autoFocus, hint, error, ariaLabel }) {
  const text = Engine.fmtBRL(cents);
  const toEnd = (e) => { const el = e.target; setTimeout(() => { try { el.setSelectionRange(el.value.length, el.value.length); } catch (_) { /* ok */ } }, 0); };
  return (
    <label className="block">
      {label && <span className="block text-[13px] font-medium text-[#8E8E93] mb-1.5 px-1">{label}</span>}
      <input
        value={text} inputMode="numeric" autoComplete="off" autoFocus={autoFocus} aria-label={ariaLabel || label}
        onChange={(e) => onChange(Engine.centavosDeDigitos(e.target.value, 11))}
        onFocus={toEnd} onClick={toEnd}
        className={cx('w-full h-16 rounded-2xl bg-[#2C2C2E] px-4 text-[28px] font-semibold tabular-nums text-right outline-none border focus:ring-2 focus:ring-[#0A84FF]', error ? 'border-[#FF453A]' : 'border-transparent', cents === 0 ? 'text-[#8E8E93]' : 'text-white')}
      />
      {hint && <span className="block text-[13px] text-[#8E8E93] mt-1.5 px-1">{hint}</span>}
      {error && <span className="block text-[13px] text-[#FF453A] mt-1.5 px-1">{error}</span>}
    </label>
  );
}

/** Percentual da direita para a esquerda (estado em pontos-base: 20,00% = 2000). */
export function PercentInput({ label, bp, onChange, max = 100000, ariaLabel }) {
  const text = Math.floor(bp / 100) + ',' + pad2(bp % 100) + '%';
  const toEnd = (e) => { const el = e.target; setTimeout(() => { try { el.setSelectionRange(el.value.length - 1, el.value.length - 1); } catch (_) { /* ok */ } }, 0); };
  return (
    <label className="block">
      {label && <span className="block text-[13px] font-medium text-[#8E8E93] mb-1.5 px-1">{label}</span>}
      <input value={text} inputMode="numeric" autoComplete="off" aria-label={ariaLabel || label}
        onChange={(e) => { const d = e.target.value.replace(/\D/g, '').slice(0, 6); onChange(Math.min(max, d ? Number(d) : 0)); }}
        onFocus={toEnd} onClick={toEnd}
        className="w-full h-14 rounded-2xl bg-[#2C2C2E] px-4 text-[20px] font-semibold tabular-nums text-right text-white outline-none border border-transparent focus:ring-2 focus:ring-[#0A84FF]" />
    </label>
  );
}

/** Seletor compacto [ % | R$ ] ao lado de um campo. */
export function TipoToggle({ value, onChange, opcoes, ariaLabel }) {
  return (
    <div className="inline-flex rounded-lg bg-[#2C2C2E] p-0.5" role="tablist" aria-label={ariaLabel}>
      {opcoes.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value} onClick={() => { vibrar(8); onChange(o.value); }}
          className={cx('h-8 px-3 rounded-md text-[13px] font-semibold transition active:scale-95', value === o.value ? 'bg-[#636366] text-white' : 'text-[#8E8E93]')}>{o.label}</button>
      ))}
    </div>
  );
}

/** Multa e Mora Diária: cada uma em % ou em valor fixo (R$). v = { multaTipo, multaBp, multaFixaCents, moraTipo, moraDiaBp, moraFixaCents } */
export function EncargoFields({ v, onChange }) {
  const set = (k, val) => onChange(Object.assign({}, v, { [k]: val }));
  return (
    <div className="space-y-3" data-testid="encargo-fields">
      <div>
        <div className="flex items-center justify-between mb-1.5 px-1">
          <span className="text-[13px] font-medium text-[#8E8E93]">Multa (única)</span>
          <TipoToggle ariaLabel="Tipo da multa" value={v.multaTipo} onChange={(x) => set('multaTipo', x)} opcoes={[{ value: 'PCT', label: '%' }, { value: 'FIXO', label: 'R$' }]} />
        </div>
        {v.multaTipo === 'FIXO'
          ? <CurrencyInput ariaLabel="Multa fixa em reais" cents={v.multaFixaCents} onChange={(x) => set('multaFixaCents', x)} />
          : <PercentInput ariaLabel="Multa em porcentagem" bp={v.multaBp} onChange={(x) => set('multaBp', x)} max={10000} />}
      </div>
      <div>
        <div className="flex items-center justify-between mb-1.5 px-1">
          <span className="text-[13px] font-medium text-[#8E8E93]">Mora por dia de atraso</span>
          <TipoToggle ariaLabel="Tipo da mora" value={v.moraTipo} onChange={(x) => set('moraTipo', x)} opcoes={[{ value: 'PCT', label: '%/dia' }, { value: 'FIXO', label: 'R$/dia' }]} />
        </div>
        {v.moraTipo === 'FIXO'
          ? <CurrencyInput ariaLabel="Mora fixa em reais por dia" cents={v.moraFixaCents} onChange={(x) => set('moraFixaCents', x)} />
          : <PercentInput ariaLabel="Mora em porcentagem por dia" bp={v.moraDiaBp} onChange={(x) => set('moraDiaBp', x)} max={1000} />}
      </div>
    </div>
  );
}

/** Lê as regras de encargo de config/contrato; dado antigo sem tipo = percentual. */
export function encargosDe(o) {
  return {
    multaTipo: o.multaTipo === 'FIXO' ? 'FIXO' : 'PCT', multaBp: o.multaBp, multaFixaCents: o.multaFixaCents || 0,
    moraTipo: o.moraTipo === 'FIXO' ? 'FIXO' : 'PCT', moraDiaBp: o.moraDiaBp, moraFixaCents: o.moraFixaCents || 0,
  };
}
export function ResumoEncargos({ r }) {
  const e = encargosDe(r);
  return (
    <>
      multa {e.multaTipo === 'FIXO' ? <Money cents={e.multaFixaCents} /> : Engine.fmtPercent(e.multaBp)} + mora {e.moraTipo === 'FIXO' ? <Money cents={e.moraFixaCents} /> : Engine.fmtPercent(e.moraDiaBp)}/dia
    </>
  );
}

export function Switch({ checked, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => { vibrar(8); onChange(!checked); }}
      className={cx('relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors', checked ? 'bg-[#30D158]' : 'bg-[#39393D]')}>
      <span className={cx('absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-[2px]')} />
    </button>
  );
}

export function Segmented({ options, value, onChange }) {
  return (
    <div className="flex rounded-xl bg-[#2C2C2E] p-1 gap-1" role="tablist">
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={cx('flex-1 h-10 rounded-lg text-[14px] font-semibold transition active:scale-95', value === o.value ? 'bg-[#636366] text-white' : 'text-[#8E8E93]')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- bottom sheet (portal dentro do frame mobile) ---------- */
export function BottomSheet({ open, onClose, title, children, footer }) {
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="absolute inset-0 z-50 pointer-events-auto flex items-end" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/60 anim-fade" onClick={onClose} />
      <div className="relative w-full max-h-[92%] flex flex-col bg-[#1C1C1E] rounded-t-3xl border-t border-white/10 anim-sheet pb-[env(safe-area-inset-bottom)]">
        <div className="pt-2 flex justify-center"><div className="h-1.5 w-10 rounded-full bg-white/20" /></div>
        <div className="px-5 pt-2 pb-3 flex items-center justify-between">
          <h2 className="text-[20px] font-bold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="h-8 w-8 rounded-full bg-[#2C2C2E] text-[#8E8E93] flex items-center justify-center active:scale-95"><Icon name="x" size={18} /></button>
        </div>
        <div className="px-5 pb-4 overflow-y-auto space-y-4">{children}</div>
        {footer && <div className="px-5 pb-4 pt-3 border-t border-white/10 space-y-2">{footer}</div>}
      </div>
    </div>,
    overlayEl()
  );
}

/** Tela cheia sobre o app (usada pelo fluxo de PIN dentro de Ajustes). */
export function FullOverlay({ children }) {
  return createPortal(<div className="absolute inset-0 z-50 bg-black pointer-events-auto anim-fade">{children}</div>, overlayEl());
}

/* ---------- toasts ---------- */
export function ToastHost({ children }) {
  const [t, setT] = useState(null);
  const timer = useRef(null);
  const toast = useCallback((msg, kind) => {
    const k = kind || 'info';
    setT({ msg, kind: k, id: Date.now() + Math.random() });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setT(null), k === 'erro' ? 4500 : 2600);
  }, []);
  const cor = t && (t.kind === 'erro' ? 'bg-[#FF453A] text-white' : t.kind === 'ok' ? 'bg-[#30D158] text-black' : 'bg-[#3A3A3C] text-white');
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      {t && createPortal(
        <div className="absolute top-3 inset-x-0 z-[60] flex justify-center px-4 pointer-events-none">
          <div key={t.id} role="status" className={cx('anim-toast max-w-full rounded-2xl px-4 py-3 text-[15px] font-semibold shadow-xl', cor)}>{t.msg}</div>
        </div>,
        overlayEl()
      )}
    </ToastCtx.Provider>
  );
}

/* ---------- teclado numérico de PIN estilo iPhone ---------- */
export function PinPad({ title, subtitle, onComplete, erro, shakeKey, disabled, children }) {
  const [pin, setPin] = useState('');
  const doneRef = useRef(onComplete);
  doneRef.current = onComplete;

  useEffect(() => { setPin(''); }, [shakeKey]);
  useEffect(() => {
    if (pin.length !== 4) return undefined;
    const id = setTimeout(() => doneRef.current(pin), 140);
    return () => clearTimeout(id);
  }, [pin]);

  const press = useCallback((d) => {
    if (disabled) return;
    vibrar(8);
    setPin((p) => (p.length >= 4 ? p : p + d));
  }, [disabled]);
  const apagar = useCallback(() => { if (!disabled) { vibrar(8); setPin((p) => p.slice(0, -1)); } }, [disabled]);

  useEffect(() => {
    const h = (e) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') apagar();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [press, apagar]);

  const tecla = 'h-[76px] w-[76px] rounded-full bg-[#1C1C1E] text-[30px] font-light text-white flex items-center justify-center active:bg-[#3A3A3C] active:scale-95 transition disabled:opacity-40 select-none';
  return (
    <div className="h-full flex flex-col items-center justify-center px-6 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="h-14 w-14 rounded-full bg-[#1C1C1E] border border-white/10 flex items-center justify-center text-[#0A84FF] mb-5"><Icon name="lock" size={26} /></div>
      <h1 className="text-[22px] font-bold text-center">{title}</h1>
      <p className="text-[15px] text-[#8E8E93] mt-1 text-center min-h-[22px]">{subtitle}</p>
      <div key={shakeKey} className={cx('flex gap-5 my-7', erro && 'anim-shake')} aria-label={pin.length + ' de 4 dígitos'}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cx('h-4 w-4 rounded-full border-2 transition', i < pin.length ? 'bg-white border-white scale-110' : 'border-[#636366]', erro && 'border-[#FF453A]', erro && i < pin.length && 'bg-[#FF453A]')} />
        ))}
      </div>
      <p className="min-h-[40px] text-[14px] text-[#FF453A] text-center font-medium" role="alert">{erro || ''}</p>
      <div className="grid grid-cols-3 gap-x-6 gap-y-4 mt-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} type="button" className={tecla} onClick={() => press(d)} disabled={disabled} aria-label={d}>{d}</button>
        ))}
        <span />
        <button type="button" className={tecla} onClick={() => press('0')} disabled={disabled} aria-label="0">0</button>
        <button type="button" className="h-[76px] w-[76px] flex items-center justify-center text-[#8E8E93] active:scale-95 transition" onClick={apagar} disabled={disabled} aria-label="Apagar"><Icon name="backspace" size={28} /></button>
      </div>
      <div className="mt-6 w-full max-w-[300px] space-y-1">{children}</div>
    </div>
  );
}

export class ErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { erro: null }; }
  static getDerivedStateFromError(erro) { return { erro }; }
  componentDidCatch(erro, info) { console.error('Falha de tela:', erro, info); }
  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="text-[#FF453A]"><Icon name="alert" size={44} /></div>
        <h1 className="text-[22px] font-bold">Algo deu errado nesta tela</h1>
        <p className="text-[15px] text-[#8E8E93]">Seus dados estão salvos. Recarregue o app para continuar.</p>
        <p className="text-[12px] text-[#636366] break-words max-w-full">{String(this.state.erro && this.state.erro.message)}</p>
        <button type="button" onClick={() => window.location.reload()} className="h-14 px-8 rounded-2xl bg-[#0A84FF] font-semibold text-[17px] active:scale-95">Recarregar</button>
      </div>
    );
  }
}
