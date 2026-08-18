# Próxima Salida · Buses Andalucía

Aplicación web para consultar horarios, paradas y rutas del **Consorcio de
Transportes Metropolitano del Área de Sevilla**.

Herramienta personal, **sin relación con el Consorcio**. Los datos se extraen
de [ctas.es](https://ctas.es) y son horarios *programados*, no posición en
tiempo real.

👉 **[Abrir la aplicación](https://diegoclindsey.github.io/BusesAndalucia/)**

## Qué hace

- **Inicio** — mapa con las 1.094 paradas de la red, tus próximas salidas
  favoritas destacadas (filtrables por el municipio desde el que quieres
  mirar) y buscador de destino.
- **Líneas** — las 55 líneas del consorcio, con las próximas salidas en las
  paradas que tú elijas, recorrido en mapa, horario completo y PDF oficial
  de cada parada.
- **Ruta** — de parada a parada, de un punto del mapa, desde tu ubicación o
  **de municipio a municipio**, enseñando las combinaciones de líneas
  disponibles y quedándose por defecto con la de menos trasbordos.
- **Favoritos** — paradas, líneas y rutas guardadas, con recálculo automático.
- **Avisos** — notificación con la antelación que elijas antes de que salga
  tu autobús.

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
- **Sentido de circulación.** Se deduce de lo que le queda al recorrido por
  delante desde cada parada, no de dónde arrancó el autobús. Es lo que
  permite juntar en una sola próxima salida todos los recorridos que pasan
  por tu parada camino del mismo sitio, aunque unos salgan de Torre de la
  Reina y otros de Guillena.
- Una parada donde todos los recorridos terminan no ofrece salidas: la hora
  que ctas.es publica ahí es de llegada.
- Los horarios por parada se publican en ctas.es de forma independiente,
  sin un identificador de viaje que enlace la salida de una parada con la
  llegada a la siguiente. El fichero de rutas **infiere** esas conexiones
  emparejando horas consecutivas, descartando las combinaciones
  físicamente imposibles según la distancia real entre paradas.
- Los recorridos dibujados en el mapa unen paradas consecutivas en línea
  recta: ctas.es no publica la geometría real por calle.
- Los avisos requieren tener la aplicación abierta en una pestaña: no hay
  servidor propio ni notificaciones push.

## Licencia

GPL-3.0. Los datos de horarios pertenecen al Consorcio de Transportes
Metropolitano del Área de Sevilla.
