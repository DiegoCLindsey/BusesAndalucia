# Próxima Salida · Buses Andalucía

Aplicación web para consultar horarios, paradas y rutas de las **nueve áreas
metropolitanas de Andalucía**: Sevilla, Bahía de Cádiz, Granada, Málaga, Campo
de Gibraltar, Almería, Jaén, Córdoba y Costa de Huelva.

> Información proporcionada por el Portal de Datos Abiertos de la Red de
> Consorcios de Transporte de Andalucía.

Herramienta personal, **sin relación con la Red de Consorcios ni con la Junta
de Andalucía**, que no participan ni respaldan esto. Los horarios son
*programados*, no posición en tiempo real.

👉 **[Abrir la aplicación](https://diegoclindsey.github.io/BusesAndalucia/)**

## Qué hace

- **Inicio** — una sola lista con tus próximas salidas, ordenada por lo
  que falta para cada una: primero el autobús que se va antes, venga de la
  parada que venga. Cada fila dice la línea, hacia dónde va y desde qué
  parada, y en grande **cuánto queda** (la hora del reloj va debajo, en
  pequeño; pasada la hora se cambian los papeles, que a dos horas vista
  nadie cuenta minutos). De cada línea sale una sola parada, la que tengas
  más cerca.
  Si no has guardado nada y compartes la ubicación, la lista enseña lo que
  pasa por las paradas que tienes al lado. Debajo, el buscador de destino.
- **Líneas** — las líneas del área activa, con las próximas salidas en las
  paradas que tú elijas, recorrido en mapa, horario completo y PDF oficial
  de cada parada.
- **Ruta** — de parada a parada, de un punto del mapa, desde tu ubicación o
  **de municipio a municipio** (eligiéndolo en el buscador o tocando su
  círculo en el mapa). Enseña las combinaciones de líneas disponibles y se
  queda con la de menos trasbordos, sin pedirte que elijas ningún criterio
  de optimización. El itinerario se lee como una línea vertical: hora y
  sitio en cada punto, qué coges entre punto y punto, y cuánto esperas en
  cada trasbordo. Cuando no hay manera de llegar, dice por qué.
- **Favoritos** — paradas, líneas y rutas guardadas, con recálculo automático.
- **Avisos** — que te avise 5, 10 o 15 minutos antes de que salga tu
  autobús, mientras la app siga abierta.
- **Claro y noche** — el tema sigue al del móvil y se puede fijar a mano
  desde la cabecera.

Funciona sin conexión una vez cargada (Service Worker) y se puede instalar
como aplicación en el móvil.

## Estructura

| Fichero | Qué es |
|---|---|
| `index.html` | La aplicación entera (HTML + CSS + JS en un solo fichero) |
| `data/consorcios.json` | Índice de las nueve áreas: nombre, código, bbox y fecha |
| `data/{1..9}/lineas.json` | Paradas, líneas, municipios y calendario de un área |
| `data/{1..9}/rutas.json` | Bloques con sus viajes y el trazado del recorrido |
| `ctas_routing.json` | Distancias a pie entre paradas cercanas (~70 KB) |
| `fuentes/paradas_*.json` | Respuesta de `/paradas` de la API, para regenerar sin red |
| `tests/` | Pruebas de humo con Playwright (motor, pantallas, inicio, líneas) |
| `sw.js` | Service Worker: caché offline y notificaciones |
| `manifest.json`, `icon.svg` | Instalación como PWA |
| `build_from_gtfs.py` | Genera todo `data/` a partir del GTFS oficial |
| `verificar_datos.py` | Comprueba que lo generado es publicable |
| `build_routing_data.py` | Genera `ctas_routing.json` (grafo a pie) |

## Desarrollo local

Los ficheros de datos se cargan por `fetch`, así que **no vale abrir
`index.html` con doble clic** (el navegador lo bloquea por CORS, y la
geolocalización exige `https://` o `localhost`). Sirve la carpeta:

```bash
python3 -m http.server 8000
# y abre http://localhost:8000
```

## De dónde salen los datos

De la **API pública de la Red de Consorcios de Transporte de Andalucía**
(`api.ctan.es`), publicada como datos abiertos al amparo de la Ley 37/2007.
Sin clave, sin autenticación y con CORS, así que la aplicación puede llamarla
desde el navegador.

Dos fuentes, cada una para lo suyo:

- **El feed GTFS unificado** (`/v1/datos/UNIFICADO/gtfs.zip`, 5,6 MB) trae los
  horarios de los nueve consorcios. Es la fuente de todo `data/`.
- **El endpoint `/noticias`** trae los avisos e incidencias, que no están en el
  GTFS. La aplicación lo consulta en caliente y lo guarda por día.

### Regenerar

```bash
python3 build_from_gtfs.py --descargar --paradas
python3 verificar_datos.py
python3 build_routing_data.py   # el grafo a pie, si cambian las paradas
```

`--descargar` baja el GTFS a `cache/`; sin él se reutiliza el que haya.
`--paradas` refresca `fuentes/paradas_*.json`, que es de donde sale el
municipio de cada parada. Ambos son opcionales: sin red, con lo versionado en
`fuentes/` se regenera igual.

También se puede lanzar desde la pestaña **Actions** del repositorio, con el
workflow «Actualizar datos». No hay cron a propósito: el GTFS cambia poco y de
forma previsible, así que un commit automático semanal estaría casi siempre
vacío. Lo imprevisto —una feria, un corte por obras— llega por los avisos, que
no pasan por aquí.

## Notas técnicas

- **Municipio de cada parada.** No está en el GTFS, lo da el endpoint
  `/paradas` de la API. Antes se deducía a ojo —zona A para anclar la
  capital, núcleo urbano más cercano de un catálogo escrito a mano,
  votación entre paradas vecinas para los bordes, anclas aparte para los
  anejos como Torre de la Reina— y ahora viene dado. La API no cubre todas
  las paradas del GTFS (en Granada devuelve 841 de 1.285), así que las que
  quedan sueltas heredan el municipio de la parada oficial más cercana
  dentro de dos kilómetros: son de la misma calle o del mismo polígono.
  Más lejos se deja en blanco antes que inventarlo. Salen 5.006 de 5.009.
- **Qué parada se enseña de cada línea.** El orden de preferencia es el
  que tiene sentido para quien va a coger el autobús: manda lo que has
  marcado como tuyo y, dentro de eso, lo que tienes más cerca.

  1. **Líneas favoritas.** Si has elegido paradas para esa línea, sólo
     esas; si no, una parada tuya que esté a mano (menos de 1 km); y si
     no, la que tengas más cerca de su recorrido. Así, siguiendo la M-177
     y con la parada del Arroyo guardada, en Guillena sale el Arroyo y en
     Sevilla la parada que tengas delante — siempre la M-177 y nada más.
  2. **Paradas favoritas por las que no pasa ninguna línea que sigas**:
     sus 3 próximas salidas, de la línea que sean. Si por tu parada pasa
     una línea tuya, ya está contada arriba y con la línea que te importa:
     sacarla otra vez con todo lo que para en ella llenaría la pantalla de
     autobuses que no piensas coger.
  3. **Sin nada guardado**, las paradas que tienes al lado.

  Después se poda: de cada línea y sentido queda una sola parada, la más
  cercana. Sin eso, marcar la M-177 como favorita llenaba la pantalla con
  la misma línea vista desde cuatro paradas repartidas por media
  provincia. Los dos sentidos van por separado a propósito: la parada de
  ir y la de volver son dos paradas distintas a veinte metros una de
  otra, y quedarse con una sola escondería justo la mitad que hace falta.
  Cuando la línea favorita no lleva paradas elegidas, se admiten también
  las que estén a menos de 250 m de la más cercana —la de enfrente sigue
  siendo "aquí"— pero no las de un final de trayecto que pilla a once
  kilómetros.

- **Lo que se enseña en Inicio.** El bloque de salidas iba agrupado por
  parada, y eso rompía justo lo que la pantalla tiene que responder: con
  dos paradas guardadas, un autobús que salía en un minuto quedaba por
  debajo de otro que salía en una hora sólo porque su parada iba después.
  Ahora es una cola única ordenada por tiempo, cada fila se explica sola y
  el número grande es el que se usa para decidir ("11 min"), no el que hay
  que restar mentalmente ("15:03"). El resumen limita a dos salidas por
  parada para que ninguna se quede fuera de pantalla, y se despliega
  entero de un toque. Cuando a una salida le quedan diez minutos o menos,
  debajo aparece la siguiente de esa misma línea y sentido —o el aviso de
  que no hay otra hoy—: a esas alturas la pregunta ya no es "¿cuándo
  pasa?" sino "¿corro o espero al otro?", y la respuesta cambia lo que
  haces. Esa fila cuelga de la suya en vez de ir en su sitio por hora,
  porque lo que dice sólo se entiende junto a la de arriba: cinco filas
  más abajo, "16:53" ya no es "el siguiente de este". Ya no hay dos
  listados —"tus próximas salidas" y
  "paradas cerca de ti"— contando lo mismo con distinta letra: es uno.
  Inicio ya no lleva mapa: ocupaba media pantalla para
  enseñar círculos sobre un fondo gris y empujaba fuera de la vista lo
  único que se viene a mirar. El mapa sigue entero en Ruta.

- **Agrupación del mapa.** Por debajo del zoom 13 el mapa enseña un
  círculo por municipio en vez de sus paradas. En el Aljarafe hay pueblos
  a 1,3 km, así que de muy lejos esos círculos se pisarían unos a otros:
  los que chocan en pantalla se funden en uno solo, con cuántos lleva
  dentro escrito en el centro, y al tocarlo se elige de cuál se habla.
  Todo el dibujo es el `circleMarker` de Leaflet: el aro es su propio
  contorno, también cuando marca el origen o el destino de una ruta, sin
  figuras superpuestas.
- **Los viajes vienen dados.** ctas.es publicaba los horarios parada a
  parada sin un identificador que dijera qué salida de una parada era la
  llegada a la siguiente, así que hubo que reconstruirlos leyendo las horas
  en columna. El GTFS trae `trip_id`: la secuencia de paradas de un autobús
  concreto y su hora en cada una. Un **bloque** —línea, sentido y secuencia
  de paradas, con todos sus viajes— es el mismo concepto que ya usaba el
  motor, así que el GTFS entra sin adaptador. Sevilla: 249 bloques, 7.497
  viajes.

- **El sentido no sale de `trip_headsign`.** El GTFS trae ese campo pensado
  justo para decir hacia dónde va un viaje, pero la CTAN lo publica
  **vacío** en los 18.596. Sigue saliendo de la última parada del bloque,
  que además es más fiable.

- **Una `route_id` no es una línea, es una variante.** La M-177 son seis
  rutas del GTFS («Sent Sevilla», «Directo», «Sin Parada En Torre De La
  Reina»…). Y el código de línea no está en el mismo sitio en todos los
  consorcios: Sevilla lo pone al principio del nombre largo y deja en
  `route_short_name` un número interno distinto por variante, mientras que
  los demás dejan el nombre largo sin código y ponen el bueno en
  `short_name`. Agrupar por `short_name` partía la M-177 en seis líneas;
  agrupar por el nombre largo dejaba Granada en diez.

- **La búsqueda es un RAPTOR por rondas.** Cada ronda añade un autobús más,
  así que la ronda en la que aparece el destino *es* su número de
  trasbordos: al terminar están todas las alternativas ordenadas de menos a
  más trasbordos, sin enumerar combinaciones de líneas a mano. Se admiten
  hasta cuatro autobuses y un salto a pie entre medias (nunca encadenado).
  Una consulta tarda unos pocos milisegundos.

- **Sentido de circulación.** Es el final del bloque que coges, no la
  cabecera de la línea. Así todos los recorridos que pasan por tu parada
  camino del mismo sitio caen en una sola próxima salida, salgan unos de
  Torre de la Reina y otros de Guillena. Cuando el bloque termina en tu
  mismo municipio, el sentido se nombra por la última parada: "hacia
  Guillena" estando en Guillena no dice nada.

- **"Voy a tal municipio" es ir a su núcleo.** La parada del término de
  Guillena más cercana a Sevilla es un polígono a siete kilómetros del
  pueblo: buscando la llegada más temprana a *cualquier* parada del
  municipio, el buscador se plantaba allí y daba el viaje por hecho. Para
  las rutas de municipio a municipio se usan sólo las paradas del núcleo
  —centro mediano de las paradas del término, con el radio estirado hasta
  abarcar el grueso de ellas—, de modo que las ciudades grandes no se
  parten en dos.
- **Festivos.** El tipo de día se resolvía con `getDay()`: laborable,
  sábado o domingo. Ahora manda el calendario del GTFS —patrón semanal
  dentro de su vigencia, más las excepciones por fecha—, así que un lunes
  festivo deja de tratarse como un lunes. En Sevilla el 1 de enero pasa de
  105 servicios a los 119 que de verdad circulan. Aviso honesto: la CTAN
  sólo publica excepciones de tipo «añadir», nunca de «quitar», así que si
  una línea suspende su servicio de diario en festivo, el feed no lo dice.
  Para eso están los avisos.
- Una parada donde todos los recorridos terminan no ofrece salidas: la hora
  que publica el GTFS ahí es de llegada.
- **La espera del trasbordo.** El itinerario funde en un solo punto los dos
  momentos de un trasbordo sin cambiar de parada — la hora a la que llegas
  y la hora a la que sales — y enseña la diferencia. Antes esa espera solo
  aparecía después de un tramo a pie, así que en el caso más común (cambiar
  de línea en la misma parada) el dato que más importa del trasbordo era
  justo el que faltaba.
- **Lo que no está en los datos.** El consorcio publica los autobuses
  metropolitanos; el metro, el tranvía y los urbanos de TUSSAM no. Cruzar
  Sevilla por dentro para salir por el otro lado sale caro o directamente
  imposible, y hay pares de paradas sin ninguna combinación razonable. En
  vez de inventarse un itinerario de cuatro horas, la app lo dice.
- **Los avisos sólo suenan con la app viva.** No hay servidor propio que
  mande un push, así que el aviso lo dispara la propia página: funciona en
  segundo plano, pero si cierras la app del todo no puede sonar. El
  diálogo lo dice antes de que actives nada, para no dejar a nadie
  esperando un aviso que no va a llegar.

## Licencia

GPL-3.0. Los datos de horarios pertenecen al Consorcio de Transportes
Metropolitano del Área de Sevilla.
