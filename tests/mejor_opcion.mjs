/* Cuál alternativa se enseña por defecto: la más rápida de verdad, no
 * la de menos trasbordos a secas.
 *
 * Salió de un caso real: Guillena a Carmona daba por defecto una
 * combinación de "sólo" tres trasbordos que llevaba casi dos horas y
 * media de esperas sumadas (50 + 8 + 85 + 18 min), cuando había una con
 * un trasbordo más que llegaba una hora antes. La de menos trasbordos
 * seguía disponible a un toque en las pestañas de arriba — el problema
 * era sólo cuál se enseñaba SIN tocar nada.
 *
 * `mejorOpcion()` no siempre elige la más rápida a machamartillo: si la
 * ganancia es de un par de minutos, no compensa la complicación de un
 * trasbordo más, y gana la simple. Este fichero comprueba las dos cosas.
 *
 *   npm i -D playwright && npx playwright install chromium
 *   python3 -m http.server 8765 &
 *   node tests/mejor_opcion.mjs
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
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 412, height: 900 } });
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
/* 1. El caso real: Guillena a Carmona, con la bici activada            */
/* ------------------------------------------------------------------ */
const r = await page.evaluate(() => {
  const salida = new Date('2026-08-26T14:29:00');
  const origen = { type: 'municipio', nombre: 'Guillena' };
  const destino = { type: 'municipio', nombre: 'Carmona' };
  const resumen = res => !res ? null : {
    trasbordos: res.numTrasbordos,
    llegada: fmtHoraAbs(res.diasSalida * 1440 + res.llegadaMin)
  };

  MODO_BICI = true;
  const opciones = calcularOpcionesRuta(APP.data, ROUTING, origen, destino, salida);
  const elegida = mejorOpcion(opciones);

  return { opciones: opciones.map(resumen), elegida: resumen(elegida) };
});
console.log(JSON.stringify(r, null, 1));
console.log('');

ok(r.opciones.length >= 2, 'hay más de una combinación entre las que elegir', r.opciones.length);
ok(r.elegida.trasbordos > r.opciones[0].trasbordos,
  'la elegida no es la de menos trasbordos...', `${r.opciones[0].trasbordos} → ${r.elegida.trasbordos}`);
ok(r.elegida.llegada === '18:19' && r.opciones[0].llegada === '19:19',
  '...sino la que llega antes de verdad (18:19, no 19:19)', JSON.stringify(r));

/* ------------------------------------------------------------------ */
/* 2. Sin diferencia real, gana la simple                               */
/* ------------------------------------------------------------------ */
const umbral = await page.evaluate(() => {
  const base = { numTrasbordos: 0, diasSalida: 0, llegadaMin: 600, legs: [], lineas: [] };
  const conUnMinutoMas = { ...base, numTrasbordos: 1, llegadaMin: 599 };   // un minuto antes, un trasbordo más
  const conCuartoDeHoraMas = { ...base, numTrasbordos: 1, llegadaMin: 580 }; // veinte minutos antes

  return {
    marginal: mejorOpcion([base, conUnMinutoMas]) === base,
    meritoria: mejorOpcion([base, conCuartoDeHoraMas]) === conCuartoDeHoraMas
  };
});
ok(umbral.marginal, 'un minuto de diferencia no compensa un trasbordo más: gana la simple');
ok(umbral.meritoria, 'veinte minutos sí compensan: gana la más rápida');

/* ------------------------------------------------------------------ */
/* 3. Las rutas favoritas usan el mismo criterio                        */
/* ------------------------------------------------------------------ */
const favorito = await page.evaluate(() => {
  const idPor = n => Object.entries(APP.data.paradas).find(([, p]) => p.nombre.toUpperCase() === n.toUpperCase())[0];
  MODO_BICI = true;
  const res = computeRoute(APP.data, ROUTING,
    { type: 'stop', id: idPor('AV ANDALUCIA (ARROYO)') },
    { type: 'stop', id: idPor('PLAZA DE ARMAS') },
    new Date('2026-08-26T14:29:00'));
  return res ? { trasbordos: res.numTrasbordos, llegada: fmtHoraAbs(res.diasSalida * 1440 + res.llegadaMin) } : null;
});
ok(!!favorito, 'computeRoute (el que usan las rutas favoritas) sigue devolviendo algo razonable', JSON.stringify(favorito));

ok(errores.length === 0, 'sin errores en consola', JSON.stringify(errores));
console.log(fallos ? `\n${fallos} comprobaciones fallidas` : '\nTodo correcto');
await browser.close();
process.exit(fallos ? 1 : 0);
