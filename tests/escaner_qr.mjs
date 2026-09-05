/* El scope reducido: pegatinas de QR en las paradas.
 *
 * Con la app en su versión servida (menú inferior y buscador de ruta
 * ocultos, ver el comentario junto al <nav> en index.html), el camino de
 * entrada es siempre una parada: por el enlace del QR (cubierto en
 * qr_parada.mjs) o escaneándolo con la cámara desde dentro de la app.
 * Esta prueba cubre lo segundo, más lo que se hace ya en la ficha de la
 * parada: filtrar por línea y guardar una línea suelta a favoritos.
 *
 * El lector real de QR (jsQR, en `lib/jsQR.js`) decodifica píxeles de
 * vídeo de verdad, que no hay forma sencilla de fabricar en una prueba;
 * en su lugar se sustituye `window.jsQR` por un doble antes de abrir el
 * escáner, así se prueba el cableado completo (cámara → decodificar →
 * abrir la ficha de la parada) sin depender de reconocer una imagen.
 *
 *   npm i -D playwright && npx playwright install chromium
 *   python3 -m http.server 8765 &
 *   node tests/escaner_qr.mjs
 */
import fs from 'fs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

function servirLeafletLocal(page) {
  const dir = process.env.LEAFLET_DIR;
  if (!dir) return Promise.resolve();
  return Promise.all([
    page.route('**/leaflet@*/dist/leaflet.js', r =>
      r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(dir + '/leaflet.js', 'utf8') })),
    page.route('**/leaflet@*/dist/leaflet.css', r =>
      r.fulfill({ contentType: 'text/css', body: fs.readFileSync(dir + '/leaflet.css', 'utf8') }))
  ]);
}

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  // Cámara sintética: sin esto, getUserMedia se queda esperando un permiso
  // que nadie va a conceder en un Chromium headless.
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
});
const context = await browser.newContext({ viewport: { width: 412, height: 900 } });
await context.grantPermissions(['camera'], { origin: BASE });
const page = await context.newPage();
const errores = [];
page.on('pageerror', e => errores.push('PAGEERROR: ' + e.message));
page.on('console', m => {
  if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push('CONSOLE: ' + m.text());
});
await servirLeafletLocal(page);
await page.route('**/tile.openstreetmap.org/**', r => r.fulfill({ contentType: 'image/png', body: Buffer.from('') }));
await page.addInitScript(() => {
  try { localStorage.setItem('ctanConsorcioV1', JSON.stringify({ id: 1 })); } catch (e) { }
});
await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof CTAN !== 'undefined' && CTAN.cargado && CTAN.horarios.has(1), null, { timeout: 30000 });

let fallos = 0;
const ok = (cond, txt, extra) => {
  console.log((cond ? '  ok   ' : 'FALLA  ') + txt + (extra !== undefined ? '   → ' + extra : ''));
  if (!cond) fallos++;
};

/* ------------------------------------------------------------------ */
/* 1. Scope reducido: sin menú inferior ni buscador de ruta en Inicio,  */
/*    pero con el botón de escanear a la vista                         */
/* ------------------------------------------------------------------ */
const scope = await page.evaluate(() => ({
  navOculto: document.getElementById('mainNav').hidden,
  buscadorRutaOculto: document.querySelector('.home-search').hidden,
  rutasFavOcultas: document.getElementById('favRutasList').hidden,
  botonEscanerVisible: !document.getElementById('btnEscanearQr').hidden
    && document.getElementById('btnEscanearQr').offsetParent !== null
}));
ok(scope.navOculto, 'el menú inferior (Líneas/Ruta/Avisos) está oculto', JSON.stringify(scope));
ok(scope.buscadorRutaOculto, 'el buscador de destino de Inicio (la puerta a Ruta) está oculto');
ok(scope.rutasFavOcultas, 'la sección de rutas favoritas del cajón está oculta');
ok(scope.botonEscanerVisible, 'y el botón "Escanear QR" de la cabecera sí se ve');

