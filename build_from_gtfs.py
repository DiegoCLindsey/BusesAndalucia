#!/usr/bin/env python3
"""Genera los datos de la aplicación a partir del GTFS oficial de la CTAN.

Sustituye al scraping de HTML de ctas.es. El GTFS da explícito lo que antes
había que deducir: qué paradas recorre cada viaje y a qué hora pasa por cada
una (`stop_times`), qué días circula (`calendar` + `calendar_dates`) y por
dónde va la carretera (`shapes`).

    python3 build_from_gtfs.py            # usa cache/gtfs.zip
    python3 build_from_gtfs.py --descargar  # lo baja antes

El municipio de cada parada NO está en el GTFS: lo da el endpoint /paradas de
la API. Se cachea en cache/paradas_{id}.json; sin él, el consorcio se genera
igual pero sin municipios, y la agrupación del mapa se degrada.

    python3 build_from_gtfs.py --paradas   # baja /paradas de los 9 consorcios

Información proporcionada por el Portal de Datos Abiertos de la Red de
Consorcios de Transporte de Andalucía.
"""

import csv, io, json, os, sys, zipfile, urllib.request, collections, math, datetime

GTFS_URL = "https://api.ctan.es/v1/datos/UNIFICADO/gtfs.zip"
API = "https://api.ctan.es/v1"
UA = "BusesAndalucia/2.0 (+https://github.com/DiegoCLindsey/BusesAndalucia)"
CACHE = "cache"
FUENTES = "fuentes"   # copia versionada de /paradas, para poder regenerar sin red
SALIDA = "data"

# El GTFS unificado no dice a qué consorcio pertenece cada prefijo; el nombre
# sale de agency.txt, pero el orden y el código oficial son estos.
CONSORCIOS = {
    1: ("Área de Sevilla", "CTAS"),
    2: ("Bahía de Cádiz", "CMTBC"),
    3: ("Área de Granada", "CTMGR"),
    4: ("Área de Málaga", "CTMAM"),
    5: ("Campo de Gibraltar", "CTMCG"),
    6: ("Área de Almería", "CTAL"),
    7: ("Área de Jaén", "CTJA"),
    8: ("Área de Córdoba", "CTCO"),
    9: ("Costa de Huelva", "CTHU"),
}

DIAS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
TOLERANCIA_SHAPE_M = 10       # simplificación del trazado
DECIMALES = 5                 # ~1 m, de sobra para dibujar un autobús

# Grafo a pie: qué paradas están lo bastante cerca como para ir andando de una
# a otra en un trasbordo. 600 m son doce minutos a 3 km/h, que es el techo que
# ya tenía el grafo de Sevilla; se recorta a los diez vecinos más próximos
# porque en el centro de Granada o Málaga hay paradas con cuarenta alrededor y
# las lejanas nunca se usan.
RADIO_A_PIE_M = 600
MAX_VECINOS = 10
VELOCIDAD_A_PIE_KMH = 3


# ---------------------------------------------------------------- utilidades

def descargar(url, destino):
    print(f"  bajando {url}")
    pet = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(pet, timeout=120) as r, open(destino, "wb") as f:
        f.write(r.read())


def minutos(hhmmss):
    """'25:10:00' -> 1510. El GTFS pasa de 24 h para los viajes que cruzan la
    medianoche, y eso hay que conservarlo: son el mismo día de servicio."""
    h, m, s = hhmmss.split(":")
    return int(h) * 60 + int(m) + (1 if int(s) >= 30 else 0)


def prefijo(ident):
    return int(ident.split("_", 1)[0])


def sin_prefijo(ident):
    return ident.split("_", 1)[1]


def metros(a, b):
    """Distancia aproximada entre dos (lat, lng). A escala de una provincia
    la proyección plana con el coseno de la latitud se equivoca en centímetros,
    y aquí se está midiendo si dos paradas están en la misma esquina."""
    dy = (a[0] - b[0]) * 111320.0
    dx = (a[1] - b[1]) * 111320.0 * math.cos(math.radians((a[0] + b[0]) / 2))
    return math.hypot(dx, dy)


def minutos_andando(distancia_m):
    return max(1, round(distancia_m / 1000 / VELOCIDAD_A_PIE_KMH * 60))


