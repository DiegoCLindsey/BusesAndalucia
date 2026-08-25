# API de la Red de Consorcios de Transporte de Andalucía (CTAN)

**Documento de referencia autocontenido.** Recoge la documentación oficial de la
API, el esquema del feed GTFS y respuestas reales capturadas el **25 de agosto
de 2026**. Sirve para trabajar sin conexión a internet.

Fuentes originales (no accesibles desde el entorno de desarrollo):
- Portal: `https://api.ctan.es/`
- Documentación: `https://api.ctan.es/doc/` (definiciones en `https://api.ctan.es/doc/api_data.json`)
- Aviso legal: `https://api.ctan.es/avisolegal.html`
- Catálogo de datos abiertos: `https://datos.gob.es/es/catalogo/a01002820-datos-de-la-red-de-consorcios-de-transporte-de-andalucia`

---

## 1. Requisitos para usar la API

### 1.1 Requisitos técnicos

| Requisito | Detalle |
|---|---|
| **Autenticación** | **Ninguna.** No hay API key, token ni registro. |
| **Base URL** | `https://api.ctan.es/v1` (`vx` = versión; la actual es `v1`). HTTPS funciona correctamente. |
| **Método** | Solo `GET` en todos los endpoints. |
| **Formato** | JSON siempre. Devuelve objeto o lista según el recurso. |
| **Parámetro obligatorio** | Casi todas las llamadas requieren `idConsorcio` en la ruta. |
| **Idioma** | Parámetro `lang` con valores `ES` o `EN`. **El valor por defecto es `EN`**, así que conviene enviar `lang=ES` siempre. |
| **CORS** | **Permitido.** Devuelve `Access-Control-Allow-Origin: *` tanto en la API como en el ZIP del GTFS. Se puede llamar directamente desde el navegador (a diferencia de `ctas.es`, que no lo permitía). |
| **Límites de uso** | No documentados. Aun así, usar caché local y un ritmo moderado de peticiones. |
| **Fiabilidad** | El aviso legal declara expresamente que **no se garantiza la continuidad del servicio ni la ausencia de errores**. Conviene cachear los datos y no depender de la API en tiempo real. |

Errores observados: devuelve **404 con cuerpo HTML** (no JSON) cuando la ruta no
existe, y **400** cuando faltan parámetros. Hay que comprobar el `Content-Type`
antes de parsear como JSON.

### 1.2 Requisitos legales (obligatorios)

La API está publicada como **datos abiertos** al amparo de la **Ley 37/2007**
sobre reutilización de la información del sector público. La reutilización está
**expresamente autorizada, incluso con fines comerciales**, con cesión gratuita
y no exclusiva de derechos de propiedad intelectual.

A cambio hay cuatro condiciones de obligado cumplimiento:

1. **Citar la fuente.** Para una aplicación que enlaza con estos datos, la
   fórmula que propone el propio aviso legal es:
   > «Información proporcionada por el Portal de Datos Abiertos de la Red de
   > Consorcios de Transporte de Andalucía»

   (Si los datos se usan en un informe, además hay que indicar la **fecha de
   obtención** de la información.)
2. **No alterar ni desnaturalizar el sentido de la información.**
3. **No indicar, insinuar ni sugerir** que la Red de Consorcios de Transporte o
   la Junta de Andalucía participan, patrocinan o apoyan la aplicación.
4. **Asumir la responsabilidad del uso.** La reutilización es por cuenta y
   riesgo propios; ellos no responden de daños ni de errores u omisiones.

**Implicación práctica para este proyecto:** el pie de la aplicación debe
incluir la cita de la fuente, la fecha de generación de los datos y una nota de
que es una herramienta personal no oficial. Conviene reflejar lo mismo en el
README del repositorio.

---

## 2. Consorcios disponibles

El parámetro `idConsorcio` selecciona el área metropolitana:

| id | Consorcio | Código | Web |
|----|-----------|--------|-----|
| 1 | Área de Sevilla | CTAS | siu.ctas.ctan.es |
| 2 | Bahía de Cádiz | CMTBC | — |
| 3 | Área de Granada | CTMGR | — |
| 4 | Área de Málaga | CTMAM | siu.ctmam.ctan.es |
| 5 | Campo de Gibraltar | CTMCG | — |
| 6 | Área de Almería | CTAL | — |
| 7 | Área de Jaén | CTJA | — |
| 8 | Área de Córdoba | CTCO | — |
| 9 | Costa de Huelva | CTHU | — |

Totales de la red: **9 consorcios · 5.009 paradas · 491 líneas · 18.596 viajes**.

---

## 3. Feed GTFS (fuente recomendada para el pipeline de datos)

`https://api.ctan.es/v1/datos/UNIFICADO/gtfs.zip` — **5,6 MB**, formato GTFS
estándar, **actualizado a diario**, contiene los **9 consorcios en un solo
archivo**.

Es preferible a la API REST para construir los datos de la aplicación porque:

- Una sola descarga cubre toda Andalucía (frente a decenas de llamadas por
  consorcio).
- **`stop_times.txt` da la relación real salida→llegada por viaje** (`trip_id`),
  que la API REST solo expone de forma tabular por línea.
- **`calendar_dates.txt` incluye los festivos** y excepciones por fecha.
- **`shapes.txt` incluye la geometría real del recorrido por calle.**

Los identificadores llevan el prefijo del consorcio: `stop_id = "1_3287"`
equivale a la parada `3287` del Área de Sevilla.

> ⚠️ **Detalle de parseo:** en `agency.txt` la segunda columna de la cabecera
> viene con un espacio inicial: `" agency_name"`. Hay que normalizar los nombres
> de columna al leer los CSV.

### Esquema y muestras reales del GTFS

| Fichero | Filas | Columnas |
|---|---|---|
| `agency.txt` | 9 | `agency_id`, ` agency_name`, `agency_url`, `agency_timezone`, `agency_phone`, `agency_lang`, `agency_fare_url` |
| `stops.txt` | 5,009 | `stop_id`, `stop_name`, `stop_lat`, `stop_lon` |
| `routes.txt` | 491 | `route_id`, `agency_id`, `route_short_name`, `route_long_name`, `route_type`, `route_url`, `route_color`, `route_text_color` |
| `trips.txt` | 18,596 | `route_id`, `service_id`, `trip_id`, `trip_headsign`, `direction_id`, `shape_id` |
| `stop_times.txt` | 360,724 | `trip_id`, `arrival_time`, `departure_time`, `stop_id`, `stop_sequence`, `pickup_type`, `drop_off_type` |
| `calendar.txt` | 1,265 | `service_id`, `monday`, `tuesday`, `wednesday`, `thursday`, `friday`, `saturday`, `sunday`, `start_date`, `end_date` |
| `calendar_dates.txt` | 3,166 | `service_id`, `date`, `exception_type` |
| `shapes.txt` | 375,514 | `shape_id`, `shape_pt_lat`, `shape_pt_lon`, `shape_pt_sequence` |


**`agency.txt`** — primeras filas:
```
{"agency_id": "CTMAS", " agency_name": "Red de Consorcios de Transporte de Andalucía - Área de Sevilla", "agency_url": "http://siu.ctas.ctan.es/es/index.php", "agency_timezone": "Europe/Madrid", "agency_phone": "955053390", "agency_lang": "es", "agency_fare_url": "http://siu.ctas.ctan.es/tarifa.php"}
{"agency_id": "CMTBC", " agency_name": "Red de Consorcios de Transporte de Andalucía - Bahía de Cádiz", "agency_url": "http://www.cmtbc.es", "agency_timezone": "Europe/Madrid", "agency_phone": "856100495", "agency_lang": "es", "agency_fare_url": "http://siu.cmtbc.es/tarifa.php"}
{"agency_id": "CTAG", " agency_name": "Red de Consorcios de Transporte de Andalucía - Área de Granada", "agency_url": "http://siu.ctagr.es/es/index.php", "agency_timezone": "Europe/Madrid", "agency_phone": "958575001", "agency_lang": "es", "agency_fare_url": "http://siu.ctagr.com/tarifa.php"}
```

**`stops.txt`** — primeras filas:
```
{"stop_id": "1_2106", "stop_name": "Rtda Entrada Av De La Constitución", "stop_lat": "37.42617485935401", "stop_lon": "-6.161530160843313"}
{"stop_id": "1_2107", "stop_name": "Sor María De La Eucaristía", "stop_lat": "37.42346851797207", "stop_lon": "-6.163737773895264"}
{"stop_id": "1_2108", "stop_name": "Casa De La Cultura Albaida", "stop_lat": "37.424724212351634", "stop_lon": "-6.163258999586105"}
```

**`routes.txt`** — primeras filas:
```
{"route_id": "1_204", "agency_id": "CTMAS", "route_short_name": "1061", "route_long_name": "M-106 Carmona - El Viso - Mairena Del Alcor - Alcalá De Guadaíra", "route_type": "3", "route_url": "https://siu.ctas.ctan.es/es/horarios_lineas_tabla.php?linea=204", "route_color": "FF0000", "route_text_color": "FFFFFF"}
{"route_id": "1_206", "agency_id": "CTMAS", "route_short_name": "1110", "route_long_name": "M-111 San José De La Rinconada-  Sevilla (Por El Gordillo)", "route_type": "3", "route_url": "https://siu.ctas.ctan.es/es/horarios_lineas_tabla.php?linea=206", "route_color": "ff0000", "route_text_color": "FFFFFF"}
{"route_id": "1_207", "agency_id": "CTMAS", "route_short_name": "1111", "route_long_name": "M-111 San José De La Rinconada -  Sevilla (Directo  Ida)", "route_type": "3", "route_url": "https://siu.ctas.ctan.es/es/horarios_lineas_tabla.php?linea=207", "route_color": "ff0000", "route_text_color": "FFFFFF"}
```

**`trips.txt`** — primeras filas:
```
{"route_id": "1_259", "service_id": "1_954_151_10_259_2", "trip_id": "1_13303_954", "trip_headsign": "", "direction_id": "0", "shape_id": "1_259_I"}
{"route_id": "1_259", "service_id": "1_954_151_10_259_2", "trip_id": "1_13304_954", "trip_headsign": "", "direction_id": "0", "shape_id": "1_259_I"}
{"route_id": "1_259", "service_id": "1_954_151_10_259_2", "trip_id": "1_13305_954", "trip_headsign": "", "direction_id": "0", "shape_id": "1_259_I"}
```

