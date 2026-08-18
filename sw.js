/* Service Worker de Próxima Salida
 * ================================
 * Dos funciones:
 *  1. Caché offline. Los datos del consorcio son estáticos (se regeneran
 *     a mano cuando cambian los horarios), así que se pueden servir desde
 *     caché sin miedo. Esto hace que la app funcione en el metro, en la
 *     parada sin cobertura, etc. — que es justo cuando hace falta.
 *  2. Notificaciones en móvil. Android/Chrome prohíbe `new Notification()`
 *     y exige que las lance un Service Worker; al estar publicado en
 *     GitHub Pages (HTTPS) ya podemos registrar uno de verdad.
 */

// v2: el fichero de datos cambia de forma (cada parada trae ya su
// municipio), así que hay que invalidar lo cacheado o las instalaciones
// existentes seguirían sirviendo la versión vieja.
const CACHE = "proxima-salida-v2";

// Ficheros propios de la app. Rutas relativas para que funcione igual en
// https://usuario.github.io/BusesAndalucia/ que en un servidor local.
const RECURSOS = [
  "./",
  "./index.html",
  "./ctas_data_app.json",
  "./ctas_routing.json",
  "./manifest.json"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      // addAll falla entero si un solo recurso falla; los añadimos uno a
      // uno para que un fallo puntual no rompa la instalación.
      .then(cache => Promise.allSettled(RECURSOS.map(r => cache.add(r))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(nombres => Promise.all(nombres.filter(n => n !== CACHE).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

/* Estrategia: primero la red (para que un "↻ Actualizar datos" traiga
 * horarios frescos), y si falla, lo que haya en caché. Así nunca se
 * queda obsoleto teniendo cobertura, pero sigue funcionando sin ella. */
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Solo gestionamos lo de nuestro propio origen: los tiles del mapa y
  // las fuentes los deja pasar el navegador con su caché normal.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then(resp => {
        const copia = resp.clone();
        caches.open(CACHE).then(cache => cache.put(req, copia)).catch(() => {});
        return resp;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match("./index.html")))
  );
});

/* Al tocar la notificación, traer al frente la pestaña de la app (o
 * abrirla si estaba cerrada). */
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(lista => {
      for (const cliente of lista) {
        if ("focus" in cliente) return cliente.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("./");
    })
  );
});
