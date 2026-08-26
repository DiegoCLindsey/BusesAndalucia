/* Puntos de ruta: obligar al itinerario a pasar por un punto concreto
 * entre el origen y el destino.
 *
 * Pidió esto el propio usuario, en el mismo mensaje en que pidió volver
 * a RAPTOR clásico: en vez de que el motor intente enganchar una línea
 * mejor solo con distancias en línea recta (lo que se acaba de quitar,
 * ver tests/motor.mjs y el revert de la bici a mitad de trayecto), que
 * sea la propia persona quien decida por dónde pasa.
 *
 * `calcularRutaConTramos()` no busca una combinación conjunta óptima:
 * encadena un RAPTOR clásico por cada tramo —origen→punto 1, punto
 * 1→punto 2, …, punto N→destino—, cada uno con su propia `mejorOpcion()`
 * de siempre, y pega los itinerarios uno detrás de otro. Cada punto
 * añadido es una parada obligatoria, no una simple preferencia: puede
 * incluso empeorar el viaje (más trasbordos que sin forzarlo), y eso es
 * lo esperado, no un fallo.
 *
 * Dos añadidos posteriores, en el mismo mensaje del usuario:
 *  - "Añadir a la ruta" en el globo de una parada o de un municipio en
 *    el mapa: empuja ese punto al final de la lista de puntos de ruta,
 *    sin tener que ir a rellenar una fila a mano.
 *  - "Ir andando desde el punto anterior", en cada fila: fuerza ESE
 *    tramo a resolverse en línea recta (`construirTramoDirecto`, el
 *    mismo cálculo que ya usa "ir directo" para el viaje entero) en vez
 *    de buscarle autobús. Con la bicicleta activada, el tiempo se
 *    recalcula solo, a la mitad.
 *
 *   npm i -D playwright && npx playwright install chromium
 *   python3 -m http.server 8765 &
 *   node tests/puntos_de_ruta.mjs
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
/* 1. calcularRutaConTramos: el itinerario pasa de verdad por el punto  */
/* ------------------------------------------------------------------ */
const r1 = await page.evaluate(() => {
  const idPor = n => Object.entries(APP.data.paradas).find(([, p]) => p.nombre.toUpperCase() === n.toUpperCase())[0];
  const guillena = { type: 'stop', id: idPor('AV ANDALUCIA (ARROYO)') };
  const plazaArmas = { type: 'stop', id: '1_3023' };  // Plaza De Armas, Sevilla
  const carmona = { type: 'municipio', nombre: 'Carmona' };
  const salida = new Date('2026-08-26T14:29:00');

  const res = calcularRutaConTramos(APP.data, ROUTING, [guillena, plazaArmas, carmona], salida);
  const coherente = res => {
    let t = -Infinity, ok = true;
    res.legs.forEach(l => { if (l.salida < t || l.llegada < l.salida) ok = false; t = l.llegada; });
    return ok;
  };
  // Alguna de las líneas cambia justo en la parada del punto intermedio:
  // el bus que llega a Plaza de Armas y el que sale de ahí son legs
  // distintos, con la parada exacta de por medio.
  const pasaPorElPunto = res.legs.some(l => l.tipo === 'bus' && l.destino === '1_3023')
    || res.legs.some(l => l.tipo === 'bus' && l.origen === '1_3023');
  return res ? {
    trasbordos: res.numTrasbordos,
    llegada: fmtHoraAbs(res.diasSalida * 1440 + res.llegadaMin),
    coherente: coherente(res),
    numLegs: res.legs.length,
    pasaPorElPunto
  } : null;
});
console.log(JSON.stringify(r1, null, 1));
ok(!!r1, 'Guillena → Plaza de Armas → Carmona encuentra un itinerario combinado', JSON.stringify(r1));
ok(r1 && r1.coherente, 'el itinerario combinado no retrocede en el tiempo en ningún tramo');
ok(r1 && r1.pasaPorElPunto, 'y de verdad pasa por la parada intermedia (no la ignora)');
ok(r1 && r1.numLegs > 2, 'con más de dos tramos: no es una simple línea directa', r1 && r1.numLegs);

/* ------------------------------------------------------------------ */
/* 2. Un tramo imposible da un motivo que dice CUÁL de los dos falla    */
/* ------------------------------------------------------------------ */
const r2 = await page.evaluate(async () => {
  await asegurarHorarios([2]);  // Bahía de Cádiz, para el tramo imposible
  const guillena = { type: 'municipio', nombre: 'Guillena' };
  const cadiz = { type: 'municipio', nombre: 'Cádiz' };
  const carmona = { type: 'municipio', nombre: 'Carmona' };
  const salida = new Date('2026-08-26T14:29:00');
  const res = calcularRutaConTramos(APP.data, ROUTING, [guillena, cadiz, carmona], salida);
  return { res, motivo: RUTA_SIN_RESULTADO };
});
ok(r2.res === null, 'con un punto de otra área metropolitana, no hay itinerario combinado', JSON.stringify(r2.res));
ok(/Guillena/.test(r2.motivo) && /Cádiz/.test(r2.motivo),
  'y el motivo nombra los dos extremos del tramo que falla, no el viaje entero', r2.motivo);