**`stop_times.txt`** — primeras filas:
```
{"trip_id": "1_13303_954", "arrival_time": "08:00:00", "departure_time": "08:00:00", "stop_id": "1_3287", "stop_sequence": "1", "pickup_type": "0", "drop_off_type": "0"}
{"trip_id": "1_13303_954", "arrival_time": "08:02:00", "departure_time": "08:02:00", "stop_id": "1_2268", "stop_sequence": "2", "pickup_type": "0", "drop_off_type": "0"}
{"trip_id": "1_13303_954", "arrival_time": "08:03:00", "departure_time": "08:03:00", "stop_id": "1_2265", "stop_sequence": "3", "pickup_type": "0", "drop_off_type": "0"}
```

**`calendar.txt`** — primeras filas:
```
{"service_id": "1_107_1471_10_268_1", "monday": "1", "tuesday": "1", "wednesday": "1", "thursday": "1", "friday": "1", "saturday": "0", "sunday": "0", "start_date": "20200914", "end_date": "20270630"}
{"service_id": "1_108_1474_10_268_2", "monday": "0", "tuesday": "0", "wednesday": "0", "thursday": "0", "friday": "0", "saturday": "1", "sunday": "0", "start_date": "20200914", "end_date": "20270630"}
{"service_id": "1_109_1476_10_268_3", "monday": "0", "tuesday": "0", "wednesday": "0", "thursday": "0", "friday": "0", "saturday": "0", "sunday": "1", "start_date": "20200914", "end_date": "20270630"}
```

**`calendar_dates.txt`** — primeras filas:
```
{"service_id": "1_109_1476_10_268_3", "date": "20260101", "exception_type": "1"}
{"service_id": "1_109_1476_10_268_3", "date": "20260106", "exception_type": "1"}
{"service_id": "1_109_1476_10_268_3", "date": "20260228", "exception_type": "1"}
```

**`shapes.txt`** — primeras filas:
```
{"shape_id": "1_204_I", "shape_pt_lat": "37.47044", "shape_pt_lon": "-5.644682", "shape_pt_sequence": "0"}
{"shape_id": "1_204_I", "shape_pt_lat": "37.470426", "shape_pt_lon": "-5.64471", "shape_pt_sequence": "1"}
{"shape_id": "1_204_I", "shape_pt_lat": "37.470374", "shape_pt_lon": "-5.644769", "shape_pt_sequence": "2"}
```

**Reparto por consorcio** (prefijo del `stop_id` / `route_id`):

| id | Consorcio | Paradas | Rutas |
|---|---|---|---|
| 1 | Área de Sevilla | 1105 | 123 |
| 2 | Bahía de Cádiz | 249 | 59 |
| 3 | Área de Granada | 1285 | 70 |
| 4 | Área de Málaga | 1296 | 97 |
| 5 | Campo de Gibraltar | 118 | 15 |
| 6 | Área de Almería | 526 | 27 |
| 7 | Área de Jaén | 79 | 42 |
| 8 | Área de Córdoba | 132 | 12 |
| 9 | Costa de Huelva | 219 | 46 |

**Excepciones de calendario**: 3,166 filas · 23 fechas con `exception_type=1` (servicio añadido) · 0 con `exception_type=2` (suprimido). Rango: 20260101 → 20261225.

Fechas con más servicios alterados (festivos detectados):

| Fecha | Servicios |
|---|---|
| 2026-01-01 | 224 |
| 2026-01-06 | 224 |
| 2026-01-28 | 44 |
| 2026-02-04 | 44 |
| 2026-02-05 | 44 |
| 2026-02-06 | 44 |
| 2026-02-11 | 44 |
| 2026-02-28 | 224 |
| 2026-04-02 | 224 |
| 2026-04-03 | 224 |
| 2026-04-22 | 93 |
| 2026-05-01 | 224 |
---

## 4. Endpoints de la API REST

Todas las rutas cuelgan de `https://api.ctan.es/v1`. Los parámetros marcados
como obligatorios en la documentación oficial a veces admiten valores vacíos,
pero conviene enviarlos siempre.

**Los 6 endpoints más útiles para este proyecto:**

| Endpoint | Para qué |
|---|---|
| `/Consorcios/consorcios` | Listado de los 9 consorcios (no necesita `idConsorcio`) |
| `/Consorcios/:id/lineas` | Todas las líneas activas del consorcio |
| `/Consorcios/:id/lineas/:idLinea/paradas` | Paradas de una línea, en orden |
| `/Consorcios/:id/paradas` | Todas las paradas con coordenadas |
| `/Consorcios/:id/horarios_lineas` | **Horario de una línea en una fecha concreta** |
| `/Consorcios/:id/noticias` | Incidencias y cambios de horario publicados |

### 4.1 Horarios por fecha — comportamiento verificado

`GET /Consorcios/:idConsorcio/horarios_lineas?linea=&frecuencia=&dia=&mes=&lang=ES`

Devuelve un array `planificadores`; cada uno tiene `fechaInicio` y `fechaFin`.
**La API selecciona el planificador vigente según el `dia`/`mes` solicitados.**
Comprobado con la línea 236 (M-177) del consorcio 1:

| Consulta | Planificador devuelto |
|---|---|
| `dia=15&mes=8` | `2026-07-01` → `2026-08-31` (horario de verano) |
| `dia=15&mes=9` | `2026-09-01` → `2027-06-30` (horario de invierno) |

Esto significa que **no hace falta programar el scraping para el 1 de julio y el
1 de septiembre**: el cambio de temporada ya viene fechado en la fuente y se
puede detectar con antelación con una consulta periódica.

Cada expedición dentro de `horarioIda` / `horarioVuelta` tiene la forma:

```json
{"horas": ["08:00","08:05","08:08","08:09","08:26","08:30","08:35","08:39","08:43","08:46"],
 "frecuencia": "LV", "observaciones": "", "demandahoras": ""}
```

Las horas se corresponden **posicionalmente** con el array `bloquesIda` /
`bloquesVuelta` del mismo planificador (cada bloque es una columna del horario
publicado, agrupada a su vez en `nucleosIda` con `colspan`).

### 4.2 Frecuencias (tipos de día)

Los `idFreq` del consorcio 1 son: `1`=Lunes a Viernes (LV), `2`=Sábados (SA),
`3`=Domingos y Festivos (DF), `4`=Sábados, Domingos y Festivos (SADF),
`5`=Sólo Viernes (V), `6`=LVSDF… El listado completo está en la muestra de la
sección 6. **Conviene leerlo por consorcio, no asumir que coinciden.**


### 4.3 Referencia completa de endpoints (60)

Generada a partir de `api_data.json` de la documentación oficial.

### Abreviaturas

#### `GET /Consorcios/:idConsorcio/abreviaturas`

Obtiene un listado completo de las abreviaturas del Consorcio


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |
| `lang` | String | **sí** | Identificador del idioma, puede ser 'ES' o 'EN', por defecto es 'EN'. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/abreviaturas?lang=ES`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `idfrecuencia` | Number | Identificador de la frecuencia. |
| `acronimo` | String | Nombre corto usado en las leyendas de los horarios. |
| `nombre` | String | Nombre de la frecuencia. |

#### `GET /Consorcios/:idConsorcio/frecuencias`

Listado de las frecuencias del Consorcio


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |
| `lang` | String | **sí** | Identificador del idioma, puede ser 'ES' o 'EN', por defecto es 'EN'. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/frecuencias`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `idFreq` | Number | Identificador de la Frecuencia. |
| `codigo` | String | Código de la frecuencia, nombre corto. |
| `nombre` | String | Nombre de la Frecuencia. |


### Atencion Usuario

#### `GET /Consorcios/:idConsorcio/att_usuario`

Contiene una variable formateada en HTML con estilos para mostrar el contenido de la sección mostrada de atención al usuario.


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/att_usuario?lang=ES`

Respuesta (200):

| Campo | Tipo | Descripción |
|---|---|---|
| `txtAtencionUsr` | String | Texto de atención al usuario. |


### Configuracion

#### `GET /Consorcios/:idConsorcio/configuracion`

Muestra un listado de variables que describen el funcionamiento de la APP para un Consorcio.


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/configuracion`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `numAtencionUnica` | String | Número de teléfono de atención unica al usuario. |
| `desactivarIdioma` | String | Indica si la opcion de cambio de idioma esta activa. |
| `urlTwitter` | String | URL del consorcio en Twitter. |
| `urlFacebook` | String | URL del Conosrcion en Facebook. |
| `numSolMinCalculoRutas` | Number | Numero de soluciones minimas en el calculo de rutas. |
| `rangoTempBusqSol` | Number | Rango de tiempo para la busqueda de soluciones. |
| `verTarifas` | Boolean | Indica si se muestran las tarifas. |
| `verSimulador` | Boolean | Indica si se muestra el simulador de saltos. |
| `verSaltos` | Boolean | Indica si se muestra la tabla de saltos. |
| `verCalculadora` | Boolean | Indica si se muestra la calculadora de saltos. |
| `verMatriz` | Boolean | Indica si se muestra la matriz de saltos. |
| `verZonas` | Boolean | Indica si se muestra la lista de zonas. |
| `maxTiempoAndando` | Number | Maximo tiempo andando a una parada. |
| `verTextoZonaInferior` | Boolean | Ver texto de la zona inferior de la seccion de tarifas. |
| `verTarifasUrbano` | Boolean | Ver las tarifas de los operadores urbanos. |
| `textoSeccionTarifas` | String | Texto a mostrar en la seccion tarifas. |
| `longitud` | String | Coordenada de longitud del consorcio. |
| `latitud` | String | Coordenada de latitud del consorcio. |
| `fianza` | Number | Fianza de la tarjeta. |
| `horaCorte` | Date | Hora de corte de los servicios del consorcio. |
| `maxTiempoRecorrido` | Number | Indica el número máximo de minutos que puede tener un recorrido (incluyendo transbordos). |
| `tieneTren` | Boolean | Indica si el Consorcio tiene opción de usar el tren. |
| `hayCorredores` | Boolean | Indica si existen corredores en el consorcio. |
| `fechaNoticias` | Date | Fecha de la primera noticia registrada. |
| `fechaInicioTarifa` | Date | Fecha de entrada en vigor de las tarifas. |


### Consorcios

#### `GET /Consorcios/:idConsorcio/consorcios`

Listado de los consorcios.


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/consorcios`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `idConsorcio` | Number | Identificador del Consorcio. |
| `nombre` | String | Nombre del Consorcio. |
| `nombreCorto` | String | Nombre del Consorcio. |

#### `GET /Consorcios/consorcios`

Listado de los consorcios, se usa cuando al cargar la APP aún no sabemos que consorcio quiere usar el usuario.

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/consorcios`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `idConsorcio` | Number | Identificador del Consorcio. |
| `nombre` | String | Nombre del Consorcio. |
| `nombreCorto` | String | Nombre del Consorcio. |

#### `GET /Consorcios/:idConsorcio/consorcio`