/* ------------------------------------------------------------------ */
/* 2. paradaIdDesdeTextoQr(): saca el id tanto de la URL completa como  */
/*    de un id suelto, y descarta lo que no sea una parada nuestra      */
/* ------------------------------------------------------------------ */
const extraccion = await page.evaluate(() => {
  const id = Object.keys(APP.data.paradas)[0];
  return {
    desdeUrl: paradaIdDesdeTextoQr(location.origin + location.pathname + '?parada=' + id) === id,
    desdeIdSuelto: paradaIdDesdeTextoQr(id) === id,
    urlSinParada: paradaIdDesdeTextoQr('https://example.com/otra-cosa'),
    textoInventado: paradaIdDesdeTextoQr('esto no es un QR de parada'),
    vacio: paradaIdDesdeTextoQr('')
  };
});
ok(extraccion.desdeUrl, 'reconoce el id cuando el QR trae la URL completa de la parada');
ok(extraccion.desdeIdSuelto, 'y también cuando trae sólo el id, a pelo');
ok(extraccion.urlSinParada == null, 'una URL sin "?parada=" no da ningún id', extraccion.urlSinParada);
ok(extraccion.textoInventado == null, 'un texto que no es ni URL ni id no da ningún id', extraccion.textoInventado);
ok(extraccion.vacio == null, 'y un texto vacío tampoco', extraccion.vacio);

/* ------------------------------------------------------------------ */
/* 3. Escanear con la cámara: pide el vídeo, decodifica y abre la ficha */
/* ------------------------------------------------------------------ */
const stopId = await page.evaluate(() =>
  Object.entries(APP.data.paradas).find(([, p]) => p.nombre.toUpperCase() === 'AV ANDALUCIA (ARROYO)')[0]);

// Doble de jsQR: en vez de reconocer píxeles, devuelve directo la URL de
// la parada elegida. Así se prueba el resto del cableado sin depender de
// que la cámara sintética de Chromium "vea" un QR de verdad.
await page.evaluate(id => {
  window.jsQR = () => ({ data: location.origin + location.pathname + '?parada=' + id });
}, stopId);

await page.click('#btnEscanearQr');
await page.waitForSelector('#qrScanVideo', { timeout: 5000 });
await page.waitForFunction(() => {
  const v = document.getElementById('qrScanVideo');
  return v && v.readyState >= v.HAVE_CURRENT_DATA;
}, null, { timeout: 10000 });

await page.waitForSelector('#modalOverlay .detail-title', { timeout: 10000 });
const tituloEscaneado = (await page.locator('#modalOverlay .detail-title').innerText()).trim();
ok(/^AV ANDALUCIA \(ARROYO\)/i.test(tituloEscaneado),
  'al "leer" el QR con la cámara se abre sola la ficha de esa parada', tituloEscaneado);

const camaraTrasAbrir = await page.evaluate(() => CURRENT_MODAL_QR_REF.stream === null && CURRENT_MODAL_QR_REF.raf === null);
ok(camaraTrasAbrir, 'y la cámara se suelta en cuanto se navega a la ficha (no se queda encendida de fondo)');

/* ------------------------------------------------------------------ */
/* 4. Un QR que no es de una parada nuestra: aviso, y la cámara sigue    */
/* ------------------------------------------------------------------ */
await page.click('#modalCloseBtn');   // cierra la ficha que dejó el paso 3
await page.evaluate(() => { window.jsQR = () => ({ data: 'esto no lleva a ninguna parada' }); });
await page.click('#btnEscanearQr');
await page.waitForSelector('#qrScanVideo', { timeout: 5000 });
await page.waitForFunction(() => {
  const v = document.getElementById('qrScanVideo');
  return v && v.readyState >= v.HAVE_CURRENT_DATA;
}, null, { timeout: 10000 });
await page.waitForFunction(() =>
  document.getElementById('qrScanEstado')?.textContent === 'Ese código QR no lleva a ninguna parada de esta app.',
  null, { timeout: 10000 });
ok(true, 'un QR ajeno da un aviso claro, sin cerrar el escáner');

/* ------------------------------------------------------------------ */
/* 5. Cerrar el escáner suelta la cámara aunque no se haya leído nada   */
/* ------------------------------------------------------------------ */
await page.click('#modalCloseBtn');
const camaraTrasCerrar = await page.evaluate(() => CURRENT_MODAL_QR_REF.stream === null && CURRENT_MODAL_QR_REF.raf === null);
ok(camaraTrasCerrar, 'y al pulsar "Cerrar" a mano también se suelta la cámara');

