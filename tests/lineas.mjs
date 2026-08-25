/* La pantalla de Líneas, con el móvil más estrecho que se ve por ahí.
 *
 * Fija los dos fallos que tenía: la ficha de una línea se salía de la
 * pantalla a lo ancho, y se pintaba debajo del listado entero, así que la
 * página medía trece mil píxeles y había que arrastrarla un buen rato.
 *
 *   npm i -D playwright && npx playwright install chromium
 *   python3 -m http.server 8765 &
 *   node tests/lineas.mjs
 */
import fs from 'fs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765';
const ANCHOS = [320, 360, 412];   // iPhone SE, Android corriente, Pixel

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

let fallos = 0;
const ok = (cond, txt, extra) => {
  console.log((cond ? '  ok   ' : 'FALLA  ') + txt + (extra !== undefined ? '   → ' + extra : ''));
  if (!cond) fallos++;
};

const browser = await chromium.launch();
const errores = [];

for (const width of ANCHOS) {
  const page = await browser.newPage({ viewport: { width, height: 740 } });
  page.on('pageerror', e => errores.push(`${width}px PAGEERROR: ` + e.message));
  page.on('console', m => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push(`${width}px ` + m.text());
  });
  await servirLeafletLocal(page);
  await page.route('**/tile.openstreetmap.org/**', r => r.fulfill({ contentType: 'image/png', body: Buffer.from('') }));
  await page.clock.install({ time: new Date('2026-08-18T14:52:00') });
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof APP !== 'undefined' && APP.data, null, { timeout: 30000 });

  // El listado completo
  await page.evaluate(() => irAPantalla('screenLineas'));
  await page.waitForTimeout(700);
  const listado = await page.evaluate(() => ({
    ancho: document.documentElement.clientWidth,
    desplazamiento: document.documentElement.scrollWidth,
    nav: getComputedStyle(document.querySelector('.nav')).position
  }));
  ok(listado.desplazamiento <= listado.ancho,
    `${width}px · el listado no se sale de la pantalla`,
    `${listado.desplazamiento} vs ${listado.ancho}`);
  ok(listado.nav === 'fixed', `${width}px · el menú de abajo se queda quieto`, listado.nav);

  // La ficha de una línea larga (la M-101 tiene 56 paradas)
  await page.evaluate(() => mostrarDetalleLinea('m-101-castilleja-circular-bormujos-mairena-s-juan-sjuan-tomares'));
  await page.waitForTimeout(1100);
  const ficha = await page.evaluate(() => ({
    ancho: document.documentElement.clientWidth,
    desplazamiento: document.documentElement.scrollWidth,
    alto: document.documentElement.scrollHeight,
    listadoOculto: document.getElementById('lineasListadoCard').hidden,
    hayVolver: !!document.querySelector('#btnBack')
  }));
  ok(ficha.desplazamiento <= ficha.ancho,
    `${width}px · la ficha de línea tampoco`,
    `${ficha.desplazamiento} vs ${ficha.ancho}`);
  ok(ficha.listadoOculto && ficha.hayVolver,
    `${width}px · la ficha sustituye al listado y se puede volver`);
  ok(ficha.alto < 8000,
    `${width}px · sin una página interminable por debajo`, ficha.alto + ' px');

  // Y volver deja el listado como estaba
  await page.locator('#btnBack').click();
  await page.waitForTimeout(400);
  const vuelta = await page.evaluate(() => ({
    listadoVisible: !document.getElementById('lineasListadoCard').hidden,
    filas: document.querySelectorAll('#lineasListado .linea-row').length
  }));
  ok(vuelta.listadoVisible && vuelta.filas > 40,
    `${width}px · "Volver" devuelve el listado`, vuelta.filas + ' líneas');

  await page.close();
}

ok(errores.length === 0, 'sin errores en consola', JSON.stringify(errores));
console.log(fallos ? `\n${fallos} comprobaciones fallidas` : '\nTodo correcto');
await browser.close();
process.exit(fallos ? 1 : 0);