Muestra un conjunto de datos del Consorcio que tengamos seleccionado.


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/consorcios/consorcio`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `idConsorcio` | Number | Identificador del Consorcio. |
| `nombre` | String | Nombre del Consorcio. |
| `nombreCorto` | String | Siglas del Consorcio. |
| `direccion` | String | Dirección del Consorcio. |
| `cp` | String | Código postal del Consorcio. |
| `tlf1` | String | Teléfono del Consorcio. |
| `tlf2` | String | Otro teléfono del Consorcio. |
| `fax` | String | Fax del Consorcio. |
| `email` | String | Email del Consorcio. |
| `web` | String | Web corporativa del Consorcio. |
| `cif` | String | CIF del Consorcio. |
| `ciudad` | String | Ciudad sede del Consorcio. |
| `provincia` | String | Provincia sede del Consorcio. |


### Corredores

#### `GET /Consorcios/:idConsorcio/corredores/:idCorredor/bloques`

Listado de los bloques de paso del corredor. Corresponden con las columas que aparecen en el horario.


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |
| `idCorredor` | Number | **sí** | Identificador del corredor. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/corredores/2/bloques`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `idBloque` | Number | Identificador del bloque de paso. |
| `idCorredor` | Number | Identificador del corredor. |
| `nombre` | String | Nombre del Corredor. |
| `color` | String | Color de la columna del corredor. En formato web hex. |

#### `GET /Consorcios/:idConsorcio/corredores/:idCorredor`

Obtiene la información del corredor de transporte indicado.


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |
| `idCorredor` | Number | **sí** | Identificador del corredor. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/corredores/2`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `idCorredor` | Number | Identificador del Corredor. |
| `nombre` | String | Nombre del Corredor. |

#### `GET /Consorcios/:idConsorcio/corredores/`

Listado de los corredores de transporte definidos en el Consorcio.


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/corredores`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `idCorredor` | Number | Identificador del Corredor. |
| `nombre` | String | Nombre del Corredor. |


### Horarios

#### `GET /Consorcios/:idConsorcio/horarios_lineas`

Muestra el horario de una línea.


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |
| `idLinea` | Number | **sí** | Identificador de la línea. |
| `idFrecuencia` | Number | **sí** | Identificador de la frecuencia. |
| `dia` | Number | **sí** | Día de la fecha de la que se quiere obtener el horario. |
| `mes` | Number | **sí** | Mes de la fecha de la que se quiere obtener el horario. |
| `lang` | String | **sí** | Identificador del idioma, puede ser 'ES' o 'EN', por defecto es 'EN'. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/horarios_lineas?dia=&frecuencia=&lang=ES&linea=44&mes=`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `planificadores` | Object[] | Lista de planificadores. |
| `planificadores.FechaInicio` | Date | Fecha de inicio del planificador. |
| `planificadores.FechaFin` | Date | Fecha de fin del planificador. |
| `planificadores.muestraFechaFin` | Boolean | Indica si se debe mostrar la fecha fin del planificador. |
| `nucleosIda` | Object[] | Lista de nucleos de Ida por los que pasa la línea. |
| `nucleosIda.colspan` | String | Tamaño que debe ocupar la celda en horizontal. |
| `nucleosIda.nombre` | String | Nombre del núcleo. |
| `nucleosIda.color` | String | Color de fondo del bloque en hexadecimal. |
| `nucleosVuelta` | Object[] | Lista de nucleos de vuelta por los que pasa la línea. |
| `nucleosVuelta.colspan` | String | Tamaño que debe ocupar la celda en horizontal. |
| `nucleosVuelta.nombre` | String | Nombre del núcleo. |
| `nucleosVuelta.color` | String | Color de fondo del bloque en hexadecimal. |
| `bloquesIda` | Object[] | Lista de bloques de cabecera. |
| `bloquesIda.nombre` | String | Nombre del bloque. |
| `bloquesIda.color` | String | Color de fondo del bloque. |
| `horarioIda` | Object[] | Lista de horarios. |
| `horarioIda.horas` | String[] | Horas de paso por los distintos bloques. |
| `horarioIda.frecuencia` | String | Frecuencia de la linea. |
| `horarioIda.observaciones` | String | Observaciones de la linea en esa salida. |
| `bloquesVuelta` | Object[] | Lista de bloques de cabecera. |
| `bloquesVuelta.nombre` | String | Nombre del bloque. |
| `bloquesVuelta.color` | String | Color de fondo del bloque. |
| `horarioVuelta` | Object[] | Lista de horarios. |
| `horarioVuelta.horas` | String[] | Horas de paso por los distintos bloques. |
| `horarioVuelta.dias` | String | Frecuencia de la linea. |

#### `GET /Consorcios/:idConsorcio/horarios_origen_destino`

Muestra las líneas existentes entre 2 núcleos (uno de origen y uno de destino) que deben ser distintos.


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |
| `lang` | String | **sí** | Identificador del idioma, puede ser 'ES' o 'EN', por defecto es 'EN'. |
| `idNucleoOrigen` | Number | **sí** | Identificador del núcleo de origen. |
| `idNucleoDestino` | Number | **sí** | Identificador del núcleo de destino. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/horarios_origen_destino?destino=46&lang=ES&origen=1`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `bloques` | Object[] | Lista de los bloques de paso de cabecera. |
| `bloques.nombre` | String | Nombre del bloque de paso. |
| `bloques.color` | String | Color de fondo del bloque de paso. |
| `horario` | Object[] | Lista de los horarios. |
| `horario.idlinea` | String | Identificador de la línea. |
| `horario.codigo` | String | Código de la línea. |
| `horario.horas` | String | Hora de paso de la línea. |
| `horario.dias` | String | Frecuencia de las horas de paso de la línea. |
| `horario.observaciones` | String | Observaciones para el servicio de la línea. |
| `frecuencias` | Object[] | Frecuencias Lista de las frecuencias del corredor. |
| `frecuencias.idfrecuencia` | String | Identificador de la frecuencia del corredor. |
| `frecuencias.acronimo` | String | Nombre corto de la frecuencia del corredor. |
| `frecuencias.nombre` | String | Nombre de la frecuencia del corredor. |

#### `GET /Consorcios/:idConsorcio/horarios_corredor`

Muestra los horarios de un corredor.


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |
| `idCorredor` | Number | **sí** | Identificador del corredor. |
| `lang` | String | **sí** | Identificador del idioma, puede ser 'ES' o 'EN', por defecto es 'EN'. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/horarios_corredor?corredor=4&lang=ES`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `bloquesIda` | Object[] | Lista de los bloques de paso de ida. |
| `bloquesIda.nombre` | String | Nombre del bloque de paso del corredor. |
| `bloquesIda.color` | String | Color de fondo del bloque de paso del corredor. |
| `horarioIda` | Object[] | Lista de los horarios de ida. |
| `horarioIda.idlinea` | String | Nombre del bloque de paso del corredor. |
| `horarioIda.codigo` | String | Color de fondo del bloque de paso del corredor. |
| `horarioIda.horas` | String | Color de fondo del bloque de paso del corredor. |
| `horarioIda.dias` | String | Color de fondo del bloque de paso del corredor. |
| `horarioIda.observaciones` | String | Color de fondo del bloque de paso del corredor. |
| `frecuencias` | Object[] | Lista de las frecuencias del corredor. |
| `frecuencias.idfrecuencia` | String | Identificador de la frecuencia del corredor. |
| `frecuencias.acronimo` | String | Nombre corto de la frecuencia del corredor. |
| `frecuencias.nombre` | String | Nombre de la frecuencia del corredor. |


### Idiomas

#### `GET /Consorcios/:idConsorcio/idiomas`

Listado de idiomas disponibles del Consorcio.


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/idiomas`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `idiomasConsorcio` | Object[] | Listado de idiomas. |
| `idiomasConsorcio.id` | Number | Identificador del Idioma. |
| `idiomasConsorcio.cod` | String | Acrónimo del idioma. |
| `idiomasConsorcio.nombre` | String | Nombre del Idioma. |


### Lineas

#### `GET /Consorcios/:idConsorcio/:idLinea`

Muestra información de una línea dada, como su código, nombre, modo de transporte, operadores ...


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |
| `lang` | String | **sí** | Identificador del idioma, puede ser 'ES' o 'EN', por defecto es 'EN'. |
| `idLinea` | Number | **sí** | Identificador de la linea. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/lineas/177`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `idLinea` | Number | Identificador de la linea relacionada con la noticia. |
| `codigo` | String | Código de la línea. |
| `nombre` | String | Nombre de la línea. |
| `modo` | String | Nombre del modo de transporte de la línea. |
| `operadores` | String | Lista de operadores de la linea separados por comas. |
| `hayNoticias` | Boolean | Indica si hay noticias referentes a la linea. |
| `termometroIda` | String | URL que contiende el termómetro de ida de la línea. |
| `termometroVuelta` | String | URL que contiende el termómetro de vuelta de la línea. |
| `polilinea` | String | Listado de puntos que componen el recorrido de la línea, cada punto esta formado por latitud y longi |
| `grosor` | Number | Grosor de la línea que se usa para pintar el recorrido dado por polilinea. |
| `color` | Number | Color de la línea que se usa para pintar el recorrido dado por polilinea, en hexadecimal. |
| `tieneIda` | Boolean | Indica si la línea tiene sentido de ida. |
| `tieneVuelta` | Boolean | Indica si la línea tiene sentido de vuelta. |
| `pmr` | Number | Indica si la línea esta o no adaptada a Personas con Movilidad Reducida. |
| `concesion` | Number | Indica la concesión de la línea. |
| `observaciones` | String | Observaciones de la línea. |

#### `GET /Consorcios/:idConsorcio/lineas/:codigo`

Muestra información de una línea dada por su código, como su el nombre, si tiene noticias, el modo de transporte ...


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |
| `lang` | String | **sí** | Identificador del idioma, puede ser 'ES' o 'EN', por defecto es 'EN'. |
| `codigo` | String | **sí** | Código de la línea. No sensible a mayúsculas. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/lineas/codigo/M1-10`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `idLinea` | Number | Identificador de la linea relacionada con la noticia. |
| `codigo` | String | Código de la línea. |
| `nombre` | String | Nombre de la línea. |
| `modo` | String | Nombre del modo de transporte de la línea. |
| `operadores` | String | Lista de operadores de la linea separados por comas. |
| `hayNoticias` | Boolean | Indica si hay noticias referentes a la linea. |

#### `GET /Consorcios/:idConsorcio/infoLineas/:idLineas`

