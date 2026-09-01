/* Un QR que lleve directo a la próxima salida de una parada — para
 * pegarlo, por ejemplo, en la marquesina de la parada de casa.
 *
 * Dos piezas:
 *  - Un enlace propio por parada (`?parada=<id>`, `urlDeParada()`): al
 *    entrar por ahí, la app abre la ficha de esa parada sola, sin tener
 *    que buscarla a mano. Es el caso de uso completo del QR: escanear y
 *    ver la próxima salida, no escanear y encima tener que encontrarla
 *    entre miles.
 *  - En la propia ficha, "Ver código QR" dibuja ese enlace como un QR
 *    de verdad (`mostrarQrParada`), listo para hacerle una captura o
 *    imprimirlo, y "Compartir esta parada" lo manda por la vía nativa
 *    del móvil o lo copia al portapapeles.
 *
 * La librería de QR (qrcode-generator, de terceros) se carga bajo
 * demanda desde un CDN, igual que Leaflet: no vale la pena metérsela a
 * todo el mundo en el arranque por un botón que casi nadie toca. Aquí se
 * sirve en local, igual que con Leaflet, para no depender de la red.
 *
 *   npm i -D playwright && npx playwright install chromium
 *   python3 -m http.server 8765 &
 *   node tests/qr_parada.mjs
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

function servirQrLocal(page) {
  const dir = process.env.QR_LIB_DIR;
  if (!dir) return Promise.resolve();
  return page.route('https://unpkg.com/qrcode-generator@2.0.4/qrcode.js', r =>
    r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(dir + '/qrcode.js', 'utf8') }));
}

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765';
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const context = await browser.newContext({ viewport: { width: 412, height: 900 } });
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
const page = await context.newPage();
const errores = [];
page.on('pageerror', e => errores.push('PAGEERROR: ' + e.message));
page.on('console', m => {
  if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push('CONSOLE: ' + m.text());
});
await servirLeafletLocal(page);
await servirQrLocal(page);
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
/* 1. urlDeParada(): el enlace que se codifica en el QR                 */
/* ------------------------------------------------------------------ */
const enlace = await page.evaluate(() => {
  const id = Object.keys(APP.data.paradas)[0];
  return { id, url: urlDeParada(id), esperado: location.origin + location.pathname + '?parada=' + id };
});
ok(enlace.url === enlace.esperado, 'urlDeParada() arma el enlace con origen, ruta e id de la parada', JSON.stringify(enlace));

/* ------------------------------------------------------------------ */
/* 2. La ficha de una parada trae "Ver código QR" y "Compartir"         */
/* ------------------------------------------------------------------ */
const stopId = await page.evaluate(() =>
  Object.entries(APP.data.paradas).find(([, p]) => p.nombre.toUpperCase() === 'AV ANDALUCIA (ARROYO)')[0]);

await page.evaluate(id => openModalConHorarios(areaDeParada(id), cont => buildStopScheduleModalContent(cont, id)), stopId);
await page.waitForTimeout(200);

const botones = await page.locator('#stopScheduleActions .btn-chip .btn-chip-txt').allInnerTexts();
ok(botones.includes('Ver código QR'), 'la ficha trae el botón de ver el QR', JSON.stringify(botones));
ok(botones.includes('Compartir esta parada'), 'y el de compartir', JSON.stringify(botones));

/* ------------------------------------------------------------------ */
/* 3. Pulsar "Ver código QR" dibuja un QR de verdad, y se puede ocultar  */
/* ------------------------------------------------------------------ */
const btnQr = page.locator('#stopScheduleActions button', { hasText: 'Ver código QR' });
await btnQr.click();
await page.waitForSelector('.qr-card svg path', { timeout: 10000 });
const trasMostrar = await page.evaluate(() => {
  const caja = document.getElementById('stopQrBox');
  const svg = caja.querySelector('.qr-card svg');
  return {
    oculto: caja.hidden,
    hayPaths: svg ? svg.querySelectorAll('path').length : 0,
    titulo: caja.querySelector('.qr-card-titulo')?.textContent,
    parada: caja.querySelector('.qr-card-parada')?.textContent
  };
});
console.log(JSON.stringify(trasMostrar, null, 1));
ok(!trasMostrar.oculto, 'al pulsar "Ver código QR" la caja del QR se muestra');
ok(trasMostrar.hayPaths > 0, 'y dentro hay un QR de verdad, no un hueco vacío', trasMostrar.hayPaths);
ok(trasMostrar.titulo === 'Consulta tu próxima salida', 'con el mensaje pensado para la marquesina', trasMostrar.titulo);
ok(trasMostrar.parada === 'Av Andalucia (Arroyo)', 'y el nombre de la parada debajo', trasMostrar.parada);

