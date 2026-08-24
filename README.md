# Próxima Salida · Buses Andalucía

Aplicación web para consultar horarios, paradas y rutas del **Consorcio de
Transportes Metropolitano del Área de Sevilla**.

Herramienta personal, **sin relación con el Consorcio**. Los datos se extraen
de [ctas.es](https://ctas.es) y son horarios *programados*, no posición en
tiempo real.

👉 **[Abrir la aplicación](https://diegoclindsey.github.io/BusesAndalucia/)**

## Qué hace

- **Inicio** — tus próximas salidas primero, el buscador de destino
  después y el mapa al final. Si compartes la ubicación, aparecen también
  las paradas que tienes al lado con su próximo autobús. El mapa agrupa de
  lejos las paradas por municipio (un círculo cada uno, que se despliega al
  tocarlo) y de cerca las enseña una a una.
- **Líneas** — las 55 líneas del consorcio, con las próximas salidas en las
  paradas que tú elijas, recorrido en mapa, horario completo y PDF oficial
  de cada parada.
- **Ruta** — de parada a parada, de un punto del mapa, desde tu ubicación o
  **de municipio a municipio** (eligiéndolo en el buscador o tocando su
  triángulo en el mapa). Enseña las combinaciones de líneas disponibles y
  se queda con la de menos trasbordos, sin pedirte que elijas ningún
  criterio de optimización. El itinerario se lee como una línea vertical:
  hora y sitio en cada punto, qué coges entre punto y punto, y cuánto
  esperas en cada trasbordo.
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
| `ctas_routing.json` | Conexiones para el cálculo de rutas (~3,8 MB) |
| `sw.js` | Service Worker: caché offline y notificaciones |
| `manifest.json`, `icon.svg` | Instalación como PWA |
| `ctas_scraper.py` | Extrae los datos de ctas.es |
| `build_app_data.py` | Genera `ctas_data_app.json` |
| `build_routing_data.py` | Genera `ctas_routing.json` |
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
- **Agrupación del mapa.** Por debajo del zoom 13 el mapa enseña un
  círculo por municipio en vez de sus paradas. En el Aljarafe hay pueblos
  a 1,3 km, así que de muy lejos esos círculos se pisarían unos a otros:
  los que chocan en pantalla se funden en uno solo, con cuántos lleva
  dentro escrito en el centro, y al tocarlo se elige de cuál se habla.
  Todo el dibujo es el `circleMarker` de Leaflet: el aro es su propio
  contorno, también cuando marca el origen o el destino de una ruta, sin
  figuras superpuestas.
- **Sentido de circulación.** Se deduce de lo que le queda al recorrido por
  delante desde cada parada, no de dónde arrancó el autobús. Es lo que
  permite juntar en una sola próxima salida todos los recorridos que pasan
  por tu parada camino del mismo sitio, aunque unos salgan de Torre de la
  Reina y otros de Guillena.
- Una parada donde todos los recorridos terminan no ofrece salidas: la hora
  que ctas.es publica ahí es de llegada.
- **La espera del trasbordo.** El itinerario funde en un solo punto los dos
  momentos de un trasbordo sin cambiar de parada — la hora a la que llegas
  y la hora a la que sales — y enseña la diferencia. Antes esa espera solo
  aparecía después de un tramo a pie, así que en el caso más común (cambiar
  de línea en la misma parada) el dato que más importa del trasbordo era
  justo el que faltaba.
- Los horarios por parada se publican en ctas.es de forma independiente,
  sin un identificador de viaje que enlace la salida de una parada con la
  llegada a la siguiente. El fichero de rutas **infiere** esas conexiones
  emparejando horas consecutivas, descartando las combinaciones
  físicamente imposibles según la distancia real entre paradas.
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