Muestra información de varias línea dada por su identificador, como su el nombre, si tiene noticias, el modo de transporte ...


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |
| `lang` | String | **sí** | Identificador del idioma, puede ser 'ES' o 'EN', por defecto es 'EN'. |
| `idLineas` | String | **sí** | Identificadores de las líneas. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/4/lineas/infoLineas/177/188/191/198?lang=ES`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `idLinea` | Number | Identificador de la linea relacionada con la noticia. |
| `codigo` | String | Código de la línea. |
| `nombre` | String | Nombre de la línea. |
| `modo` | String | Nombre del modo de transporte de la línea. |
| `operadores` | String | Lista de operadores de la linea separados por comas. |
| `hayNoticias` | Boolean | Indica si hay noticias referentes a la linea. |

#### `GET /Consorcios/:idConsorcio/corredores/:idLinea/bloques`

Listado de los bloques de paso de una línea. Corresponden con las columas que aparecen en el horario.


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |
| `idLinea` | Number | **sí** | Identificador de la linea. |
| `sentido` | Number | **sí** | Sentido de la línea (1=IDA, 2=VUELTA). |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/lineas/177/bloques?sentido=1`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `idBloque` | Number | Identificador del bloque de paso. |
| `idLinea` | Number | Identificador de la línea. |
| `sentido` | Number | Sentido de la línea. |
| `nombre` | String | Nombre del bloque de paso. |
| `color` | String | Color de la columna del corredor. En formato web hex. |
| `orden` | Number | Orden del bloque de paso. |

#### `GET /Consorcios/:idConsorcio/lineas`

Muestra todas las líneas activas del Consorcio, si se rellenan la latitud y longitud nos dará las líneas cercanas a esa posición


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |
| `latitud` | String | **sí** | Latitud en grados decimales, si se rellena este parámetro también se debe rellenar la longitud. |
| `longitud` | String | **sí** | Longitud en grados decimales, si se rellena este parámetro también se debe rellenar la latitud. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/lineas`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `idLinea` | Number | Identificador de la linea. |
| `idModo` | Number | Identificador del modo de transporte. |
| `codigo` | String | Codigo de la linea. |
| `nombre` | String | Nombre de la linea. |
| `modo` | String | Nombre del modo de transporte.. |
| `operadores` | String | Lista de operadores de la linea. |
| `hay_noticias` | Boolean | Indica si hay noticias referentes a la linea. |

#### `GET /Consorcios/:idConsorcio/modostransporte/:idModo/lineas`

Listado de líneas por modo de transporte, con opción de filtrar por municipio y núcleo


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |
| `idModo` | Number | **sí** | Identificador del modo de transporte. |
| `idNucleo` | Number | **sí** | Identificador del núcleo. |
| `idMunicipio` | Number | **sí** | Identificador del municipio. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/modostransporte/1/lineas`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `idLinea` | Number | Identificador de la linea relacionada con la noticia. |
| `codigo` | String | Código de la línea. |
| `nombre` | String | Nombre de la línea. |
| `modo` | String | Nombre del modo de transporte de la línea. |
| `idModo` | Number | Identificador del modo de transporte. |
| `operadores` | String | Lista de operadores de la linea separados por comas. |
| `hayNoticias` | Boolean | Indica si hay noticias referentes a la linea. |
| `idMunicipio` | Number | Identificador del municipio. |
| `idNucleo` | Number | Identificador del nucleo. |

#### `GET /Consorcios/:idConsorcio/municipios/:idMunicipio/nucleos/:idnucleo/lineas`

Listado de líneas por municipios y núcleo, además se puede filtrar por el modo de transporte


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |
| `idModo` | Number | **sí** | Identificador del modo de transporte. |
| `nucleos` | Number | **sí** | Identificador del núcleo. |
| `municipios` | Number | **sí** | Identificador del municipio. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/municipios/10/nucleos/3/lineas?idModo=1`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `idLinea` | Number | Identificador de la linea relacionada con la noticia. |
| `codigo` | String | Código de la línea. |
| `nombre` | String | Nombre de la línea. |
| `modo` | String | Nombre del modo de transporte de la línea. |
| `idModo` | Number | Identificador del modo de transporte. |
| `operadores` | String | Lista de operadores de la linea separados por comas. |
| `hayNoticias` | Boolean | Indica si hay noticias referentes a la linea. |
| `idMunicipio` | Number | Identificador del municipio. |
| `idNucleo` | Number | Identificador del nucleo. |

#### `GET /Consorcios/:idConsorcio/nucleos/:idNucleo/lineas`

Muestra un listado de líneas filtrado por núcleo.


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |
| `idNucleo` | Number | **sí** | Identificador del núcleo. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/nucleos/51/lineas`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `idLinea` | Number | Identificador de la linea. |
| `idModo` | Number | Identificador del modo de transporte. |
| `codigo` | String | Codigo de la linea. |
| `nombre` | String | Nombre de la linea. |
| `modo` | String | Nombre del modo de transporte.. |
| `operadores` | String | Lista de operadores de la linea. |
| `hay_noticias` | Boolean | Indica si hay noticias referentes a la linea. |

#### `GET /Consorcios/:idConsorcio/lineas/:idLinea/paradas`

Listado de las paradas de una línea.


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |
| `idLinea` | Number | **sí** | Identificador de la linea. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/lineas/44/paradas`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `idParada` | Number | Identificador de la parada. |
| `idLinea` | Number | Identificador de la línea. |
| `idNucleo` | Number | Identificador del núcleo al que pertenece la parada. |
| `idZona` | String | Identificador de la zona a la que pertenece la parada. |
| `latitud` | String | Latitud de la parada. |
| `longitud` | Number | Longitud de la parada. |
| `nombre` | Number | Nombre la parada. |
| `sentido` | Number | Sentido de la parada. |
| `orden` | Number | Orden de la parada, dentro del itinerario de la línea. |
| `modos` | Number | Modos de transporte soportados por la parada (autobús, tren, barco ...). |


### Lugares de interes

#### `GET /Consorcios/:idConsorcio/lugares_interes/:idLugar`

Datos del lugar de interes con identificador idLugar.


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |
| `lang` | String | **sí** | Identificador del idioma, puede ser 'ES' o 'EN', por defecto es 'EN'. |
| `idLugar` | Number | **sí** | Identificador del lugar de interes. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/lugares_interes/56`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `idLugar` | Number | Identificador del lugar de interes. |
| `idMunicipio` | String | Identificador del municipio donde se situa el lugar de interes. |
| `municipio` | String | Nombre del municipio donde se situa el lugar de interes. |
| `idCat` | String | Identificador del tipo de categoría del lugar de interes del que se trata. |
| `tipo` | String | Tipo de lugar de interes del que se trata. |
| `nombre` | String | Nombre del lugar de interes. |
| `latitud` | String | Latitud del lugare de interes. |
| `longitud` | String | Longitud del lugar de interes. |

#### `GET /Consorcios/:idConsorcio/lugares_interes/:idLugar`

Lista de lugares de interés dado el identificador de un tipo de lugar y un municipio.


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |
| `lang` | String | **sí** | Identificador del idioma, puede ser 'ES' o 'EN', por defecto es 'EN'. |
| `idCat` | Number | **sí** | Identificador de la categoría del lugar de interes. |
| `idMunicipio` | Number | **sí** | Identificador del municipio. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/lugares_interes/56`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `idLugar` | Number | Identificador del lugar de interes. |
| `idMunicipio` | String | Identificador del municipio donde se situa el lugar de interes. |
| `municipio` | String | Nombre del municipio donde se situa el lugar de interes. |
| `idCat` | String | Identificador del tipo de categoría del lugar de interes del que se trata. |
| `tipo` | String | Tipo de lugar de interes del que se trata. |
| `nombre` | String | Nombre del lugar de interes. |
| `x` | String | Latitud del lugare de interes. |
| `y` | String | Longitud del lugar de interes. |

#### `GET /Consorcios/:idConsorcio/lugares_interes`

Listado de los lugares de interés del Consorcio.


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |
| `lang` | String | **sí** | Identificador del idioma, puede ser 'ES' o 'EN', por defecto es 'EN'. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/municipios/10/lugares_interes`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `idLugar` | Number | Identificador del lugar de interes. |
| `idMunicipio` | String | Identificador del municipio donde se situa el lugar de interes. |
| `municipio` | String | Nombre del municipio donde se situa el lugar de interes. |
| `idCat` | String | Identificador del tipo de categoría del lugar de interes del que se trata. |
| `tipo` | String | Tipo de lugar de interes del que se trata. |
| `nombre` | String | Nombre del lugar de interes. |
| `latitud` | String | Latitud del lugare de interes. |
| `longitud` | String | Longitud del lugar de interes. |

#### `GET /Consorcios/:idConsorcio/municipios/:idMunicipio/lugares_interes`

Lista de lugares de interes de un Municipio y un tipo determinado.


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |
| `lang` | String | **sí** | Identificador del idioma, puede ser 'ES' o 'EN', por defecto es 'EN'. |
| `idTipo` | Number | **sí** | Identificador de la categoría del lugar de interes. |
| `idMunicipio` | Number | **sí** | Identificador del municipio. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/municipios/10/lugares_interes`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `idLugar` | Number | Identificador del lugar de interes. |
| `idMunicipio` | String | Identificador del municipio donde se situa el lugar de interes. |
| `municipio` | String | Nombre del municipio donde se situa el lugar de interes. |
| `idCat` | String | Identificador del tipo de categoría del lugar de interes del que se trata. |
| `tipo` | String | Tipo de lugar de interes del que se trata. |
| `nombre` | String | Nombre del lugar de interes. |
| `latitud` | String | Latitud del lugare de interes. |
| `longitud` | String | Longitud del lugar de interes. |

#### `GET /Consorcios/:idConsorcio/tipos_lugares_interes/:idCat`

Datos del tipo de lugar de interés por el identificador de la categoría


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |
| `idCat` | Number | **sí** | Identificador del tipo de lugar. |
| `lang` | String | **sí** | Identificador del idioma, puede ser 'ES' o 'EN', por defecto es 'EN'. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/tipos_lugares_interes/10?lang=ES`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `idCat` | Number | Identificador del tipo de lugar de interes. |
| `nombre` | String | Nombre del tipo de lugar de interes. |

#### `GET /Consorcios/:idConsorcio/tipos_lugares_interes/`

Listado de los tipos de lugares de interés del Consorcio


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |
| `lang` | String | **sí** | Identificador del idioma, puede ser 'ES' o 'EN', por defecto es 'EN'. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/tipos_lugares_interes?lang=ES`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `idCat` | Number | Identificador del tipo de lugar de interes. |
| `nombre` | String | Nombre del tipo de lugar de interes. |


### Modos de transporte

#### `GET /Consorcios/:idConsorcio/modostransporte`

Listado de los distintos modos de transporte del Consorcio.


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |
| `lang` | String | **sí** | Identificador del idioma, puede ser 'ES' o 'EN', por defecto es 'EN'. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/modostransporte?lang=ES`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `idModo` | Number | Identificador del modo de transporte. |
| `descripcion` | String | Descripcion del modo de transporte. |