await btnQr.click();
const trasOcultar = await page.evaluate(() => document.getElementById('stopQrBox').hidden);
ok(trasOcultar, 'y al volver a pulsar, se oculta otra vez');

/* ------------------------------------------------------------------ */
/* 4. "Compartir esta parada" copia el enlace al portapapeles           */
/* ------------------------------------------------------------------ */
// Por posición, no por texto: al pulsarlo el texto cambia a "Enlace
// copiado", así que un `hasText` fijado antes de pulsar dejaría de
// encontrarlo después.
const txtCompartir = page.locator('#stopScheduleActions .btn-chip-txt').nth(1);
const txtCompartirAntes = await txtCompartir.innerText();
ok(txtCompartirAntes === 'Compartir esta parada', 'el segundo botón es el de compartir (comprobación previa)', txtCompartirAntes);
await page.locator('#stopScheduleActions button').nth(1).click();
await page.waitForFunction(() => document.querySelectorAll('#stopScheduleActions .btn-chip-txt')[1]?.textContent === 'Enlace copiado',
  null, { timeout: 5000 });
const portapapeles = await page.evaluate(() => navigator.clipboard.readText());
const urlEsperada = await page.evaluate(id => urlDeParada(id), stopId);
ok(portapapeles === urlEsperada, 'compartir sin Web Share (escritorio) copia el enlace al portapapeles', portapapeles);
await page.waitForFunction(() => document.querySelectorAll('#stopScheduleActions .btn-chip-txt')[1]?.textContent === 'Compartir esta parada',
  null, { timeout: 5000 });

/* ------------------------------------------------------------------ */
/* 5. Entrar por el enlace abre esa parada sola, sin buscarla a mano    */
/* ------------------------------------------------------------------ */
await page.goto(BASE + '/index.html?parada=' + encodeURIComponent(stopId), { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof CTAN !== 'undefined' && CTAN.cargado && CTAN.horarios.has(1), null, { timeout: 30000 });
await page.waitForSelector('#modalOverlay .detail-title', { timeout: 10000 });
const tituloDeepLink = (await page.locator('#modalOverlay .detail-title').innerText()).trim();
ok(/^AV ANDALUCIA \(ARROYO\)/i.test(tituloDeepLink),
  'entrar con ?parada=<id> abre la ficha de esa parada sola, al arrancar', tituloDeepLink);
ok(await page.locator('#stopScheduleActions button', { hasText: 'Ver código QR' }).count() === 1,
  'y es la ficha completa, con sus mismos botones');

/* ------------------------------------------------------------------ */
/* 6. Un id que no existe no rompe nada: aviso, no un modal en blanco   */
/* ------------------------------------------------------------------ */
await page.goto(BASE + '/index.html?parada=9_inventado', { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof CTAN !== 'undefined' && CTAN.cargado && CTAN.horarios.has(1), null, { timeout: 30000 });
await page.waitForSelector('#modalOverlay .empty', { timeout: 10000 });
const avisoInvalido = (await page.locator('#modalOverlay .empty').innerText()).trim();
ok(/no existe|no es válido/i.test(avisoInvalido),
  'un enlace con una parada que no existe da un aviso claro, no un modal en blanco', avisoInvalido);

ok(errores.length === 0, 'sin errores en consola', JSON.stringify(errores));
console.log(fallos ? `\n${fallos} comprobaciones fallidas` : '\nTodo correcto');
await browser.close();
process.exit(fallos ? 1 : 0);
