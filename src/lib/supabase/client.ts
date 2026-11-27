import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let instancia: SupabaseClient | null = null;

/** Cliente único do navegador. Usa APENAS a chave publicável (anon): a segurança real está no RLS do banco. */
export function supabase(): SupabaseClient {
  if (!instancia) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !chave) throw new Error('Faltam NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY no .env.local (e na Vercel).');
    instancia = createBrowserClient(url, chave);
  }
  return instancia;
}

/** Compatível com a página de teste da Etapa 2. */
export const criarClienteSupabase = supabase;
