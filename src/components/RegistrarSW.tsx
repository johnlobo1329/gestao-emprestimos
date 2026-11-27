'use client';
import { useEffect } from 'react';

/** Registra o service worker (só em produção, para não atrapalhar o `npm run dev`). */
export default function RegistrarSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  return null;
}