/* ------------------------------------------------------------------ */
/* 3. La pantalla de Ruta: añadir, calcular y quitar un punto intermedio */
/* ------------------------------------------------------------------ */
await page.evaluate(() => irAPantalla('screenRuta'));
await page.waitForTimeout(300);

await page.locator('#origenInput').fill('Av Andalucia (Arroyo)');
await page.locator('#origenInput').dispatchEvent('change');
await page.locator('#destinoInput').fill('Municipio: Carmona');
await page.locator('#destinoInput').dispatchEvent('change');
await page.evaluate(() => {
  document.getElementById('horaSalida').value = '2026-08-26T14:29';
});

await page.click('#btnAnadirParada');
const filasTrasAnadir = await page.locator('.waypoint-row').count();
ok(filasTrasAnadir === 1, 'pulsar "Añadir parada intermedia" añade una fila', filasTrasAnadir);

await page.locator('.waypoint-row input').first().fill('Plaza De Armas');
await page.locator('.waypoint-row input').first().dispatchEvent('change');
const estadoInput = await page.evaluate(() => ROUTE_WAYPOINTS[0]);
ok(estadoInput && estadoInput.type === 'stop', 'escribir el nombre de una parada la resuelve', JSON.stringify(estadoInput));

await page.click('#btnCalcularRuta');
await page.waitForTimeout(600);

const r3 = await page.evaluate(() => ({
  opciones: RUTA_OPCIONES.length,
  pills: document.querySelectorAll('.opcion-pill').length,
  trasbordos: RUTA_OPCIONES[0] ? RUTA_OPCIONES[0].numTrasbordos : null,
  hayResultado: !!document.querySelector('.itin-horas')
}));
ok(r3.hayResultado, 'con el punto intermedio puesto, la pantalla enseña un itinerario', JSON.stringify(r3));
ok(r3.opciones === 1 && r3.pills === 0,
  'sin pestañas de alternativas: con puntos obligatorios sólo hay un itinerario posible', JSON.stringify(r3));

/* ------------------------------------------------------------------ */
/* 3b. "Ir andando desde el punto anterior": el botón de la fila         */
/* ------------------------------------------------------------------ */
const armedAntes = await page.locator('.waypoint-andando').first().evaluate(el => el.classList.contains('armed'));
ok(!armedAntes, 'el botón "ir andando" empieza apagado');

await page.locator('.waypoint-andando').first().click();
const armedDespues = await page.locator('.waypoint-andando').first().evaluate(el => el.classList.contains('armed'));
const estadoTrasClick = await page.evaluate(() => ROUTE_WAYPOINTS_ANDANDO[0]);
ok(armedDespues && estadoTrasClick === true, 'un toque lo enciende, en la fila y en el estado interno');

await page.click('#btnCalcularRuta');
await page.waitForTimeout(600);
const r3b = await page.evaluate(() => ({
  primeraLeg: RUTA_OPCIONES[0] ? RUTA_OPCIONES[0].legs[0].tipo : null,
  modo: RUTA_OPCIONES[0] ? RUTA_OPCIONES[0].legs[0].modo : null
}));
ok(r3b.primeraLeg === 'walk_tramo', 'con el botón encendido, el primer tramo se fuerza a ir directo', JSON.stringify(r3b));
ok(r3b.modo === 'pie', 'a pie, porque la bicicleta no está activada', r3b.modo);

// Quitar el punto intermedio: la búsqueda vuelve a ser la de siempre.
await page.locator('.waypoint-row button[title*="Quitar"]').click();
await page.waitForTimeout(200);
const filasTrasQuitar = await page.locator('.waypoint-row').count();
ok(filasTrasQuitar === 0, 'el botón de quitar borra la fila', filasTrasQuitar);
const waypointsTrasQuitar = await page.evaluate(() => ROUTE_WAYPOINTS.length);
ok(waypointsTrasQuitar === 0, 'y el estado interno también queda vacío', waypointsTrasQuitar);