def grafo_a_pie(coords):
    """Vecinos andando de cada parada: {parada: [[vecina, minutos], …]}.

    Antes esto venía de ctas_routing.json, un fichero suelto que sólo tenía
    Sevilla (1.013 paradas de 1.105) y Málaga a medias (74 de 1.296); las otras
    siete áreas se quedaban sin un solo trasbordo a pie, así que el buscador no
    podía enlazar dos líneas que paran en la misma plaza pero en aceras
    distintas. Ahora se calcula de las coordenadas del propio GTFS, que las
    trae para las nueve.

    Se indexa en una rejilla del tamaño del radio para no comparar cinco mil
    paradas contra cinco mil."""
    alto = RADIO_A_PIE_M / 111320.0        # el radio, en grados de latitud
    ancho = alto / 0.75                    # y en longitud: Andalucía va de 36° a
                                           # 38,5°, donde el coseno no baja de 0,78
    celda = lambda lat, lng: (int(lat / alto), int(lng / ancho))
    rejilla = collections.defaultdict(list)
    for pid, (lat, lng) in coords.items():
        rejilla[celda(lat, lng)].append(pid)

    vecinos = {}
    for pid, punto in coords.items():
        cx, cy = celda(*punto)
        cerca = []
        for i in (-1, 0, 1):
            for j in (-1, 0, 1):
                for otro in rejilla.get((cx + i, cy + j), ()):
                    if otro == pid:
                        continue
                    d = metros(punto, coords[otro])
                    if d <= RADIO_A_PIE_M:
                        cerca.append((d, otro))
        if not cerca:
            continue
        cerca.sort()
        vecinos[pid] = [[otro, minutos_andando(d)] for d, otro in cerca[:MAX_VECINOS]]
    return vecinos


PARTICULAS = {"de", "del", "la", "las", "el", "los", "y", "a", "al", "en"}


def legible(texto):
    """La API devuelve los municipios en mayúsculas («BORMUJOS», «ALCALÁ DEL
    RÍO») y a gritos desentonan al lado del resto de la interfaz. Se pasan a
    capitales iniciales dejando en minúscula las partículas."""
    if not texto:
        return texto
    bruto = str(texto).strip()
    if bruto != bruto.upper():
        return bruto           # ya viene escrito bien
    palabras = bruto.lower().split()
    return " ".join(p if i and p in PARTICULAS else p.capitalize()
                    for i, p in enumerate(palabras))


def slug(texto):
    import re, unicodedata
    t = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-")


def codigo_linea(ruta):
    """El código con el que se conoce la línea: 'M-177', 'M1-5', '0111'.

    Los consorcios no lo publican igual. Sevilla lo pone al principio del
    nombre largo («M-177 Torre De La Reina - Guillena - …») y deja en
    route_short_name un número interno distinto para cada variante (1770,
    1772, 1773…), así que agrupar por short_name partiría la M-177 en seis
    líneas. Los demás dejan el nombre largo sin código y ponen el bueno en
    short_name («M-110», «0111»).

    Así que manda el código del principio del nombre largo si lo hay, y si
    no, short_name."""
    import re
    largo = (ruta.get("route_long_name") or "").strip()
    m = re.match(r"([A-Za-zÀ-ÿ]{0,2}\d*-\d+[A-Za-z]?)(?=\s)", largo)
    if m:
        return m.group(1)
    corto = (ruta.get("route_short_name") or "").strip()
    return corto or largo[:8]


def distancia_a_recta(p, a, b):
    """Distancia aproximada en metros de p al segmento ab, en grados
    convertidos a metros con la latitud media. A esta escala la Tierra es
    plana de sobra."""
    escala_lat = 111320.0
    escala_lng = 111320.0 * math.cos(math.radians(p[0]))
    px, py = p[1] * escala_lng, p[0] * escala_lat
    ax, ay = a[1] * escala_lng, a[0] * escala_lat
    bx, by = b[1] * escala_lng, b[0] * escala_lat
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def douglas_peucker(puntos, tolerancia):
    """Quita los puntos que no cambian la forma del trazado. shapes.txt trae
    375.000 puntos para toda Andalucía; con 10 m de tolerancia el recorrido se
    dibuja igual ocupando una fracción."""
    if len(puntos) < 3:
        return puntos
    dmax, idx = 0.0, 0
    for i in range(1, len(puntos) - 1):
        d = distancia_a_recta(puntos[i], puntos[0], puntos[-1])
        if d > dmax:
            dmax, idx = d, i
    if dmax <= tolerancia:
        return [puntos[0], puntos[-1]]
    return (douglas_peucker(puntos[:idx + 1], tolerancia)[:-1] +
            douglas_peucker(puntos[idx:], tolerancia))