#### `GET /Consorcios/:idConsorcio/modostransporte/:id`

Datos de un modo de transporte dado un idenficiador de modo.


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |
| `lang` | String | **sí** | Identificador del idioma, puede ser 'ES' o 'EN', por defecto es 'EN'. |
| `idModo` | Number | **sí** | Identificador del modo de transporte. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/modostransporte/1?lang=ES`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `idModo` | Number | Identificador del modo de transporte. |
| `descripcion` | String | Descripcion del modo de transporte. |
| `autobus` | Boolean | Identificador del modo de transporte. |
| `barco` | Boolean | Identificador del modo de transporte. |
| `tren` | Boolean | Identificador del modo de transporte. |
| `tranvia` | Boolean | Identificador del modo de transporte. |
| `metro` | Boolean | Identificador del modo de transporte. |
| `bici` | Boolean | Identificador del modo de transporte. |


### Municipios

#### `GET /Consorcios/:idConsorcio/municipios/:id`

Devuelve los datos de un municipio dado el identificador del mismo


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |
| `idMunicipio` | Number | **sí** | Identificador del municipio. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/municipios/1`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `idMunicipio` | Number | Identificador del municipio. |
| `datos` | String | Nombre del municipio. |

#### `GET /Consorcios/:idConsorcio/municipios/`

Listado de los municipios de un Consorcio.


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/municipios/`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `idMunicipio` | Number | Identificador del municipio. |
| `datos` | String | Nombre del municipio. |


### Noticias

#### `GET /Consorcios/:idConsorcio/categorias_noticias`

Listado de las distintas categorías que puede tener una noticia


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/categorias_noticias`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `idCategoria` | Number | Identificador de la categoría de noticias. |
| `nombre` | String | Nombre de la categoría de noticias. |

#### `GET /Consorcios/:idConsorcio/noticias/:idNoticia`

Devuelve los detalles de una noticia.


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |
| `lang` | String | **sí** | Identificador del idioma, puede ser 'ES' o 'EN', por defecto es 'EN'. |
| `idNoticia` | Number | **sí** | Identificador de la noticia. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/noticias/27`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `idNoticia` | Number | Identificador de la noticia. |
| `idLinea` | Number | Identificador de la linea relacionada con la noticia. |
| `idCategoria` | Number | Identificador de la categoría de la noticia. |
| `titulo` | String | Titulo de la noticia. |
| `subTitulo` | String | Subtitulo de la noticia. |
| `tituloEng` | String | Titulo de la noticia, cuando el idioma es EN. |
| `subtituloEng` | String | Subtitulo de la noticia, cuando el idioma es EN . |
| `textoEng` | String | Cuerpo de la noticia, cuando el idioma es EN. |
| `resumenEng` | String | Resumen de la noticia, cuando el idioma es EN. |
| `resumen` | String | Resumen de la noticia. |
| `texto` | String | Cuerpo de la noticia. |
| `fechaInicio` | Date | Fecha de inicio de la noticia. |
| `fechaFin` | Date | Fecha de fin de la noticia. |
| `fechaFinFija` | Date | Fecha de fin fija de la noticia. |
| `novedad` | Boolean | Indica si la noticia es una novedad. |
| `categoria` | String | Nombre de la categoria de la noticia. |
| `orden` | Number | Orden de la noticia. |

#### `GET /Consorcios/:idConsorcio/categorias_noticias/:idCategoria/noticias`

Muestra un listado de noticias dependiendo de los parametros pasados (línea,categoría,fecha de inicio o fecha fin)


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |
| `idCategoria` | Number | **sí** | Identificador de la categoría de la cual queremos saber sus noticias. |
| `lang` | String | **sí** | Identificador del idioma, puede ser 'ES' o 'EN', por defecto es 'EN'. |
| `idLinea` | Number | **sí** | Identificador de la línea. |
| `fechaIni` | Number | **sí** | Fecha Inicio de la busqueda, formato (YYYY-DD-MM). |
| `fechaFin` | Number | **sí** | Fecha fin de la busqueda, formato (YYYY-DD-MM). |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/categorias_noticias`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `idNoticia` | Number | Identificador de la noticia. |
| `idLinea` | Number | Identificador de la linea relacionada con la noticia. |
| `idCategoria` | Number | Identificador de la categoría de la noticia. |
| `titulo` | String | Titulo de la noticia. |
| `subtitulo` | String | Subtitulo de la noticia. |
| `titulo_eng` | String | Titulo de la noticia, cuando el idioma es EN. |
| `subtitulo_eng` | String | Subtitulo de la noticia, cuando el idioma es EN . |
| `resumen_eng` | String | Resumen de la noticia, cuando el idioma es EN. |
| `resumen` | String | Resumen de la noticia. |
| `fechaInicio` | Date | Fecha de inicio de la noticia. |
| `fechaFin` | Date | Fecha de fin de la noticia. |
| `fechaFinFija` | Date | Fecha de fin fija de la noticia. |
| `novedad` | Boolean | Indica si la noticia es una novedad. |
| `categoria` | String | Nombre de la categoria de la noticia. |
| `orden` | Number | Orden de la noticia. |

#### `GET /Consorcios/:idConsorcio/lineas/:idLinea/noticias`

Lista de las noticias de una linea determinada.


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |
| `lang` | String | **sí** | Identificador del idioma, puede ser 'ES' o 'EN', por defecto es 'EN'. |
| `idLinea` | Number | **sí** | Identificador de la linea. |
| `idCategoria` | Number | **sí** | Identificador de la categoria de noticias. |
| `fechaIni` | Date | **sí** | Fecha Inicio de la busqueda en formato YYYY-MM-DD. |
| `fechaFin` | Date | **sí** | Fecha fin de la busqueda en formato YYYY-MM-DD. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/lineas/55/noticias`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `idNoticia` | Number | Identificador de la noticia. |
| `idLinea` | Number | Identificador de la linea relacionada con la noticia. |
| `idCategoria` | Number | Identificador de la categoría de la noticia. |
| `titulo` | String | Titulo de la noticia. |
| `subTitulo` | String | Subtitulo de la noticia. |
| `resumen` | String | Resumen de la noticia. |
| `tituloEng` | String | Titulo de la noticia, cuando el idioma es EN. |
| `subtituloEng` | String | Subtitulo de la noticia, cuando el idioma es EN . |
| `resumenEng` | String | Resumen de la noticia, cuando el idioma es EN. |
| `fechaInicio` | Date | Fecha de inicio de la noticia. |
| `fechaFin` | Date | Fecha de fin de la noticia. |
| `fechaFinFija` | Date | Fecha de fin fija de la noticia. |
| `novedad` | Boolean | Indica si la noticia es una novedad. |
| `categoria` | String | Nombre de la categoria de la noticia. |
| `orden` | Number | Orden de la noticia. |

#### `GET /Consorcios/:idConsorcio/noticias`

Listado de todas las noticias asociadas a un consorcio


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |
| `lang` | String | **sí** | Identificador del idioma, puede ser 'ES' o 'EN', por defecto es 'EN'. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/noticias?lang=ES`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `idNoticia` | Number | Identificador de la noticia. |
| `lineas` | Number | Identificadores de la lineas relacionadas con la noticia. |
| `idCategoria` | Number | Identificador de la categoría de la noticia. |
| `tituloEng` | String | Titulo de la noticia. |
| `subTituloEng` | String | Subtitulo de la noticia. |
| `titulo_eng` | String | Titulo de la noticia, cuando el idioma es EN. |
| `subtitulo_eng` | String | Subtitulo de la noticia, cuando el idioma es EN . |
| `resumenEng` | String | Resumen de la noticia, cuando el idioma es EN. |
| `resumen` | String | Resumen de la noticia. |
| `fechaInicio` | Date | Fecha de inicio de la noticia. |
| `fechaFin` | Date | Fecha de fin de la noticia. |
| `fechaFinFija` | Date | Fecha de fin fija de la noticia. |
| `novedad` | Boolean | Indica si la noticia es una novedad. |
| `categoria` | String | Nombre de la categoria de la noticia. |
| `orden` | Number | Orden de la noticia. |

#### `GET /Consorcios/:idConsorcio/infoLineasNoticias/:idLineas`

Listado de todas las noticias asociadas a varias líneas


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |
| `lang` | String | **sí** | Identificador del idioma, puede ser 'ES' o 'EN', por defecto es 'EN'. |
| `idCategoria` | Number | **sí** | Identificador de la categoria de noticias. |
| `fechaIni` | Date | **sí** | Fecha Inicio de la busqueda en formato YYYY-MM-DD. |
| `fechaFin` | Date | **sí** | Fecha fin de la busqueda en formato YYYY-MM-DD. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/4/lineas/infoLineasNoticias/55/177`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `idNoticia` | Number | Identificador de la noticia. |
| `lineas` | Number | Identificadores de la lineas relacionadas con la noticia. |
| `idCategoria` | Number | Identificador de la categoría de la noticia. |
| `tituloEng` | String | Titulo de la noticia. |
| `subTituloEng` | String | Subtitulo de la noticia. |
| `titulo_eng` | String | Titulo de la noticia, cuando el idioma es EN. |
| `subtitulo_eng` | String | Subtitulo de la noticia, cuando el idioma es EN . |
| `resumenEng` | String | Resumen de la noticia, cuando el idioma es EN. |
| `resumen` | String | Resumen de la noticia. |
| `fechaInicio` | Date | Fecha de inicio de la noticia. |
| `fechaFin` | Date | Fecha de fin de la noticia. |
| `fechaFinFija` | Date | Fecha de fin fija de la noticia. |
| `novedad` | Boolean | Indica si la noticia es una novedad. |
| `categoria` | String | Nombre de la categoria de la noticia. |
| `orden` | Number | Orden de la noticia. |


### Nucleos

#### `GET /Consorcios/:idConsorcio/nucleos/:idNucleo`

Datos de un núcleo dado su identificador


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |
| `idNucleo` | Number | **sí** | Identificador del Consorcio. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/nucleos/51`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `idNucleo` | Number | Identificador del núcleo. |
| `idMunicipio` | Number | Identificador del municipio. |
| `idZona` | String | Zona a la que pertenece el núcleo. |
| `nombre` | String | Nombre del núcleo. |

#### `GET /Consorcios/:idConsorcio/nucleos`

Listado de los núcleos de un Consorcio.


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/nucleos`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `idNucleo` | Number | Identificador del núcleo. |
| `idMunicipio` | Number | Identificador del municipio. |
| `idZona` | String | Zona a la que pertenece el núcleo. |
| `nombre` | String | Nombre del núcleo. |

#### `GET /Consorcios/:idConsorcio/municipios/:idMunicipio/nucleos`

Devuelve una lista con los núcleos de un municipio dado


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |
| `idMunicipio` | Number | **sí** | Identificador del municipio. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/nucleos`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `idMunicipio` | Number | Identificador del municipio. |
| `idNucleo` | Number | Identificador del núcleo. |
| `nombre` | String | Nombre del nucleo. |
| `idZona` | String | Nombre del municipio. |


