/* studio Ti Artes — Studio OS · service worker
   Rede primeiro (pega atualização quando há sinal), cache de reserva
   (funciona 100% offline no avião, no estúdio sem internet, etc.).

   Duas coisas aqui existem só pra resolver o "no celular não atualizou":

   1. O pedido do HTML sai com cache:'no-store'. Sem isso o próprio
      navegador entrega uma cópia velha pro service worker e ele nunca
      vê que saiu versão nova — parece rede, mas não é.

   2. Nada de skipWaiting automático. O worker novo espera de lado até
      a página mandar {tipo:'assumir'}, e só então troca e recarrega.
      Assim ninguém perde o que estava digitando no meio de um job. */
const CACHE = 'tiartes-os-v126';
const ESSENCIAL = [
  './', './index.html', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'
];

self.addEventListener('install', e => {
  /* Limpar tambem no INSTALL, nao so no activate.
     O activate so roda quando o worker novo assume — e ele nao assume
     enquanto a aba do app estiver aberta. Ele deixa a aba aberta o dia
     todo, entao a limpeza nunca rodava: achei cinco caches empilhados
     no navegador dele (v41 a v45). Aqui eu guardo o atual e no maximo um
     anterior (pro app velho continuar funcionando offline enquanto o
     novo espera) e apago o resto. */
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(ESSENCIAL);
    const ks = (await caches.keys()).filter(k => k !== CACHE).sort();
    const apagar = ks.slice(0, Math.max(0, ks.length - 1));
    await Promise.all(apagar.map(k => caches.delete(k)));
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* a página pede a troca quando a pessoa aperta "Atualizar" */
self.addEventListener('message', e => {
  if (e.data && e.data.tipo === 'assumir') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  /* o documento e o app em si nunca podem vir do cache do navegador:
     é exatamente aí que a versão velha se esconde */
  const ehApp = req.mode === 'navigate' ||
                req.destination === 'document' ||
                /\/(index\.html)?$/.test(new URL(req.url).pathname);

  const pedido = ehApp
    ? fetch(new Request(req.url, {cache: 'no-store', credentials: 'same-origin'}))
    : fetch(req);

  e.respondWith(
    pedido
      .then(res => {
        if (res && res.ok) {
          const copia = res.clone();
          caches.open(CACHE).then(c => c.put(req, copia)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
  );
});
