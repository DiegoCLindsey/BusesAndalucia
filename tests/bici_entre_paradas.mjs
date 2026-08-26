/* Ir en bici de una parada a otra cercana, DENTRO del itinerario, para
 * ahorrar trasbordos — no sólo "todo el trayecto en bici" (eso ya lo
 * cubre tests/directo_pie_bici.mjs).
 *
 * Con el interruptor activado, el buscador de itinerarios prueba saltos
 * en bici de hasta 2,5 km entre paradas (antes sólo 600 m a pie), así
 * que puede enganchar una línea mejor sin esperar a que aparezca un
 * autobús que haga ese trozo. El caso real que lo motivó: Guillena a
 * Mairena del Alcor encontraba una combinación de cinco trasbordos que
 * serpenteaba por medio Sevilla; con la bici puesta, una de las
 * alternativas baja de trasbordos y llega antes, pedaleando varios
 * tramos cortos entre parada y parada.
 *
 * Esto sacó a la luz un fallo real en el motor: un salto a pie/bici podía
 * encadenarse con otro sin que hubiera autobús de por medio, si la
 * parada de llegada de un salto resultaba ser TAMBIÉN el origen de otro
 * dentro de la misma ronda — el itinerario salía con paradas de mentira
 * o una espera negativa. Este fichero comprueba que ya no pasa.
 *
 *   npm i -D playwright && npx playwright install chromium
 *   python3 -m http.server 8765 &
 *   node tests/bici_entre_paradas.mjs
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
/* 1. El caso real: menos trasbordos y antes, pedaleando entre paradas  */
/* ------------------------------------------------------------------ */
const r = await page.evaluate(() => {
  const salida = new Date('2026-08-26T08:00:00');
  const origen = { type: 'municipio', nombre: 'Guillena' };
  const destino = { type: 'municipio', nombre: 'Mairena del Alcor' };

  MODO_BICI = false;
  const sinBici = calcularOpcionesRuta(APP.data, ROUTING, origen, destino, salida)[0];

  MODO_BICI = true;
  const conBici = calcularOpcionesRuta(APP.data, ROUTING, origen, destino, salida);
  // La mejor por LLEGADA (no necesariamente la de menos trasbordos, que
  // es la que se enseña primero): es la que demuestra el ahorro real.
  const masRapida = conBici.slice().sort((a, b) =>
    (a.diasSalida * 1440 + a.llegadaMin) - (b.diasSalida * 1440 + b.llegadaMin))[0];

  const coherente = res => {
    let t = -Infinity, saltosSeguidos = 0, ok = true;
    res.legs.forEach((l, i) => {
      if (l.salida < t || l.llegada < l.salida) ok = false;
      t = l.llegada;
      if (i > 0 && l.tipo === 'walk' && res.legs[i - 1].tipo === 'walk') saltosSeguidos++;
    });
    return { ok, saltosSeguidos };
  };

  return {
    sinBici: { trasbordos: sinBici.numTrasbordos, llegada: sinBici.diasSalida * 1440 + sinBici.llegadaMin },
    masRapida: {
      trasbordos: masRapida.numTrasbordos,
      llegada: masRapida.diasSalida * 1440 + masRapida.llegadaMin,
      pedaleo: masRapida.totalPedaleandoMin,
      coherencia: coherente(masRapida)
    }
  };
});
console.log(JSON.stringify(r, null, 1));
console.log('');

ok(r.masRapida.trasbordos < r.sinBici.trasbordos,
  'con la bici puesta, la mejor combinación pide menos trasbordos',
  `${r.sinBici.trasbordos} → ${r.masRapida.trasbordos}`);
ok(r.masRapida.llegada < r.sinBici.llegada,
  'y llega antes que la de sólo autobús',
  `${r.sinBici.llegada} → ${r.masRapida.llegada}`);
ok(r.masRapida.pedaleo > 0, 'pedaleando algunos tramos entre paradas', r.masRapida.pedaleo + ' min');
ok(r.masRapida.coherencia.ok, 'el itinerario no retrocede en el tiempo en ningún tramo');
ok(r.masRapida.coherencia.saltosSeguidos === 0,
  'y ningún salto a pie/bici va seguido de otro sin autobús de por medio (el fallo que motivó esto)',
  r.masRapida.coherencia.saltosSeguidos);

/* ------------------------------------------------------------------ */
/* 2. Que el interruptor apagado siga dando exactamente lo de siempre   */
/* ------------------------------------------------------------------ */
ok(r.sinBici.trasbordos === 5 && r.sinBici.llegada === 747,
  'con la bici apagada, el resultado es el de siempre (5 trasbordos, llega 12:27)',
  JSON.stringify(r.sinBici));

/* ------------------------------------------------------------------ */
/* 3. Coherencia a lo grande: 200 pares al azar con la bici activada     */
/* ------------------------------------------------------------------ */
const masivo = await page.evaluate(() => {
  MODO_BICI = true;
  const ids = [...CTAN.porParada.keys()].filter(id => id.startsWith('1_'));
  let semilla = 13579;
  const rnd = () => (semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648;
  const salida = new Date('2026-08-26T08:00:00');
  let total = 0, conRuta = 0, incoherentes = 0, saltosSeguidos = 0;
  for (let i = 0; i < 150; i++) {
    const a = ids[Math.floor(rnd() * ids.length)], b = ids[Math.floor(rnd() * ids.length)];
    if (a === b) continue;
    total++;
    const ops = calcularOpcionesRuta(APP.data, ROUTING, { type: 'stop', id: a }, { type: 'stop', id: b }, salida);
    if (ops.length) conRuta++;
    ops.forEach(op => {
      let t = -Infinity;
      op.legs.forEach((l, i2) => {
        if (l.salida < t || l.llegada < l.salida) incoherentes++;
        t = l.llegada;
        if (i2 > 0 && l.tipo === 'walk' && op.legs[i2 - 1].tipo === 'walk') saltosSeguidos++;
      });
    });
  }
  return { total, conRuta, incoherentes, saltosSeguidos };
});
console.log(JSON.stringify(masivo, null, 1));
ok(masivo.incoherentes === 0, '150 pares al azar (bici activada): ningún itinerario retrocede en el tiempo', masivo.incoherentes);
ok(masivo.saltosSeguidos === 0, 'ni encadena dos saltos a pie/bici sin autobús de por medio', masivo.saltosSeguidos);
ok(masivo.conRuta >= masivo.total * 0.9, 'y se sigue encontrando ruta en la inmensa mayoría', `${masivo.conRuta}/${masivo.total}`);

ok(errores.length === 0, 'sin errores en consola', JSON.stringify(errores));
console.log(fallos ? `\n${fallos} comprobaciones fallidas` : '\nTodo correcto');
await browser.close();
process.exit(fallos ? 1 : 0);