### Paradas

#### `GET /Consorcios/:idConsorcio/infoParadas/:idParadas`

Devuelve una lista con información de las paradas pasadas


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |
| `idParadas` | Number | **sí** | Lista con los identificadores de paradas separados por "/" |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/paradas/infoParadas/56/81/96`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `idParada` | Number | Identificador de la parada. |
| `idNucleo` | Number | Identificador del núcleo. |
| `idMunicipio` | Number | Identificador del municipio. |
| `idZona` | Number | Identificador de la zona a la que pertenece la parada. |
| `nombre` | String | Nombre de la parada. |
| `latitud` | Number | Coordenada de latitud de la parada. |
| `longitud` | Number | Coordenada de longitud de la parada. |
| `observaciones` | String | Observaciones asociadas a la parada. |
| `principal` | Number | ¿Parada principal de un grupo de paradas? 1 - Si 0 - No. |
| `inactiva` | Number | ¿Parada inactiva? 1 - Si 0 - No. |
| `municipio` | String | Nombre del municipio. |
| `nucleo` | String | Nombre del núcleo. |
| `correspondecias` | String | Correspondencia de la paradas con las líneas. |

#### `GET /Consorcios/:idConsorcio/lineasPorParadas/:idParadas`

Devuelve una lista con las líneas que pasan por todas y cada una de las paradas dadas


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |
| `idParadas` | Number | **sí** | Lista con los identificadores de paradas separados por "/" |

Ejemplo: `http://api.ctan.es/v1/Consorcios/4/paradas/lineasPorParadas/625/627?lang=ES`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `idLinea` | Number | Identificador de la linea. |
| `codigo` | String | Codigo de la linea. |
| `nombre` | String | Nombre de la linea. |
| `descripcion` | String | Nombre del modo de transporte. |
| `prioridad` | Number | Número de servicios de la línea. |

#### `GET /Consorcios/:idConsorcio/paradas/:idParada`

Datos de una parada dado su identificador


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |
| `idParada` | Number | **sí** | Identificador del Consorcio. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/paradas/56`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `idParada` | Number | Identificador de la parada. |
| `idNucleo` | Number | Identificador del núcleo. |
| `idMunicipio` | Number | Identificador del municipio. |
| `idZona` | Number | Identificador de la zona a la que pertenece la parada. |
| `nombre` | String | Nombre de la parada. |
| `latitud` | Number | Coordenada de latitud de la parada. |
| `longitud` | Number | Coordenada de longitud de la parada. |
| `descripcion` | String | Descripción de la parada, nos da más información acerca de la parada o su situación. |
| `observaciones` | String | Observaciones de la parada que aparecen en los horarios. |
| `principal` | Number | Indica si se debe mostrar la parada en los combos del cálculo de rutas, se usa sobre todo para difer |
| `inactiva` | Number | Indica si la parada está activa y debe tenerse en cuenta para todo el sistema de horarios, cálculo d |
| `municipio` | Number | Nombre del municipio. |
| `nucleo` | Number | Nombre del núcleo. |
| `correspondecias` | String | Muestra una lista separadas con comas de todas las líneas que contienen esta parada. |

#### `GET /Consorcios/:idConsorcio/paradas/`

Devuelve una lista con las paradas del Consorcio


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |
| `latitud` | Number | **sí** | Latitud de la localizacion del usuario |
| `longitud` | Number | **sí** | Longitud de la localizacion del usuario |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/paradas?lat=&long=`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `idParada` | Number | Identificador de la parada. |
| `idNucleo` | Number | Identificador del núcleo. |
| `idZona` | Number | Identificador de la zona a la que pertenece la parada. |
| `nombre` | String | Nombre de la parada. |
| `latitud` | Number | Coordenada de latitud de la parada. |
| `longitud` | Number | Coordenada de longitud de la parada. |
| `modos` | String | Modos de transporte de la parada. |
| `idMunicipio` | Number | Identificador del municipio. |
| `municipio` | Number | Nombre del municipio. |
| `nucleo` | Number | Nombre del núcleo. |

#### `GET /Consorcios/:idConsorcio/municipios/:idMunicipio/nucleos/:idnucleo/paradas`

Listado de paradas por municipios y núcleo


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |
| `idNucleo` | Number | **sí** | Identificador del núcleo. |
| `idMunicipio` | Number | **sí** | Identificador del municipio. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/municipios/1/nucleos/1/paradas`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `idParada` | Number | Identificador de la parada. |
| `idNucleo` | Number | Identificador del nucleo. |
| `idZona` | String | Codigo de la zona. |
| `nombre` | String | Nombre de la parada. |

#### `GET /Consorcios/:idConsorcio/nucleos/:idNucleo/paradas`

Muestra un listado de paradas filtrado por núcleo.


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |
| `idNucleo` | Number | **sí** | Identificador del núcleo. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/nucleos/51/paradas`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `idParada` | Number | Identificador de la parada. |
| `idNucleo` | Number | Identificador del nucleo. |
| `idZona` | String | Codigo de la zona. |
| `nombre` | String | Nombre de la parada. |

#### `GET /Consorcios/:idConsorcio/zonas/idZona/paradas`

Lista de paradas por zona


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |
| `idZona` | String | **sí** | Identificador de la zona. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/zonas/A/paradas`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `idParada` | Number | Identificador de la parada. |
| `idNucleo` | Number | Identificador del núcleo. |
| `idZona` | Number | Identificador de la zona a la que pertenece la parada. |
| `nombre` | String | Nombre de la parada. |

#### `GET /Consorcios/:idConsorcio/paradas/:idParada/servicios`

Servicios que pasan por un parada a un hora determinada, si no se selecciona ninguna, por defecto se escoge la hora del sistema.


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |
| `idParada` | Number | **sí** | Identificador del Consorcio. |
| `horaIni` | date | **sí** | Hora usada para la búsqueda, debe tener el siguiente formato: DD-MM-YYYY+HH:MM. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/paradas/55/servicios?horaIni=09-11-2015+11:10`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `servicios` | Object[] | Listado de los servicios que pasan por dicha parada. |
| `servicios.idParada` | Number | Identificador de la parada. |
| `servicios.idLinea` | Number | Identificador de la línea a la que pertenece el servicio. |
| `servicios.servicio` | String | Muestra la hora de paso del servicio por esa parada. |
| `servicios.nombre` | String | Nombre de la línea a la que pertenece el servicio. |
| `servicios.linea` | String | Código de la línea a la que pertenece el servicio. |
| `servicios.sentido` | Number | Sentido de la línea a la que pertenece el servicio, 1=IDA, 2=VUELTA. |
| `servicios.destino` | String | Núcleo de destino de la línea a la que pertenece el servicio. |
| `servicios.tipo` | Number | Indica el tipo de parada, 0=NORMAL (SUBIDA / BAJADA) 1=SOLO SUBIDA 2=SOLO BAJADA . |
| `horaIni` | date | Indica la hora inicial que se ha pasado para búsqueda de servicios en formato YYYY-MM-DD HH:MM . |
| `horaFin` | date | Indica hata que hora se tiene en cuenta la búsqueda de servicios en formato YYYY-MM-DD HH:MM. |


### PoliticaPrivacidad

#### `GET /Consorcios/:idConsorcio/politica_privacidad`

Devuelve el texto de política de privacidad del Consorcio.


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `txtPrivacidad` | String | Texto de política de privacidad del Consorcio. |


### Puntos de venta

#### `GET /Consorcios/:idConsorcio/puntos_venta`

Datos de un punto de venta dado su identificador


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |
| `idPunto` | Number | **sí** | Identificador del Consorcio. |
| `lang` | String | **sí** | Identificador del idioma, puede ser 'ES' o 'EN', por defecto es 'EN'. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/puntos_venta/126?lang=ES`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `idComercio` | Number | Identificador de la parada. |
| `idTipo` | Number | Identificador del núcleo. |
| `idNucleo` | Number | Identificador del núcleo. |
| `idMunicipio` | Number | Identificador del municipio. |
| `municipio` | Number | Nombre del municipio. |
| `nucleo` | Number | Nombre del núcleo. |
| `tipo` | Number | Tipo de punto de venta (Estanco, kiosco, taquilla ...). |
| `direccion` | String | Dirección del punto de venta. |
| `latitud` | Number | Coordenada de latitud del punto de venta. |
| `longitud` | Number | Coordenada de longitud del punto de venta. |

#### `GET /Consorcios/:idConsorcio/puntos_venta`

Devuelve una lista con los puntos de venta del Consorcio


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |
| `lang` | String | **sí** | Identificador del idioma, puede ser 'ES' o 'EN', por defecto es 'EN'. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/puntos_venta?lang=ES`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `idComercio` | Number | Identificador de la parada. |
| `idTipo` | Number | Identificador del núcleo. |
| `idNucleo` | Number | Identificador del núcleo. |
| `idMunicipio` | Number | Identificador del municipio. |
| `municipio` | Number | Nombre del municipio. |
| `nucleo` | Number | Nombre del núcleo. |
| `tipo` | Number | Tipo de punto de venta (Estanco, kiosco, taquilla ...). |
| `direccion` | String | Dirección del punto de venta. |
| `latitud` | Number | Coordenada de latitud del punto de venta. |
| `longitud` | Number | Coordenada de longitud del punto de venta. |

#### `GET /Consorcios/:idConsorcio/puntos_venta`

Devuelve un listado de puntos de venta filtrado por municipio y núcleo, adicionalmente se le puede pasar también el tipo


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |
| `idMunicipio` | Number | **sí** | Identificador del municipio. |
| `idNucleo` | Number | **sí** | Identificador del núcleo. |
| `idTipo` | Number | **sí** | Idenficador del tipo de comercio. |
| `lang` | String | **sí** | Identificador del idioma, puede ser 'ES' o 'EN', por defecto es 'EN'. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/puntos_venta`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `idComercio` | Number | Identificador de la parada. |
| `idTipo` | Number | Identificador del núcleo. |
| `idNucleo` | Number | Identificador del núcleo. |
| `idMunicipio` | Number | Identificador del municipio. |
| `municipio` | Number | Nombre del municipio. |
| `nucleo` | Number | Nombre del núcleo. |
| `tipo` | Number | Tipo de punto de venta (Estanco, kiosco, taquilla ...). |
| `direccion` | String | Dirección del punto de venta. |
| `latitud` | Number | Coordenada de latitud del punto de venta. |
| `longitud` | Number | Coordenada de longitud del punto de venta. |

#### `GET /Consorcios/:idConsorcio/puntos_venta`

Listado de los tipos de puntos de venta del Consorcio


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |
| `lang` | String | **sí** | Identificador del idioma, puede ser 'ES' o 'EN', por defecto es 'EN'. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/tipos_puntos_venta?lang=ES`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `idTipocomercio` | Number | Identificador del tipo de venta la parada. |
| `descripcion` | String | Nombre del tipo de punto de venta. |
| `esTaquilla` | Boolean | Indica si el comercio o punto de venta es una taquilla. |
| `consorcio` | Boolean | Indica si el comercio es externo al Consorcio, o sea que no está ubicado dentro del Consorcio. |


