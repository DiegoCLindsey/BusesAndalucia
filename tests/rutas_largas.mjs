/* Dos preguntas concretas sobre el buscador de rutas:
 *
 *  1. "Guillena a Arcos de la Frontera: sé que hay un bus de Plaza de
 *     Armas a Arcos, y el 177 de Guillena a Plaza de Armas." — Cierto,
 *     pero ese autobús a Arcos es interurbano (de largo o media
 *     distancia), no de ningún consorcio metropolitano: no está en el
 *     GTFS unificado de la CTAN, que sólo cubre las nueve áreas. De
 *     hecho, NINGUNA parada de un área está a menos de 600 m de una de
 *     otra, y ningún autobús metropolitano cruza de una a otra — las
 *     nueve son islas en estos datos. No es que el buscador renuncie
 *     pronto: es que la conexión no existe en la fuente. Lo que sí tiene
 *     que hacer bien es EXPLICARLO así, no con un genérico "hace falta
 *     el metro de Sevilla" que no viene a cuento cuando el problema es
 *     Cádiz, no Sevilla.
 *
 *  2. "Lo mismo pasa entre municipios de diferentes zonas de Sevilla."
 *     Esto sí era un fallo: dentro de una misma área, un trayecto que
 *     pedía cinco trasbordos se descartaba a los tres (MAX_RONDAS venía
 *     de cuando el motor sólo tenía Sevilla y pocas líneas; con las
 *     nueve áreas hay pueblos que sólo se enlazan con varios cambios).
 *     Ahora prueba hasta ocho autobuses antes de rendirse, y "El Viso
 *     del Alcor" a "Villamanrique de la Condesa" —los dos en el área de
 *     Sevilla, pide cinco— pasa de "imposible" a una hora de salida.
 *
 *  3. Huelva–Almería no es un caso especial de lo anterior: es el mismo
 *     caso 1, dos áreas sin conectar, con la particularidad de que como
 *     mínimo hace falta cruzar dos fronteras de consorcio (Huelva→Sevilla
 *     y Sevilla→…→Almería), así que ninguna cantidad de trasbordos lo
 *     arregla. Los tests aquí comprueban eso: no que "salga una ruta
 *     tardando mucho", sino que el motivo lo diga con las áreas
 *     correctas, sin importar cuántos consorcios intermedios se prueben.
 *
 *   npm i -D playwright && npx playwright install chromium
 *   python3 -m http.server 8765 &
 *   node tests/rutas_largas.mjs
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
// CHROMIUM_PATH apunta a un Chromium ya instalado cuando el del paquete no está.
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
await page.clock.install({ time: new Date('2026-08-18T08:00:00') });   // un martes
await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof CTAN !== 'undefined' && CTAN.cargado && CTAN.horarios.has(1), null, { timeout: 30000 });

// Para probar de verdad hacen falta los horarios de las áreas de por
// medio: sin ellos, "no se encuentra ruta" no demostraría nada — podría
// ser sólo que esa área no estaba cargada todavía.
await page.evaluate(async () => { await asegurarHorarios([1, 2, 3, 4, 6, 9]); });

let fallos = 0;
const ok = (cond, txt, extra) => {
  console.log((cond ? '  ok   ' : 'FALLA  ') + txt + (extra !== undefined ? '   → ' + extra : ''));
  if (!cond) fallos++;
};

const r = await page.evaluate(() => {
  const salida = new Date('2026-08-18T08:00:00');
  const resumen = ops => ops.map(o => ({ trasbordos: o.numTrasbordos, salida: fmtHoraAbs(o.salidaMin) }));

  const guillenaArcos = calcularOpcionesRuta(APP.data, ROUTING,
    { type: 'municipio', nombre: 'Guillena' }, { type: 'municipio', nombre: 'Arcos de la Frontera' }, salida);
  const motivoGuillenaArcos = RUTA_SIN_RESULTADO;

  const huelvaAlmeria = calcularOpcionesRuta(APP.data, ROUTING,
    { type: 'municipio', nombre: 'Huelva' }, { type: 'municipio', nombre: 'Almería' }, salida);
  const motivoHuelvaAlmeria = RUTA_SIN_RESULTADO;

  // Caso 2: dentro de la MISMA área, un trayecto que antes se descartaba
  // por pedir demasiados trasbordos.
  const visoVillamanrique = calcularOpcionesRuta(APP.data, ROUTING,
    { type: 'municipio', nombre: 'El Viso del Alcor' }, { type: 'municipio', nombre: 'Villamanrique de la Condesa' }, salida);

  return {
    guillenaArcos: { n: guillenaArcos.length, motivo: motivoGuillenaArcos },
    huelvaAlmeria: { n: huelvaAlmeria.length, motivo: motivoHuelvaAlmeria },
    visoVillamanrique: { n: visoVillamanrique.length, resumen: resumen(visoVillamanrique) }
  };
});
console.log(JSON.stringify(r, null, 1));
console.log('');

/* ------------------------------------------------------------------ */
/* 1. Guillena → Arcos de la Frontera: imposible, y se explica bien     */
/* ------------------------------------------------------------------ */
ok(r.guillenaArcos.n === 0, 'Guillena a Arcos de la Frontera: ninguna combinación', r.guillenaArcos.n);
ok(/Sevilla/.test(r.guillenaArcos.motivo) && /Cádiz/.test(r.guillenaArcos.motivo),
  'el motivo nombra Sevilla y Cádiz, no un genérico "hace falta el metro"',
  r.guillenaArcos.motivo);
ok(!/TUSSAM/.test(r.guillenaArcos.motivo), 'y no culpa a TUSSAM de un problema que es de Cádiz', r.guillenaArcos.motivo);

/* ------------------------------------------------------------------ */
/* 2. Huelva → Almería: imposible aunque se prueben todos los           */
/*    trasbordos del mundo — no es un problema de MAX_RONDAS            */
/* ------------------------------------------------------------------ */
ok(r.huelvaAlmeria.n === 0, 'Huelva a Almería: ninguna combinación', r.huelvaAlmeria.n);
ok(/Huelva/.test(r.huelvaAlmeria.motivo) && /Almería/.test(r.huelvaAlmeria.motivo),
  'el motivo nombra las dos áreas', r.huelvaAlmeria.motivo);
ok(!/trasbordos, más de los que/.test(r.huelvaAlmeria.motivo),
  'y no da a entender que con más trasbordos se resolvería', r.huelvaAlmeria.motivo);

/* ------------------------------------------------------------------ */
/* 3. El Viso del Alcor → Villamanrique de la Condesa: MISMA área,      */
/*    varios trasbordos, y SÍ tiene que encontrarse                     */
/* ------------------------------------------------------------------ */
ok(r.visoVillamanrique.n > 0,
  'El Viso del Alcor a Villamanrique de la Condesa (misma área): sí hay combinación',
  JSON.stringify(r.visoVillamanrique.resumen));
ok(r.visoVillamanrique.n > 0 && r.visoVillamanrique.resumen[0].trasbordos >= 4,
  'y hacen falta varios trasbordos — es justo el caso que se descartaba antes',
  r.visoVillamanrique.resumen[0] && r.visoVillamanrique.resumen[0].trasbordos);

ok(errores.length === 0, 'sin errores en consola', JSON.stringify(errores));
console.log(fallos ? `\n${fallos} comprobaciones fallidas` : '\nTodo correcto');
await browser.close();
process.exit(fallos ? 1 : 0);
