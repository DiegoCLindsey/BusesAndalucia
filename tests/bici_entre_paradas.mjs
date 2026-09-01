/* Ir en bici de una parada a otra cercana, DENTRO del itinerario, para
 * ahorrar trasbordos — no sólo "todo el trayecto en bici" (eso ya lo
 * cubre tests/directo_pie_bici.mjs).
 *
 * Este mecanismo estuvo, se quitó y ha vuelto. La primera vez dio varios
 * bugs reales (saltos encadenados sin autobús de por medio, un tope de
 * vecinos que se quedaba corto) y, aun arreglados, el resultado seguía
 * siendo difícil de predecir, así que se quitó del todo ("vuelve a
 * RAPTOR clásico"). Ha vuelto porque el propio usuario lo pidió otra
 * vez, esta vez con red de seguridad: `mejorOpcion()` ya compara el
 * rodeo de cada combinación contra la línea recta (ver
 * tests/mejor_opcion.mjs) y descarta las que dan una vuelta
 * desproporcionada, así que un salto en bici que enganche una línea
 * rara ya no puede colarse como opción por defecto sin más.
 *
 * Con el interruptor activado, el buscador de itinerarios prueba saltos
 * en bici de hasta 2,5 km entre paradas (antes sólo 600 m a pie), así
 * que puede enganchar una línea mejor sin esperar a que aparezca un
 * autobús que haga ese trozo. El caso que motivó todo esto, de
 * principio a fin: Guillena a Carmona daba, en RAPTOR clásico sin bici,
 * una combinación de cinco trasbordos con 66,8 km recorridos (más del
 * doble de los 31 km en línea recta), llegando a las 20:06. Con la bici
 * activada baja a dos trasbordos, 45,6 km, y llega a las 17:19 — casi
 * tres horas antes.
 *
 * Esto sacó a la luz un fallo real en el motor la primera vez: un salto
 * a pie/bici podía encadenarse con otro sin que hubiera autobús de por
 * medio, si la parada de llegada de un salto resultaba ser TAMBIÉN el
 * origen de otro dentro de la misma ronda — el itinerario salía con
 * paradas de mentira o una espera negativa. Este fichero comprueba que
 * sigue sin pasar.
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
/* 1. El caso que lo motivó: Guillena a Carmona                         */
/* ------------------------------------------------------------------ */
const r = await page.evaluate(() => {
  const salida = new Date('2026-08-26T14:29:00');
  const origen = { type: 'municipio', nombre: 'Guillena' };
  const destino = { type: 'municipio', nombre: 'Carmona' };
  const distRecta = distanciaLineaRectaKm(APP.data, origen, destino);

  MODO_BICI = false;
  const sinBici = mejorOpcion(calcularOpcionesRuta(APP.data, ROUTING, origen, destino, salida), distRecta);
  MODO_BICI = true;
  const conBici = mejorOpcion(calcularOpcionesRuta(APP.data, ROUTING, origen, destino, salida), distRecta);
  MODO_BICI = false;

  const coherente = res => {
    let t = -Infinity, ok = true, saltosSeguidos = 0;
    res.legs.forEach((l, i) => {
      if (l.salida < t || l.llegada < l.salida) ok = false;
      t = l.llegada;
      if (i > 0 && l.tipo === 'walk' && res.legs[i - 1].tipo === 'walk') saltosSeguidos++;
    });
    return { ok, saltosSeguidos };
  };

  return {
    distRecta: Math.round(distRecta * 10) / 10,
    sinBici: { trasbordos: sinBici.numTrasbordos, llegada: fmtHoraAbs(sinBici.diasSalida * 1440 + sinBici.llegadaMin), km: Math.round(sinBici.distanciaKm * 10) / 10 },
    conBici: {
      trasbordos: conBici.numTrasbordos, llegada: fmtHoraAbs(conBici.diasSalida * 1440 + conBici.llegadaMin),
      km: Math.round(conBici.distanciaKm * 10) / 10, pedaleo: conBici.totalPedaleandoMin, coherencia: coherente(conBici)
    }
  };
});
console.log(JSON.stringify(r, null, 1));
console.log('');

ok(r.conBici.trasbordos < r.sinBici.trasbordos,
  'con la bici puesta, la combinación por defecto pide menos trasbordos',
  `${r.sinBici.trasbordos} → ${r.conBici.trasbordos}`);
ok(r.conBici.llegada < r.sinBici.llegada,
  'y llega antes que en RAPTOR clásico', `${r.sinBici.llegada} → ${r.conBici.llegada}`);
ok(r.conBici.km < r.sinBici.km,
  'con menos kilómetros recorridos, no sólo menos tiempo', `${r.sinBici.km} → ${r.conBici.km} km`);
ok(r.conBici.pedaleo > 0, 'pedaleando algún tramo entre paradas', r.conBici.pedaleo + ' min');
ok(r.conBici.coherencia.ok, 'el itinerario no retrocede en el tiempo en ningún tramo');
ok(r.conBici.coherencia.saltosSeguidos === 0,
  'y ningún salto a pie/bici va seguido de otro sin autobús de por medio (el fallo que motivó esto)',
  r.conBici.coherencia.saltosSeguidos);

/* ------------------------------------------------------------------ */
/* 2. Que el interruptor apagado siga dando exactamente lo de siempre   */
/* ------------------------------------------------------------------ */
ok(r.sinBici.trasbordos === 5 && r.sinBici.llegada === '20:06',
  'con la bici apagada, el resultado es el de RAPTOR clásico (5 trasbordos, llega 20:06)',
  JSON.stringify(r.sinBici));

/* ------------------------------------------------------------------ */
/* 3. Coherencia a lo grande: 150 pares al azar con la bici activada     */
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
  MODO_BICI = false;
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