# ---------------------------------------------------------------- lectura

def leer_gtfs(z, nombre):
    with z.open(nombre) as fh:
        # utf-8-sig porque algún fichero trae BOM, y los nombres de columna se
        # limpian porque agency.txt publica " agency_name" con un espacio
        # delante que rompería cualquier acceso por clave.
        lector = csv.DictReader(io.TextIOWrapper(fh, encoding="utf-8-sig"))
        lector.fieldnames = [c.strip() for c in lector.fieldnames]
        return list(lector)


def municipios_de(idc):
    """Municipio, núcleo y zona de cada parada. Primero la caché de la API,
    que es el dato oficial; si no está, para Sevilla se reaprovecha lo que ya
    tenía la aplicación (los identificadores del GTFS son los mismos)."""
    # La caché es lo primero; si no está, la copia versionada del
    # repositorio, para que el pipeline sea reproducible en un clon limpio
    # sin tener que volver a llamar a la API.
    ruta = os.path.join(CACHE, f"paradas_{idc}.json")
    if not os.path.exists(ruta):
        ruta = os.path.join(FUENTES, f"paradas_{idc}.json")
    if os.path.exists(ruta):
        with open(ruta, encoding="utf-8") as f:
            datos = json.load(f)
        return {p["idParada"]: (legible(p.get("municipio")), legible(p.get("nucleo")),
                                p.get("idZona") or None)
                for p in datos.get("paradas", [])}, "api"
    return {}, "sin municipios"


def bajar_paradas():
    os.makedirs(FUENTES, exist_ok=True)
    for idc in CONSORCIOS:
        destino = os.path.join(FUENTES, f"paradas_{idc}.json")
        if os.path.exists(destino):
            print(f"  {idc}: ya en caché")
            continue
        descargar(f"{API}/Consorcios/{idc}/paradas?lang=ES", destino)


# ---------------------------------------------------------------- proceso

