'use client';
import dynamic from 'next/dynamic';

/** O app inteiro roda só no navegador (login, PIN e Supabase dependem de window/localStorage). */
const App = dynamic(() => import('@/components/App'), {
  ssr: false,
  loading: () => (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8E8E93', background: '#000' }}>
      Carregando…
    </div>
  ),
});

export default function Home() {
  return <App />;
}