/* ------------------------------------------------------------------ */
/* 4. En bici, el tramo forzado tarda la mitad                          */
/* ------------------------------------------------------------------ */
const r4 = await page.evaluate(() => {
  const idPor = n => Object.entries(APP.data.paradas).find(([, p]) => p.nombre.toUpperCase() === n.toUpperCase())[0];
  const guillena = { type: 'stop', id: idPor('AV ANDALUCIA (ARROYO)') };
  const plazaArmas = { type: 'stop', id: '1_3023' };
  const carmona = { type: 'municipio', nombre: 'Carmona' };
  const salida = new Date('2026-08-26T14:29:00');

  const minutosDe = res => res.legs[0].llegada - res.legs[0].salida;
  MODO_BICI = false;
  const aPie = calcularRutaConTramos(APP.data, ROUTING, [guillena, plazaArmas, carmona], salida, [true, false]);
  MODO_BICI = true;
  const enBici = calcularRutaConTramos(APP.data, ROUTING, [guillena, plazaArmas, carmona], salida, [true, false]);
  MODO_BICI = false;

  return {
    aPie: { modo: aPie.legs[0].modo, min: minutosDe(aPie) },
    enBici: { modo: enBici.legs[0].modo, min: minutosDe(enBici) }
  };
});
console.log(JSON.stringify(r4, null, 1));
ok(r4.aPie.modo === 'pie' && r4.enBici.modo === 'bici', 'el modo del tramo forzado sigue al interruptor de bicicleta', JSON.stringify(r4));
ok(r4.enBici.min === Math.max(1, Math.round(r4.aPie.min / 2)),
  'y la bici tarda la mitad que a pie, para el mismo tramo', `${r4.aPie.min} → ${r4.enBici.min}`);

/* ------------------------------------------------------------------ */
/* 5. "Añadir a la ruta" en el globo de una parada                      */
/* ------------------------------------------------------------------ */
await page.evaluate(() => { ROUTE_WAYPOINTS = []; ROUTE_WAYPOINTS_ANDANDO = []; renderWaypointsUI(); });
const r5 = await page.evaluate(() => {
  const idPor = n => Object.entries(APP.data.paradas).find(([, p]) => p.nombre.toUpperCase() === n.toUpperCase())[0];
  const id = idPor('PLAZA DE ARMAS');
  const wrap = buildStopPopupContent(id);
  const botones = [...wrap.querySelectorAll('.stop-popup-actions button')].map(b => b.textContent);
  const btnAdd = [...wrap.querySelectorAll('.stop-popup-actions button')].find(b => /Añadir a la ruta/.test(b.textContent));
  btnAdd.click();
  return { botones, waypoints: ROUTE_WAYPOINTS };
});
ok(r5.botones.includes('Añadir a la ruta'), 'el globo de una parada trae la acción "Añadir a la ruta"', JSON.stringify(r5.botones));
ok(r5.waypoints.length === 1 && r5.waypoints[0].type === 'stop', 'pulsarla añade esa parada como punto de ruta', JSON.stringify(r5.waypoints));

/* ------------------------------------------------------------------ */
/* 6. Lo mismo desde el globo de un municipio en el mapa de red         */
/* ------------------------------------------------------------------ */
const r6 = await page.evaluate(() => {
  ROUTE_WAYPOINTS = []; ROUTE_WAYPOINTS_ANDANDO = []; renderWaypointsUI();
  const wrap = accionesDeMunicipio('Carmona', 'ruta');
  const botones = [...wrap.querySelectorAll('button')].map(b => b.textContent);
  const btnAdd = [...wrap.querySelectorAll('button')].find(b => /Añadir a la ruta/.test(b.textContent));
  btnAdd.click();
  return { botones, waypoints: ROUTE_WAYPOINTS };
});
ok(r6.botones.includes('Añadir a la ruta'), 'el globo de un municipio también trae "Añadir a la ruta"', JSON.stringify(r6.botones));
ok(r6.waypoints.length === 1 && r6.waypoints[0].type === 'municipio' && r6.waypoints[0].nombre === 'Carmona',
  'pulsarla añade el municipio entero como punto de ruta', JSON.stringify(r6.waypoints));
// El globo de un municipio fuera de la pantalla de Ruta (modo distinto de
// "ruta") no ofrece nada de esto: no tiene sentido añadir puntos de paso
// si no se está mirando la calculadora de ruta.
const r6b = await page.evaluate(() => {
  const wrap = accionesDeMunicipio('Carmona', 'lineas');
  return [...wrap.querySelectorAll('button')].map(b => b.textContent);
});
ok(!r6b.includes('Añadir a la ruta'), 'pero no fuera de la pantalla de Ruta', JSON.stringify(r6b));

// Limpio para no dejar puntos de ruta puestos de una prueba a la siguiente.
await page.evaluate(() => { ROUTE_WAYPOINTS = []; ROUTE_WAYPOINTS_ANDANDO = []; renderWaypointsUI(); });

ok(errores.length === 0, 'sin errores en consola', JSON.stringify(errores));
console.log(fallos ? `\n${fallos} comprobaciones fallidas` : '\nTodo correcto');
await browser.close();
process.exit(fallos ? 1 : 0);