def construir():
    ruta_zip = os.path.join(CACHE, "gtfs.zip")
    if not os.path.exists(ruta_zip):
        print(f"No está {ruta_zip}. Ejecuta con --descargar.", file=sys.stderr)
        sys.exit(1)

    z = zipfile.ZipFile(ruta_zip)
    print("leyendo el GTFS…")
    stops = leer_gtfs(z, "stops.txt")
    routes = leer_gtfs(z, "routes.txt")
    trips = leer_gtfs(z, "trips.txt")
    stop_times = leer_gtfs(z, "stop_times.txt")
    calendar = leer_gtfs(z, "calendar.txt")
    calendar_dates = leer_gtfs(z, "calendar_dates.txt")
    shapes = leer_gtfs(z, "shapes.txt")
    print(f"  {len(stops)} paradas · {len(routes)} líneas · {len(trips)} viajes · "
          f"{len(stop_times)} pasos · {len(shapes)} puntos de trazado")

    # Los pasos de cada viaje, en orden. Es lo que convierte el GTFS en algo
    # utilizable: la secuencia real de paradas y horas de un autobús concreto.
    print("agrupando pasos por viaje…")
    por_viaje = collections.defaultdict(list)
    for r in stop_times:
        por_viaje[r["trip_id"]].append(r)
    for v in por_viaje.values():
        v.sort(key=lambda r: int(r["stop_sequence"]))

    # Trazados simplificados, uno por shape_id.
    print("simplificando trazados…")
    puntos_shape = collections.defaultdict(list)
    for r in shapes:
        puntos_shape[r["shape_id"]].append(
            (int(r["shape_pt_sequence"]), float(r["shape_pt_lat"]), float(r["shape_pt_lon"])))
    trazados = {}
    antes = despues = 0
    for sid, pts in puntos_shape.items():
        pts.sort()
        crudos = [(la, lo) for _, la, lo in pts]
        antes += len(crudos)
        simple = douglas_peucker(crudos, TOLERANCIA_SHAPE_M)
        despues += len(simple)
        trazados[sid] = [[round(la, DECIMALES), round(lo, DECIMALES)] for la, lo in simple]
    print(f"  {antes} → {despues} puntos ({100 * despues / antes:.0f}%)")

    calend = {c["service_id"]: c for c in calendar}
    excepciones = collections.defaultdict(lambda: {"mas": [], "menos": []})
    for x in calendar_dates:
        clave = "mas" if x["exception_type"] == "1" else "menos"
        excepciones[x["date"]][clave].append(x["service_id"])

    # El grafo a pie se calcula sobre TODAS las paradas de Andalucía de una vez,
    # no consorcio a consorcio, por si dos áreas llegasen a tocarse: al llevar
    # los identificadores el prefijo del consorcio, un vecino de fuera se puede
    # nombrar sin ambigüedad. Hoy no hay ninguno —las nueve redes no se acercan
    # a menos de 600 m entre sí—, y la línea de resumen lo dice para que se note
    # el día que cambie.
    print("calculando el grafo a pie…")
    coords = {s_["stop_id"]: (float(s_["stop_lat"]), float(s_["stop_lon"])) for s_ in stops}
    vecinos = grafo_a_pie(coords)
    fuera = sum(1 for pid, vs in vecinos.items()
                for v, _ in vs if prefijo(v) != prefijo(pid))
    print(f"  {len(vecinos)} de {len(coords)} paradas con vecino a menos de "
          f"{RADIO_A_PIE_M} m ({fuera} enlaces cruzan de área)")

    hoy = datetime.date.today().isoformat()
    os.makedirs(SALIDA, exist_ok=True)
    indice = []
    catalogo = {"generado": hoy, "paradas": {}, "lineas": [], "municipios": []}

    for idc in sorted(CONSORCIOS):
        nombre, codigo = CONSORCIOS[idc]
        indice.append(procesar_consorcio(
            idc, nombre, codigo, stops, routes, trips, por_viaje,
            calend, excepciones, trazados, vecinos, hoy, catalogo))

    catalogo["municipios"] = sorted(catalogo["municipios"])
    escribir(os.path.join(SALIDA, "catalogo.json"), catalogo)
    kb_cat = os.path.getsize(os.path.join(SALIDA, "catalogo.json")) / 1024
    print(f"\ncatálogo de toda Andalucía: {len(catalogo['paradas'])} paradas, "
          f"{len(catalogo['lineas'])} líneas, {len(catalogo['municipios'])} municipios "
          f"({kb_cat:.0f} KB)")

    with open(os.path.join(SALIDA, "consorcios.json"), "w", encoding="utf-8") as f:
        json.dump({
            "generado": hoy,
            "fuente": GTFS_URL,
            "atribucion": ("Información proporcionada por el Portal de Datos Abiertos "
                           "de la Red de Consorcios de Transporte de Andalucía"),
            "consorcios": indice
        }, f, ensure_ascii=False, separators=(",", ":"))

    print("\n=== resumen ===")
    total = 0
    for c in indice:
        kb = c["kb"]
        total += kb
        aviso = "  ← pasa de 2,5 MB" if kb > 2560 else ""
        print(f"  {c['id']}  {c['nombre']:<22} {c['paradas']:>5} paradas "
              f"{c['lineas']:>4} líneas  {kb:>7.0f} KB{aviso}")
    print(f"     {'TOTAL':<25} {total / 1024:.1f} MB")