### Saltos

#### `GET /Consorcios/:idConsorcio/saltos`

Lista de los saltos entre zonas


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/saltos`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `origen` | Number | Identificador de la zona origen. |
| `destino` | String | Identificador de la zona destino. |
| `saltos` | Boolean | Numero de saltos entre origen y destino. |

#### `GET /Consorcios/:idConsorcio/calculo_saltos/`

Calcula los saltos entre núcleos


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |
| `origen` | Number | **sí** | Identificador del Núcleo de origen. |
| `destino` | Number | **sí** | Identificador del Núcleo de destino. |
| `lang` | String | **sí** | Identificador del idioma, puede ser 'ES' o 'EN', por defecto es 'EN'. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/saltos`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `saltos` | Number | Número de saltos entre los núcleos. |
| `error` | String | Mensaje de error, solo aparece cuando se devuelve -1 en saltos. |


### Tarifas

#### `GET /Consorcios/:idConsorcio/tarifas_interurbanas`

Devuelve las tarifas interurbanas del consorcio


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/tarifas_interurbanas`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `saltos` | Number | Numero de saltos. |
| `bs` | Number | Billete sencillo. |
| `tarjeta` | Number | Tarjeta. |

#### `GET /Consorcios/:idConsorcio/tarifas_urbanas`

Devuelve las tarifas urbanas del consorcio


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/tarifas_urbanas`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `nombre` | String | Nombre del nucleo. |
| `tu` | Number | Tarifa con transbordo desde un modo interurbano. |
| `importeUsuario` | Number | Tarifa sin transbordo desde un modo interurbano. |


### Zonas

#### `GET /Consorcios/:idConsorcio/zonas`

Lista de las zonas del Consorcio


Parámetros (Parameter):

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idConsorcio` | Number | **sí** | Identificador del Consorcio. |
| `lang` | String | **sí** | Identificador del idioma, puede ser 'ES' o 'EN', por defecto es 'EN'. |

Ejemplo: `http://api.ctan.es/v1/Consorcios/7/zonas`

Respuesta (Success 200):

| Campo | Tipo | Descripción |
|---|---|---|
| `idZona` | Number | Identificador de la zona. |
| `nombre` | Number | Nombre de la zona. |
| `color` | Number | Color que representa a la zona. |

---

## 5. Consecuencias de CORS abierto para la arquitectura

La API responde con `Access-Control-Allow-Origin: *`, así que **la aplicación
puede consultarla en vivo desde el navegador**. Esto abre una opción que antes
no existía:

- **Datos base precalculados** (líneas, paradas, horarios, conexiones para el
  cálculo de rutas) generados en el build a partir del GTFS y servidos como
  ficheros estáticos → rápido, cacheable y funciona sin conexión.
- **Consultas en vivo puntuales** para lo que cambia a diario y pesa poco:
  `noticias` (incidencias y cambios de horario) y, si se quiere, verificación
  de horarios de una línea concreta con `horarios_lineas`.

Es el mejor equilibrio: la app sigue siendo utilizable sin cobertura, pero
puede avisar de incidencias publicadas después de la última generación de datos.

Recordatorio: el aviso legal advierte de que no se garantiza la continuidad del
servicio, así que **toda consulta en vivo debe degradar con elegancia** si falla,
nunca bloquear la interfaz.

---

## 6. Respuestas reales de ejemplo

Capturadas el 25 de agosto de 2026 contra el consorcio 1 (Sevilla), salvo
indicación en contrario. Las listas largas aparecen recortadas.

#### Listado de consorcios
`GET https://api.ctan.es/v1/Consorcios/consorcios`
```json
{
  "consorcios": [
    {
      "idConsorcio": "1",
      "nombre": "Área de Sevilla",
      "nombreCorto": "CTAS"
    },
    {
      "idConsorcio": "2",
      "nombre": "Bahía de Cádiz",
      "nombreCorto": "CMTBC"
    },
    {
      "idConsorcio": "3",
      "nombre": "Área de Granada",
      "nombreCorto": "CTMGR"
    },
    {
      "idConsorcio": "4",
      "nombre": "Área de Málaga",
      "nombreCorto": "CTMAM"
    },
    {
      "idConsorcio": "5",
      "nombre": "Campo de Gibraltar",
      "nombreCorto": "CTMCG"
    },
    {
      "idConsorcio": "6",
      "nombre": "Área de Almería",
      "nombreCorto": "CTAL"
    },
    {
      "idConsorcio": "7",
      "nombre": "Área de Jaén",
      "nombreCorto": "CTJA"
    },
    {
      "idConsorcio": "8",
      "nombre": "Área de Córdoba",
      "nombreCorto": "CTCO"
    },
    {
      "idConsorcio": "9",
      "nombre": "Costa de Huelva",
      "nombreCorto": "CTHU"
    }
  ]
}
```


#### Frecuencias (tipos de día)
`GET https://api.ctan.es/v1/Consorcios/1/frecuencias?lang=ES`
```json
{
  "frecuencias": [
    {
      "idFreq": "1",
      "codigo": "LV",
      "nombre": "Lunes a Viernes"
    },
    {
      "idFreq": "2",
      "codigo": "SA",
      "nombre": "Sábados"
    },
    {
      "idFreq": "3",
      "codigo": "DF",
      "nombre": "Domingos y Festivos"
    },
    {
      "idFreq": "4",
      "codigo": "SADF",
      "nombre": "Sábados, Domingos y Festivos"
    },
    {
      "idFreq": "5",
      "codigo": "V",
      "nombre": "Sólo Viernes"
    },
    {
      "idFreq": "6",
      "codigo": "LVSDF",
      "nombre": "Lunes a Domingo y festivos"
    },
    {
      "idFreq": "7",
      "codigo": "LVSA",
      "nombre": "Lunes a Sábados."
    },
    {
      "idFreq": "8",
      "codigo": "L",
      "nombre": "Solo lunes"
    },
    {
      "idFreq": "9",
      "codigo": "LJ",
      "nombre": "Lunes a Jueves"
    },
    {
      "idFreq": "10",
      "codigo": "MV",
      "nombre": "Martes a Viernes"
    },
    {
      "idFreq": "11",
      "codigo": "MJ",
      "nombre": "Martes a Jueves"
    },
    {
      "idFreq": "12",
      "codigo": "D",
      "nombre": "Domingos"
    }
  ]
}
```


#### Municipios
`GET https://api.ctan.es/v1/Consorcios/1/municipios?lang=ES`
```json
{
  "municipios": [
    {
      "idMunicipio": "2",
      "datos": "ALBAIDA DEL ALJARAFE"
    },
    {
      "idMunicipio": "3",
      "datos": "ALCALÁ DE GUADAÍRA"
    },
    {
      "idMunicipio": "4",
      "datos": "ALCALA DEL RIO"
    }
  ]
}
```


#### Núcleos
`GET https://api.ctan.es/v1/Consorcios/1/nucleos?lang=ES`
```json
{
  "nucleos": [
    {
      "idNucleo": "3159",
      "idMunicipio": "15",
      "idZona": "E",
      "nombre": " LOS FRUTALES DEL ALCOR (Carmona)"
    },
    {
      "idNucleo": "3121",
      "idMunicipio": "2",
      "idZona": "C",
      "nombre": "ALBAIDA DEL ALJARAFE"
    },
    {
      "idNucleo": "3132",
      "idMunicipio": "3",
      "idZona": "C",
      "nombre": "ALCALÁ DE GUADAÍRA"
    }
  ]
}
```


#### Zonas tarifarias
`GET https://api.ctan.es/v1/Consorcios/1/zonas?lang=ES`
```json
{
  "zonas": [
    {
      "idZona": "A",
      "nombre": "ZONA A",
      "color": "#FFCCCC"
    },
    {
      "idZona": "B",
      "nombre": "ZONA B",
      "color": "#CCFFCC"
    },
    {
      "idZona": "C",
      "nombre": "ZONA C",
      "color": "#FFFFCC"
    },
    {
      "idZona": "D",
      "nombre": "ZONA D",
      "color": "#CCCCFF"
    }
  ]
}
```


#### Modos de transporte
`GET https://api.ctan.es/v1/Consorcios/1/modostransporte?lang=ES`
```json
{
  "modosTransporte": [
    {
      "idModo": "5",
      "descripcion": "Bicicleta",
      "observaciones": "Bicicleta"
    },
    {
      "idModo": "1",
      "descripcion": "Bus",
      "observaciones": "Bus"
    },
    {
      "idModo": "2",
      "descripcion": "Metro",
      "observaciones": "Metro"
    },
    {
      "idModo": "3",
      "descripcion": "Tranvía",
      "observaciones": "Tranvía"
    }
  ]
}
```


#### Líneas del consorcio
`GET https://api.ctan.es/v1/Consorcios/1/lineas?lang=ES`
```json
{
  "lineas": [
    {
      "idLinea": "259",
      "codigo": "1011",
      "nombre": "M-101A Circular Bormujos - Castilleja - Tomares - S Juan A - Mairena (sent A)",
      "hayNoticia": "0",
      "modo": "Bus",
      "idModo": "1",
      "operadores": "DAMAS S.A, TRANVIAS DE SEVILLA S.A, ",
      "observacionesModoTransporte": "Bus"
    },
    {
      "idLinea": "260",
      "codigo": "1012",
      "nombre": "M-101B Circular Bormujos - Mairena - SJuan (Cerro SagrCorazones) - Tomares -Castilleja (sent B)",
      "hayNoticia": "0",
      "modo": "Bus",
      "idModo": "1",
      "operadores": "DAMAS S.A, TRANVIAS DE SEVILLA S.A, ",
      "observacionesModoTransporte": "Bus"
    },
    {
      "idLinea": "298",
      "codigo": "1013",
      "nombre": "M-101B Circular Bormujos - Mairena - S Juan A - Tomares - Castilleja (sent B)",
      "hayNoticia": "0",
      "modo": "Bus",
      "idModo": "1",
      "operadores": "DAMAS S.A, TRANVIAS DE SEVILLA S.A, ",
      "observacionesModoTransporte": "Bus"
    }
  ]
}
```


