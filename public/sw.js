/* Service worker mínimo e SEGURO para dados financeiros.
   - Guarda só o "casco" do app (HTML/JS/CSS/ícones) para abrir rápido e instalar.
   - NUNCA guarda respostas do Supabase (dados/login): sempre vão direto à rede.
   Mudou algo importante? Aumente CACHE_VERSAO para limpar o cache antigo. */
const CACHE_VERSAO = 'financas-v1';
const CASCO = ['/', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_VERSAO).then((c) => c.addAll(CASCO)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE_VERSAO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET') return;                 // nunca interceptar gravações
  if (url.origin !== self.location.origin) return;  // Supabase e qualquer outro domínio: rede direta
  if (url.pathname.startsWith('/api/')) return;

  // Navegação: rede primeiro (sempre a versão nova), cache só se estiver offline
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/')));
    return;
  }
  // Arquivos estáticos: cache primeiro, atualiza em segundo plano
  e.respondWith(
    caches.match(req).then((hit) => {
      const rede = fetch(req).then((res) => {
        if (res.ok && (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/'))) {
          const copia = res.clone();
          caches.open(CACHE_VERSAO).then((c) => c.put(req, copia));
        }
        return res;
      }).catch(() => hit);
      return hit || rede;
    })
  );
});