def procesar_consorcio(idc, nombre, codigo, stops, routes, trips, por_viaje,
                       calend, excepciones, trazados, vecinos, hoy, catalogo):
    mios_stop = {s["stop_id"]: s for s in stops if prefijo(s["stop_id"]) == idc}
    mias_route = {r["route_id"]: r for r in routes if prefijo(r["route_id"]) == idc}
    mios_trip = [t for t in trips if t["route_id"] in mias_route]

    muni, origen_muni = municipios_de(idc)

    # Un route_id del GTFS es una VARIANTE, no una línea: la M-177 son seis
    # rutas distintas («…Sent Sevilla», «…Directo», «…Sin Parada En Torre De
    # La Reina»). La línea es el código M-xxx que abre el nombre, que es lo
    # que la gente llama "la 177" y lo que la aplicación agrupa.
    variantes_de = collections.defaultdict(list)
    for rid, r in mias_route.items():
        variantes_de[codigo_linea(r)].append(rid)
    slug_linea = {}
    titulo_linea = {}
    for cod, rids in variantes_de.items():
        # El título de la línea es el del recorrido más largo, sin la coletilla
        # entre paréntesis que sólo distingue variantes.
        mejor = max(rids, key=lambda rid: len(mias_route[rid]["route_long_name"]))
        titulo = mias_route[mejor]["route_long_name"].strip()
        if titulo.endswith(")") and "(" in titulo:
            titulo = titulo[:titulo.rindex("(")].strip()
        # Fuera de Sevilla el nombre largo no lleva el código delante, y el
        # distintivo se pinta aparte: se antepone para que el título sea
        # igual de reconocible en los nueve consorcios.
        if not titulo.startswith(cod):
            titulo = f"{cod} {titulo}"
        titulo_linea[cod] = titulo
        for rid in rids:
            slug_linea[rid] = slug(titulo)

    # --- bloques ---------------------------------------------------------
    # Un BLOQUE es (línea, sentido, secuencia de paradas): un recorrido
    # concreto con todos los viajes que lo hacen. Es exactamente el modelo que
    # ya usa el motor de la aplicación, así que el GTFS encaja sin adaptador:
    # antes esos bloques se reconstruían leyendo los horarios en columna y
    # cortando donde la hora retrocedía; ahora vienen dados por trip_id.
    agrupados = collections.defaultdict(list)
    for t in mios_trip:
        pasos = por_viaje.get(t["trip_id"], [])
        if len(pasos) < 2:
            continue
        secuencia = tuple(p["stop_id"] for p in pasos)
        agrupados[(t["route_id"], t["direction_id"], secuencia)].append((t, pasos))

    bloques = []
    for (rid, direccion, secuencia), viajes in sorted(agrupados.items(), key=lambda kv: kv[0][:2]):
        ruta = mias_route[rid]
        # Cada viaje son las horas de paso; se guardan en minutos desde la
        # medianoche del día de servicio, que es como las maneja la aplicación
        # (y por lo que un viaje de madrugada pasa de 1440 en vez de volver a
        # empezar: si no, salían esperas negativas).
        filas = []
        for t, pasos in viajes:
            horas = [minutos(p["departure_time"] or p["arrival_time"]) for p in pasos]
            filas.append((horas, t["service_id"], t["shape_id"]))
        filas.sort(key=lambda f: f[0][0])

        paradas = list(secuencia)
        shape = filas[0][2]
        bloques.append({
            "l": slug_linea[rid],
            "var": sin_prefijo(rid),
            "d": int(direccion),
            "p": paradas,
            "v": [f[0] for f in filas],
            "s": [f[1] for f in filas],
            "g": shape if shape in trazados else None,
        })

    # --- paradas ---------------------------------------------------------
    # Array posicional en vez de objeto con claves: con mil paradas, repetir
    # "nombre"/"lat"/"lng" mil veces cuesta más que los propios datos.
    paradas = {}
    for sid, s in mios_stop.items():
        # El identificador conserva el prefijo del consorcio, tal cual viene del
        # GTFS («1_3287»). Recortarlo hacía que 1.075 de 3.146 paradas
        # compartieran número con otra de otra área — la 2112 es «C Atilano de
        # Acevedo» en Sevilla y «Hotel Las Pedrizas» en Málaga — y con eso no se
        # pueden tener dos áreas cargadas a la vez. La API de municipios sí usa
        # el número pelado, así que se consulta con él.
        m, n, zona = muni.get(sin_prefijo(sid), (None, None, None))
        paradas[sid] = [
            s["stop_name"].strip(),
            round(float(s["stop_lat"]), DECIMALES),
            round(float(s["stop_lon"]), DECIMALES),
            zona, m,
        ]

    lineas = []
    for cod in sorted(variantes_de):
        rids = sorted(variantes_de[cod])
        r0 = mias_route[rids[0]]
        lineas.append({
            "slug": slug(titulo_linea[cod]),
            "idc": idc,
            "codigo": cod,
            "titulo": titulo_linea[cod],
            "color": (r0.get("route_color") or "").upper() or None,
            "url": r0.get("route_url") or None,
            "variantes": [{"id": sin_prefijo(rid),
                           "nombre": mias_route[rid]["route_long_name"].strip()}
                          for rid in rids],
        })

    # --- calendario ------------------------------------------------------
    # Sólo los servicios que usa este consorcio, y sólo las fechas en las que
    # pasa algo. calendar.txt cubre hasta 2038 y las excepciones son de un año.
    usados = {s for b in bloques for s in b["s"]}
    servicios = {}
    for sid in sorted(usados):
        c = calend.get(sid)
        if not c:
            # Hay servicios que sólo existen como excepción: circulan
            # exclusivamente los días que diga calendar_dates.
            servicios[sid] = [0, 0, 0, 0, 0, 0, 0, "19700101", "19700101"]
            continue
        servicios[sid] = [int(c[d]) for d in DIAS] + [c["start_date"], c["end_date"]]

    exc = {}
    for fecha, cambio in sorted(excepciones.items()):
        mas = [s for s in cambio["mas"] if s in usados]
        menos = [s for s in cambio["menos"] if s in usados]
        if mas or menos:
            exc[fecha] = {}
            if mas:
                exc[fecha]["+"] = mas
            if menos:
                exc[fecha]["-"] = menos

    # La API devuelve menos paradas que el GTFS en varios consorcios (en
    # Granada, 841 de 1.285), así que unas cuantas se quedan sin municipio.
    # Se rellenan con el de la parada oficial más cercana, que a menos de un
    # par de kilómetros acierta casi siempre: son paradas de la misma calle o
    # del mismo polígono. Más lejos se deja en blanco antes que inventar.
    RADIO_HEREDA_M = 2000
    conocidas = [(pid, p) for pid, p in paradas.items() if p[4]]
    huerfanas = [(pid, p) for pid, p in paradas.items() if not p[4]]
    heredados = 0
    for pid, p in huerfanas:
        mejor, mejor_d = None, RADIO_HEREDA_M
        for _, q in conocidas:
            d = math.hypot((p[1] - q[1]) * 111320.0,
                           (p[2] - q[2]) * 111320.0 * math.cos(math.radians(p[1])))
            if d < mejor_d:
                mejor, mejor_d = q, d
        if mejor:
            p[4] = mejor[4]
            if p[3] is None:
                p[3] = mejor[3]
            heredados += 1

    municipios = sorted({p[4] for p in paradas.values() if p[4]})

    # Vecinos a pie de las paradas de este área. Si alguno cayera fuera del
    # área, se deja igual: no estorba mientras la vecina no esté cargada, y
    # enlaza las dos en cuanto lo esté.
    mis_vecinos = {pid: vecinos[pid] for pid in paradas if pid in vecinos}

    lats = [p[1] for p in paradas.values()]
    lngs = [p[2] for p in paradas.values()]
    bbox = [min(lats), min(lngs), max(lats), max(lngs)] if lats else None

    # --- escritura -------------------------------------------------------
    carpeta = os.path.join(SALIDA, str(idc))
    os.makedirs(carpeta, exist_ok=True)

    # Lo ligero —dónde está cada parada, qué líneas hay, cómo se llaman los
    # municipios— va al catálogo común: es lo que la aplicación necesita para
    # buscar, pintar el mapa y reconocer un favorito de cualquier punto de
    # Andalucía, y junta no llega al megabyte. Lo pesado —los horarios— se
    # queda por área y se baja cuando de verdad hace falta.
    catalogo["paradas"].update(paradas)
    catalogo["lineas"].extend(lineas)
    catalogo["municipios"].extend(municipios)

    cabecera = {"id": idc, "nombre": nombre, "codigo": codigo, "generado": hoy}
    trazados_usados = {b["g"]: trazados[b["g"]] for b in bloques if b["g"]}
    escribir(os.path.join(carpeta, "horarios.json"), {
        **cabecera,
        "bloques": bloques,
        "trazados": trazados_usados,
        "calendario": {"servicios": servicios, "excepciones": exc},
        "vecinos": mis_vecinos,
    })

    kb = os.path.getsize(os.path.join(carpeta, "horarios.json")) / 1024
    sin_muni = sum(1 for p in paradas.values() if not p[4])
    con_vecinos = len(mis_vecinos)
    detalle = origen_muni
    if heredados:
        detalle += f", {heredados} heredados"
    if sin_muni:
        detalle += f", {sin_muni} SIN"
    print(f"  {idc} {nombre:<22} {len(paradas):>5} paradas {len(lineas):>4} líneas "
          f"{len(bloques):>4} bloques  {kb:>7.0f} KB   municipios: {detalle}   "
          f"a pie: {con_vecinos}")

    return {"id": idc, "nombre": nombre, "codigo": codigo, "bbox": bbox,
            "paradas": len(paradas), "lineas": len(lineas), "kb": round(kb)}


def escribir(ruta, datos):
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    sys.setrecursionlimit(20000)   # Douglas-Peucker es recursivo
    if "--descargar" in sys.argv:
        os.makedirs(CACHE, exist_ok=True)
        descargar(GTFS_URL, os.path.join(CACHE, "gtfs.zip"))
    if "--paradas" in sys.argv:
        bajar_paradas()
    construir()
