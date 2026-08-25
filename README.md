# Próxima Salida · Buses Andalucía

Aplicación web para consultar horarios, paradas y rutas del **Consorcio de
Transportes Metropolitano del Área de Sevilla**.

Herramienta personal, **sin relación con el Consorcio**. Los datos se extraen
de [ctas.es](https://ctas.es) y son horarios *programados*, no posición en
tiempo real.

👉 **[Abrir la aplicación](https://diegoclindsey.github.io/BusesAndalucia/)**

## Qué hace

- **Inicio** — una sola lista con tus próximas salidas, ordenada por lo
  que falta para cada una: primero el autobús que se va antes, venga de la
  parada que venga. Cada fila dice la línea, hacia dónde va y desde qué
  parada, y en grande **cuánto queda** (la hora del reloj va debajo, en
  pequeño). De cada línea sale una sola parada, la que tengas más cerca.
  Si no has guardado nada y compartes la ubicación, la lista enseña lo que
  pasa por las paradas que tienes al lado. Debajo, el buscador de destino.
- **Líneas** — las 55 líneas del consorcio, con las próximas salidas en las
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
| `ctas_data_app.json` | Líneas, paradas, horarios, coordenadas y municipio (~2,4 MB) |
| `ctas_routing.json` | Distancias a pie entre paradas cercanas (~70 KB) |
| `sw.js` | Service Worker: caché offline y notificaciones |
| `manifest.json`, `icon.svg` | Instalación como PWA |
| `ctas_scraper.py` | Extrae los datos de ctas.es |
| `build_app_data.py` | Genera `ctas_data_app.json` |
| `build_routing_data.py` | Genera `ctas_routing.json` (grafo a pie) |
| `build_municipios.py` | Asigna su municipio a cada parada |

## Desarrollo local

Los ficheros de datos se cargan por `fetch`, así que **no vale abrir
`index.html` con doble clic** (el navegador lo bloquea por CORS, y la
geolocalización exige `https://` o `localhost`). Sirve la carpeta:

```bash
python3 -m http.server 8000
# y abre http://localhost:8000
```

## Regenerar los datos

Cuando el consorcio cambie los horarios (los suyos indican periodo de
validez en cada línea):

```bash
pip install requests beautifulsoup4
python3 ctas_scraper.py        # descarga y cachea las 55 líneas de ctas.es
python3 build_app_data.py      # -> ctas_data_app.json
python3 build_municipios.py    # añade el municipio a cada parada
python3 build_routing_data.py  # -> ctas_routing.json
```

El scraper guarda en `cache/` el HTML descargado, así que reprocesar los
datos no vuelve a pedir nada al servidor.

## Notas técnicas

- **Municipio de cada parada.** ctas.es no lo publica: de cada parada da
  coordenadas y zona tarifaria, y de cada línea una lista de municipios
  incompleta (la M-101 declara dos de los seis que recorre). Como la app
  necesita el dato para su grafo municipio–parada–línea,
  `build_municipios.py` lo deduce sin servicios externos: la zona A del
  consorcio es la capital y ancla Sevilla, el resto de paradas van al
  núcleo urbano más cercano de un catálogo, los núcleos se recolocan sobre
  las paradas que les caen, y una votación entre paradas vecinas arregla
  los bordes. Los anejos que quedan lejos de su municipio (Torre de la
  Reina es de Guillena aunque esté pegada a Alcalá del Río) llevan ancla
  propia.
- **Qué parada se enseña de cada línea.** El orden de preferencia es el
  que tiene sentido para quien va a coger el autobús: manda lo que has
  marcado como tuyo y, dentro de eso, lo que tienes más cerca.

  1. **Líneas favoritas.** Si además has elegido paradas para esa línea,
     sólo esas; si no, la que tengas más cerca de su recorrido.
  2. **Paradas favoritas**: todas las líneas que pasan por ellas.
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
  la fila enseña además la siguiente —o avisa de que es la última de
  hoy—: a esas alturas la pregunta ya no es "¿cuándo pasa?" sino "¿corro
  o espero al otro?", y la respuesta cambia lo que haces. Ya no hay dos
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
- **Los viajes se reconstruyen, no se infieren.** ctas.es publica los
  horarios parada a parada sin un identificador que diga qué salida de una
  parada es la misma que la llegada a la siguiente. Antes esas conexiones
  se deducían emparejando horas consecutivas y salían mal: en la M-177 el
  enlace real de las 15:00 desde Plaza de Armas no existía y en su lugar
  había un salto de 14:27 a 15:04 para un trayecto de cuatro minutos, así
  que ir de Sevilla a Guillena —media hora en un directo— daba casi cuatro
  horas dando rodeos.

  No hace falta inferir nada. Dentro de un tramo seguido del recorrido cada
  parada publica la misma cantidad de pasos, y el k-ésimo de todas ellas es
  el mismo autobús: basta con leerlos en columna. Lo único que hay que
  detectar es dónde termina la ida y empieza la vuelta de un circular, y
  eso lo dice el propio horario: es donde la hora retrocede. A cada uno de
  esos tramos lo llamamos **bloque**; salen 352 bloques con 3.124 viajes
  reales, sin descartar ninguno, y cubren 1.086 de las 1.094 paradas.

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
- Una parada donde todos los recorridos terminan no ofrece salidas: la hora
  que ctas.es publica ahí es de llegada.
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
- Los recorridos dibujados en el mapa unen paradas consecutivas en línea
  recta: ctas.es no publica la geometría real por calle.
- **Los avisos sólo suenan con la app viva.** No hay servidor propio que
  mande un push, así que el aviso lo dispara la propia página: funciona en
  segundo plano, pero si cierras la app del todo no puede sonar. El
  diálogo lo dice antes de que actives nada, para no dejar a nadie
  esperando un aviso que no va a llegar.

## Licencia

GPL-3.0. Los datos de horarios pertenecen al Consorcio de Transportes
Metropolitano del Área de Sevilla.