#### Paradas de una línea
`GET https://api.ctan.es/v1/Consorcios/1/lineas/236/paradas?lang=ES`
```json
{
  "paradas": [
    {
      "idParada": "2630",
      "idLinea": "236",
      "idNucleo": "27",
      "idZona": "3",
      "nombre": "TORRE LA REINA URB LA REINA",
      "latitud": "37.51404580616143",
      "longitud": "-6.027529607781985",
      "sentido": "1",
      "orden": 1,
      "modos": "Bus"
    },
    {
      "idParada": "2623",
      "idLinea": "236",
      "idNucleo": "27",
      "idZona": "3",
      "nombre": "ARROYO GALAPAGAR (V)",
      "latitud": "37.553869985969875",
      "longitud": "-6.036247219737556",
      "sentido": "1",
      "orden": 2,
      "modos": "Bus"
    },
    {
      "idParada": "2615",
      "idLinea": "236",
      "idNucleo": "27",
      "idZona": "3",
      "nombre": "VENTA LA ALEGRIA",
      "latitud": "37.54881139752227",
      "longitud": "-6.054101139307022",
      "sentido": "1",
      "orden": 3,
      "modos": "Bus"
    },
    {
      "idParada": "2625",
      "idLinea": "236",
      "idNucleo": "27",
      "idZona": "3",
      "nombre": "PARQUE",
      "latitud": "37.54654552653753",
      "longitud": "-6.056438684463501",
      "sentido": "1",
      "orden": 4,
      "modos": "Bus"
    }
  ]
}
```


#### Todas las paradas
`GET https://api.ctan.es/v1/Consorcios/1/paradas?lang=ES`
```json
{
  "paradas": [
    {
      "idParada": "2565",
      "idNucleo": "3179",
      "idZona": "C",
      "nombre": "1 SEMAFORO",
      "latitud": "37.38309966756113",
      "longitud": "-6.1218196993225105",
      "idMunicipio": "23",
      "municipio": "ESPARTINAS",
      "nucleo": "ESPARTINAS"
    },
    {
      "idParada": "3209",
      "idNucleo": "3225",
      "idZona": "A",
      "nombre": "1º DE MAYO",
      "latitud": "37.38098611",
      "longitud": "-5.957230556",
      "idMunicipio": "42",
      "municipio": "SEVILLA",
      "nucleo": "SEVILLA"
    },
    {
      "idParada": "3237",
      "idNucleo": "3225",
      "idZona": "A",
      "nombre": "ACD DR FEDRIANI Nº 27 ( FRENTE KIOSKO )",
      "latitud": "37.41055359247939",
      "longitud": "-5.984116159460726",
      "idMunicipio": "42",
      "municipio": "SEVILLA",
      "nucleo": "SEVILLA"
    }
  ]
}
```


#### Datos de una parada
`GET https://api.ctan.es/v1/Consorcios/1/paradas/3287?lang=ES`
```json
{
  "idParada": "3287",
  "idNucleo": "3148",
  "idMunicipio": "12",
  "idZona": "B",
  "nombre": "HOSPITAL SAN JUAN DE DIOS ( FRENTE URGENCIAS )",
  "latitud": "37.37243486162521",
  "longitud": "-6.084211592096608",
  "descripcion": "Bus",
  "observaciones": "",
  "principal": "1",
  "inactiva": "0",
  "municipio": "BORMUJOS",
  "nucleo": "BORMUJOS",
  "correspondecias": "Correspondencia con: 1011,1012,1013,1631"
}
```


#### Servicios que pasan por una parada
`GET https://api.ctan.es/v1/Consorcios/1/paradas/3287/servicios?lang=ES`
```json
{
  "servicios": [
    {
      "idParada": "3287",
      "idLinea": "259",
      "servicio": "14:10",
      "nombre": "M-101A Circular Bormujos - Castilleja - Tomares - S Juan A - Mairena (sent A)",
      "linea": "1011",
      "sentido": "1",
      "destino": "BORMUJOS",
      "tipo": "0"
    },
    {
      "idParada": "3287",
      "idLinea": "259",
      "servicio": "14:10",
      "nombre": "M-101A Circular Bormujos - Castilleja - Tomares - S Juan A - Mairena (sent A)",
      "linea": "1011",
      "sentido": "1",
      "destino": "BORMUJOS",
      "tipo": "0"
    },
    {
      "idParada": "3287",
      "idLinea": "259",
      "servicio": "14:10",
      "nombre": "M-101A Circular Bormujos - Castilleja - Tomares - S Juan A - Mairena (sent A)",
      "linea": "1011",
      "sentido": "1",
      "destino": "BORMUJOS",
      "tipo": "0"
    },
    {
      "idParada": "3287",
      "idLinea": "259",
      "servicio": "14:10",
      "nombre": "M-101A Circular Bormujos - Castilleja - Tomares - S Juan A - Mairena (sent A)",
      "linea": "1011",
      "sentido": "1",
      "destino": "BORMUJOS",
      "tipo": "0"
    }
  ],
  "horaIni": "2026-08-25 14:04",
  "horaFin": "2026-08-25 15:04"
}
```


#### Líneas por parada
`GET https://api.ctan.es/v1/Consorcios/1/paradas/lineasPorParadas/3287?lang=ES`
```json
[
  {
    "idLinea": "259",
    "codigo": "1011",
    "nombre": "M-101A Circular Bormujos - Castilleja - Tomares - S Juan A - Mairena (sent A)",
    "descripcion": "Bus",
    "prioridad": "124"
  },
  {
    "idLinea": "260",
    "codigo": "1012",
    "nombre": "M-101B Circular Bormujos - Mairena - SJuan (Cerro SagrCorazones) - Tomares -Castilleja (sent B)",
    "descripcion": "Bus",
    "prioridad": "96"
  },
  {
    "idLinea": "268",
    "codigo": "1631",
    "nombre": "M-163 Circular Sevilla - Bormujos",
    "descripcion": "Bus",
    "prioridad": "59"
  }
]
```


#### HORARIO DE LÍNEA (clave)
`GET https://api.ctan.es/v1/Consorcios/1/horarios_lineas?linea=236&frecuencia=1&dia=15&mes=9&lang=ES`
```json
{
  "planificadores": [
    {
      "idPlani": "1028",
      "fechaInicio": "2026-09-01",
      "fechaFin": "2027-06-30",
      "muestraFechaFin": "0",
      "nucleosIda": [
        {
          "colspan": 1,
          "nombre": "TORRE REINA (Guillena)",
          "color": "#F2F2F2"
        },
        {
          "colspan": 3,
          "nombre": "GUILLENA",
          "color": "#F2F2F2"
        },
        {
          "colspan": 1,
          "nombre": "SANTIPONCE",
          "color": "#F2F2F2"
        },
        {
          "colspan": 1,
          "nombre": "LOS GIRASOLES (Valencina)",
          "color": "#F2F2F2"
        },
        {
          "colspan": 2,
          "nombre": "CAMAS",
          "color": "#F2F2F2"
        },
        {
          "colspan": 2,
          "nombre": "SEVILLA",
          "color": "#F2F2F2"
        }
      ],
      "nucleosVuelta": [],
      "bloquesIda": [
        {
          "nombre": "T. Reina (Guillena)",
          "color": "#FFFFCC",
          "tipo": "0"
        },
        {
          "nombre": "P.I. El Cerro (Guillena)",
          "color": "#FFFFCC",
          "tipo": "0"
        },
        {
          "nombre": "V.Alegría (Guillena)",
          "color": "#FFFFCC",
          "tipo": "0"
        },
        {
          "nombre": "Guillena",
          "color": "#FFFFCC",
          "tipo": "0"
        },
        {
          "nombre": "Itálica (Santiponce)",
          "color": "#CCFFCC",
          "tipo": "0"
        },
        {
          "nombre": "Los Girasoles (Valencina)",
          "color": "#CCFFCC",
          "tipo": "0"
        },
        {
          "nombre": "Camas",
          "color": "#CCFFCC",
          "tipo": "0"
        },
        {
          "nombre": "El Chato (Camas)",
          "color": "#CCFFCC",
          "tipo": "0"
        },
        {
          "nombre": "Chapina(Sevilla)",
          "color": "#FFCCCC",
          "tipo": "0"
        },
        {
          "nombre": "Plaza Armas (Sevilla)",
          "color": "#FFCCCC",
          "tipo": "0"
        },
        {
          "nombre": "Frecuencia",
          "color": "#ffffff",
          "tipo": "1"
        }
      ],
      "horarioIda": [
        {
          "horas": [
            "08:00",
            "08:05",
            "08:08",
            "08:09",
            "08:26",
            "08:30",
            "08:35",
            "08:39",
            "08:43",
            "08:46"
          ],
          "frecuencia": "LV",
          "observaciones": "",
          "demandahoras": ""
        }
      ],
      "bloquesVuelta": [],
      "especial": "0",
      "horarioVuelta": []
    }
  ],
  "frecuencias": [
    {
      "idfrecuencia": "1",
      "acronimo": "LV",
      "nombre": "Lunes a Viernes"
    }
  ],
  "horaCorte": "1900-01-01 00:00:00.000",
  "observacionesModoTransporte": "Bus"
}
```


#### Noticias / incidencias
`GET https://api.ctan.es/v1/Consorcios/7/noticias?lang=ES`
```json
{
  "noticias": [
    {
      "idNoticia": "132",
      "idCategoria": "1",
      "titulo": "Cambio de horarios M15-5",
      "subTitulo": "A partir del lunes 17 de agosto",
      "resumen": "A partir del lunes 17 de agosto",
      "fechaInicio": "2026-08-14",
      "fechafin": null,
      "fechafinFija": null,
      "lineas": null,
      "novedad": "0",
      "categoria": "horarios",
      "orden": "2"
    },
    {
      "idNoticia": "130",
      "idCategoria": "1",
      "titulo": "Se retoman los horarios de verano",
      "subTitulo": "Tras no existir incidencias importantes por las obras",
      "resumen": "Tras no existir incidencias importantes por las obras",
      "fechaInicio": "2026-07-27",
      "fechafin": null,
      "fechafinFija": null,
      "lineas": null,
      "novedad": "0",
      "categoria": "horarios",
      "orden": "2"
    }
  ]
}
```


#### Tarifas interurbanas
`GET https://api.ctan.es/v1/Consorcios/1/tarifas_interurbanas?lang=ES`
```json
{
  "tarifasInterurbanas": [
    {
      "saltos": "0",
      "bs": "1.5500000",
      "tarjeta": ".6100000"
    },
    {
      "saltos": "1",
      "bs": "1.7000000",
      "tarjeta": ".6400000"
    },
    {
      "saltos": "2",
      "bs": "1.8000000",
      "tarjeta": ".7300000"
    }
  ]
}
```