/* ------------------------------------------------------------------ */
/* 6. En la ficha de una parada con varias líneas: filtrar y guardar    */
/*    una línea suelta a favoritos                                     */
/* ------------------------------------------------------------------ */
const multiParada = await page.evaluate(() => {
  for (const id of Object.keys(APP.data.paradas)) {
    const grupos = sentidosEnParada(id, null);
    const slugs = new Set(grupos.map(g => g.lineaSlug));
    if (slugs.size > 1) return { id, slugs: [...slugs] };
  }
  return null;
});

if (!multiParada) {
  console.log('  (sin parada con más de una línea en los datos de prueba: se omite el bloque 6)');
} else {
  await page.evaluate(id => openModalConHorarios(areaDeParada(id), cont => buildStopScheduleModalContent(cont, id)), multiParada.id);
  await page.waitForSelector('#stopLineFilter .muni-chip', { timeout: 10000 });

  const chips = await page.locator('#stopLineFilter .muni-chip').allInnerTexts();
  ok(chips[0] === 'Todas', 'el filtro de línea trae "Todas" primero', JSON.stringify(chips));
  ok(chips.length === multiParada.slugs.length + 1, 'y un botón por cada línea distinta de la parada', JSON.stringify(chips));

  // Se filtra por el primer chip de línea (índice 1, tras "Todas") y se
  // comprueba por su código —no por el slug, que no tiene por qué salir
  // en el mismo orden en el chip y en la búsqueda de más arriba— que sólo
  // quedan a la vista sus filas.
  const codigoElegido = chips[1];
  await page.locator('#stopLineFilter .muni-chip').nth(1).click();
  const visibilidad = await page.evaluate(codigo => {
    const filas = [...document.querySelectorAll('#stopScheduleList li[data-linea-slug]')];
    return filas.every(li => li.hidden === (li.querySelector('.home-fav-code').textContent !== codigo));
  }, codigoElegido);
  ok(visibilidad, 'al pulsar el chip de una línea, sólo se ven sus filas', codigoElegido);

  await page.locator('#stopLineFilter .muni-chip', { hasText: 'Todas' }).click();
  const todasVisibles = await page.evaluate(() =>
    [...document.querySelectorAll('#stopScheduleList li[data-linea-slug]')].every(li => !li.hidden));
  ok(todasVisibles, 'y "Todas" vuelve a enseñarlas todas');

  // Guardar una línea suelta desde la ficha: debe marcarse favorita y
  // aparecer en Inicio con la cuenta atrás, sin tener que pasar por la
  // pantalla de Líneas (oculta en esta versión).
  const slugAGuardar = multiParada.slugs[0];
  await page.evaluate(() => { FAVORITOS.lineas = []; guardarFavoritos(); });
  const filaLinea = page.locator(`#stopScheduleList li[data-linea-slug="${slugAGuardar}"]`).first();
  await filaLinea.locator('.linea-fav').click();
  const favTrasGuardar = await page.evaluate(slug => ({
    esFav: esFavoritoLinea(slug),
    referencia: (FAVORITOS.lineas.find(l => l.slug === slug) || {}).referencias
  }), slugAGuardar);
  ok(favTrasGuardar.esFav, 'pulsar la estrella de una línea en la ficha la guarda como favorita');
  ok(Array.isArray(favTrasGuardar.referencia) && favTrasGuardar.referencia.some(r => r.paradaId === multiParada.id),
    'y la ancla a esta parada, no a las cabeceras por defecto de la línea', JSON.stringify(favTrasGuardar.referencia));

  await page.evaluate(() => renderHomeFavSalidas());
  await page.evaluate(() => irAPantalla('screenInicio'));
  const enInicio = await page.evaluate(slug =>
    !!document.querySelector(`#homeFavSalidas .salida-fila .home-fav-code.es-fav`) &&
    Array.from(document.querySelectorAll('#homeFavSalidas .home-fav-code')).some(el => el.classList.contains('es-fav')),
    slugAGuardar);
  ok(enInicio, 'y la línea guardada se distingue ya en el resumen de Inicio');

  // Se vuelve a pulsar para no dejar el estado sucio de cara a otra prueba.
  await filaLinea.locator('.linea-fav').click();
}

ok(errores.length === 0, 'sin errores en consola', JSON.stringify(errores));
console.log(fallos ? `\n${fallos} comprobaciones fallidas` : '\nTodo correcto');
await browser.close();
process.exit(fallos ? 1 : 0);
