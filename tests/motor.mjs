/* Regresión del motor de rutas.
 *
 * No cubre todas las combinaciones a propósito: cubre el caso que motivó
 * reescribirlo (Sevilla → Guillena a las 15:00 era un directo de media
 * hora y la app daba casi cuatro horas con trasbordos) y las invariantes
 * que, si se rompen, vuelven a producir esa clase de error.
 *
 *   npm i -D playwright && npx playwright install chromium
 *   python3 -m http.server 8765 &
 *   node tests/motor.mjs
 */
import fs from 'fs';

// Playwright se resuelve como cualquier dependencia; PLAYWRIGHT_MODULE
// permite apuntar a una instalación global cuando no hay node_modules.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

// Si no hay salida a internet, se puede servir Leaflet desde disco:
//   LEAFLET_DIR=./node_modules/leaflet/dist node tests/<fichero>.mjs
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
const page = await browser.newPage({ viewport: { width: 430, height: 950 } });
const errores = [];
page.on('pageerror', e => errores.push('PAGEERROR: ' + e.message));
page.on('console', m => {
  if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push('CONSOLE: ' + m.text());
});
await servirLeafletLocal(page);
// Sin tiles: el mapa no pinta nada en las pruebas y así no se sale a la red.
await page.route('**/tile.openstreetmap.org/**', r => r.fulfill({ contentType: 'image/png', body: Buffer.from('') }));
// Los datos van por área metropolitana: se fija Sevilla para no toparse
// con el selector del primer arranque.
await page.addInitScript(() => {
  try { localStorage.setItem('ctanConsorcioV1', JSON.stringify({ id: 1 })); } catch (e) { }
});
await page.clock.install({ time: new Date('2026-08-18T14:45:00') });   // un martes
await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof CTAN !== 'undefined' && CTAN.cargado, null, { timeout: 30000 });

let fallos = 0;
const ok = (cond, txt, extra) => {
  console.log((cond ? '  ok   ' : 'FALLA  ') + txt + (extra !== undefined ? '   → ' + extra : ''));
  if (!cond) fallos++;
};

const r = await page.evaluate(async () => {
  const routing = ROUTING;   // el grafo a pie viene con los datos del área
  const resumen = o => ({
    trasbordos: o.numTrasbordos,
    linea: o.lineas[0],
    salida: fmtHoraAbs(o.salidaMin),
    llegada: fmtHoraAbs(o.diasSalida * 1440 + o.llegadaMin),
    destino: APP.data.paradas[o.destinoStopId].nombre
  });
  const paradaPorNombre = n => Object.entries(APP.data.paradas).find(([, p]) => p.nombre.toUpperCase() === n.toUpperCase())[0];
  const chapina = paradaPorNombre('CHAPINA C GONZALO JIMENEZ DE QUESADA (V)');
  const arroyo = paradaPorNombre('AV ANDALUCIA (ARROYO)');
  const t0 = performance.now();
  const sevGui = calcularOpcionesRuta(APP.data, routing,
    { type: 'municipio', nombre: 'Sevilla' }, { type: 'municipio', nombre: 'Guillena' },
    new Date('2026-08-18T15:00:00')).map(resumen);
  const ms = performance.now() - t0;
  const directo = calcularOpcionesRuta(APP.data, routing,
    { type: 'stop', id: chapina }, { type: 'stop', id: arroyo },
    new Date('2026-08-18T15:00:00')).map(resumen);
  const sentidos = sentidosEnParada(chapina,
    CTAN.lineas.find(l => l.codigo === 'M-177').slug,
    new Date('2026-08-18T14:45:00'))
    .map(g => ({ etiqueta: g.etiqueta, dep: g.dep ? `${g.dep.h}:${String(g.dep.m).padStart(2, '0')}` : null }));

  // Muestra de pares al azar: ningún itinerario puede retroceder en el tiempo.
  let incoherentes = 0;
  const ids = Object.keys(APP.data.paradas);
  let semilla = 987;
  const rnd = () => (semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 120; i++) {
    const a = ids[Math.floor(rnd() * ids.length)], b = ids[Math.floor(rnd() * ids.length)];
    if (a === b) continue;
    calcularOpcionesRuta(APP.data, routing, { type: 'stop', id: a }, { type: 'stop', id: b },
      new Date('2026-08-18T09:00:00')).forEach(o => {
        let t = -Infinity;
        o.legs.forEach(l => { if (l.salida < t || l.llegada < l.salida) incoherentes++; t = l.llegada; });
      });
  }

  // Un par sin combinación razonable tiene que explicarse, no quedarse mudo.
  calcularOpcionesRuta(APP.data, routing,
    { type: 'stop', id: paradaPorNombre('POLIGONO (JUNTO A RENAULT) TORREBLANCA') },
    { type: 'stop', id: paradaPorNombre('C  PASCUAL MARQUEZ  DIA') },
    new Date('2026-08-18T09:00:00'));
  const motivo = RUTA_SIN_RESULTADO;

  return {
    sevGui, directo, sentidos, motivo, incoherentes, ms: Math.round(ms),
    viajes: CTAN.bloques.reduce((a, x) => a + x.viajes.length, 0),
    paradasCubiertas: CTAN.porParada.size
  };
});

console.log(JSON.stringify(r, null, 1));
console.log('');
const primera = r.sevGui[0];
ok(!!primera && primera.trasbordos === 0, 'Sevilla → Guillena a las 15:00 es directo', primera && primera.trasbordos);
ok(!!primera && /^m-177/.test(primera.linea), 'lo hace la M-177', primera && primera.linea);
ok(!!primera && primera.salida === '15:00' && primera.llegada === '15:29',
  'sale a las 15:00 y llega a las 15:29', primera && primera.salida + ' → ' + primera.llegada);
ok(!!primera && /^AV ANDALUCIA \(ARROYO\)$/i.test(primera.destino),
  'llega al núcleo de Guillena, no a un polígono del término', primera && primera.destino);
ok(r.directo[0] && r.directo[0].trasbordos === 0 && r.directo[0].llegada === '15:29',
  'de parada a parada da lo mismo');
ok(r.sentidos.some(s => s.etiqueta === 'Guillena' && s.dep === '15:04'),
  'la próxima salida es el autobús que PASA por la parada, no el que sale de la cabecera',
  JSON.stringify(r.sentidos));
ok(r.viajes > 3000, 'la red reconstruida trae los viajes del horario', r.viajes);
ok(r.paradasCubiertas >= 1080, 'y cubre casi todas las paradas', r.paradasCubiertas);
ok(r.incoherentes === 0, 'ningún itinerario retrocede en el tiempo', r.incoherentes);
ok(typeof r.motivo === 'string' && r.motivo.length > 20,
  'cuando no hay ruta, se explica por qué', r.motivo);
ok(r.ms < 500, 'la búsqueda es instantánea', r.ms + ' ms');
ok(errores.length === 0, 'sin errores en consola', JSON.stringify(errores));

console.log(fallos ? `\n${fallos} comprobaciones fallidas` : '\nTodo correcto');
await browser.close();
process.exit(fallos ? 1 : 0);
