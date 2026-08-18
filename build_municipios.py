#!/usr/bin/env python3
"""Asigna un municipio a cada parada de `ctas_data_app.json`.

ctas.es no publica el municipio de cada parada: solo la zona tarifaria y
las coordenadas, más una lista (incompleta) de municipios por línea. Como
el grafo tripartito municipio-parada-línea de la app necesita ese dato,
aquí se deduce sin depender de ningún servicio externo:

 1. Semillas: la ZONA A del consorcio es exactamente la capital, así que
    toda parada en zona A es de Sevilla y se fija como ancla.
 2. Núcleos: un catálogo con las coordenadas del casco urbano de cada
    municipio del consorcio (más los tres núcleos que el propio consorcio
    trata aparte: Montequinto, Nueva Sevilla y San José de la Rinconada).
    Cada parada se asigna al núcleo más cercano.
 3. Reajuste: los núcleos se recolocan sobre la mediana de las paradas que
    han caído en ellos y se vuelve a asignar, para corregir el error de
    partida del catálogo. El núcleo nunca se aleja más de MAX_DERIVA_KM de
    su posición de catálogo, para que un municipio con pocas paradas no se
    "coma" a su vecino.
 4. Suavizado: una parada rodeada de paradas de otro municipio se pasa a
    ese municipio (voto de sus K vecinas más próximas). Esto arregla los
    bordes, donde la distancia al núcleo no decide bien — sobre todo en
    Sevilla capital, que es grande y su centro queda lejos de sus barrios.

El resultado se escribe como campo `municipio` de cada parada. Es
idempotente: se puede volver a ejecutar sobre el fichero ya procesado.
"""

import json
import math
import re
import statistics
import sys
import unicodedata
from collections import Counter

FICHERO = sys.argv[1] if len(sys.argv) > 1 else "ctas_data_app.json"

# Casco urbano de cada municipio servido por el consorcio. Solo son el
# punto de partida: el paso 3 los recoloca sobre las paradas reales.
NUCLEOS = {
    "Albaida del Aljarafe": (37.4093, -6.1739),
    "Alcalá de Guadaira": (37.3387, -5.8404),
    "Alcalá del Río": (37.5194, -5.9789),
    "Almensilla": (37.3282, -6.0864),
    "Aznalcázar": (37.3159, -6.2679),
    "Aznalcóllar": (37.5178, -6.2680),
    "Benacazón": (37.3607, -6.1975),
    "Bollullos de la Mitación": (37.3418, -6.1355),
    "Bormujos": (37.3733, -6.0722),
    "Brenes": (37.5450, -5.8720),
    "Camas": (37.4004, -6.0328),
    "Carmona": (37.4713, -5.6414),
    "Carrión de los Céspedes": (37.3672, -6.3247),
    "Castilleja de Guzmán": (37.4058, -6.0553),
    "Castilleja de la Cuesta": (37.3876, -6.0553),
    "Castilleja del Campo": (37.3833, -6.3667),
    "Coria del Río": (37.2861, -6.0539),
    "Dos Hermanas": (37.2833, -5.9222),
    "El Viso del Alcor": (37.3908, -5.7186),
    "Espartinas": (37.3689, -6.1247),
    "Gelves": (37.3300, -6.0264),
    "Gerena": (37.5333, -6.2167),
    "Gines": (37.3861, -6.0806),
    "Guillena": (37.5389, -6.0583),
    "Huévar del Aljarafe": (37.3583, -6.2611),
    "Isla Mayor": (37.1333, -6.1667),
    "La Algaba": (37.4661, -6.0175),
    "La Puebla del Río": (37.2694, -6.0653),
    "La Rinconada": (37.4869, -5.9803),
    "Los Palacios": (37.1614, -5.9247),
    "Mairena del Alcor": (37.3739, -5.7444),
    "Mairena del Aljarafe": (37.3400, -6.0600),
    "Montequinto (Dos Hermanas)": (37.3325, -5.9414),
    "Nueva Sevilla (Castilleja de la Cuesta)": (37.3903, -6.0483),
    "Olivares": (37.4139, -6.1500),
    "Palomares del Río": (37.3167, -6.0500),
    "Pilas": (37.2986, -6.3000),
    "Salteras": (37.4467, -6.1078),
    "San José de la Rinconada": (37.4756, -5.9425),
    "San Juan de Aznalfarache": (37.3583, -6.0361),
    "Sanlúcar la Mayor": (37.3856, -6.2044),
    "Santiponce": (37.4344, -6.0439),
    "Sevilla": (37.3891, -5.9845),
    "Tomares": (37.3733, -6.0472),
    "Umbrete": (37.3667, -6.1583),
    "Utrera": (37.1833, -5.7833),
    "Valencina de la Concepción": (37.4167, -6.0750),
    "Villamanrique de la Condesa": (37.2333, -6.3167),
    "Villanueva del Ariscal": (37.3833, -6.1667),
}

# Anejos y pedanías que quedan lejos del casco urbano de su municipio: por
# distancia caerían en el pueblo vecino (Torre de la Reina está a 4 km de
# Alcalá del Río y a 10 de Guillena, pero es de Guillena). Cada entrada es
# un trozo de nombre de parada que ancla ese anejo: el punto de partida se
# saca de las propias paradas que lo llevan en el nombre, no de un
# catálogo que pueda estar desfasado.
ANEJOS = {
    "TORRE DE LA REINA": "Guillena",
    "TORRE LA REINA": "Guillena",
    "LAS PAJANOSAS": "Guillena",
}

MAX_SEPARACION_KM = 0.4  # hasta dónde se consideran "la misma parada" dos caras
MAX_DERIVA_KM = 3.0   # cuánto puede moverse un núcleo respecto al catálogo
ITERACIONES = 6
VECINOS_VOTO = 6      # cuántas vecinas votan en el suavizado
MAYORIA_VOTO = 5      # cuántas de ellas deben coincidir para cambiar
PASADAS_VOTO = 3


def clave_nombre(nombre):
    """Nombre de parada sin acentos ni marcas de sentido, para reconocer
    las dos caras de una misma parada ("X", "X (V)", "X (FRENTE)")."""
    txt = unicodedata.normalize("NFD", nombre)
    txt = "".join(c for c in txt if unicodedata.category(c) != "Mn").upper()
    txt = re.sub(r"\((?:I|V|U|FRENTE)\)", " ", txt)
    return re.sub(r"[^A-Z0-9]+", " ", txt).strip()


def haversine(a, b):
    r = 6371.0
    dlat = math.radians(b[0] - a[0])
    dlon = math.radians(b[1] - a[1])
    h = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(a[0])) * math.cos(math.radians(b[0])) * math.sin(dlon / 2) ** 2)
    return 2 * r * math.asin(math.sqrt(h))


def main():
    with open(FICHERO, encoding="utf-8") as f:
        data = json.load(f)

    paradas = data["paradas"]
    puntos = {pid: (p["lat"], p["lng"]) for pid, p in paradas.items()
              if p.get("lat") is not None and p.get("lng") is not None}
    anclas = {pid for pid, p in paradas.items()
              if p.get("zona") == "ZONA A" and pid in puntos}

    # Los anejos entran como núcleos adicionales, anclados sobre las
    # paradas que los nombran, y luego se traducen a su municipio.
    centros = dict(NUCLEOS)
    de_anejo = {}
    for termino, muni in ANEJOS.items():
        suyas = [puntos[pid] for pid, p in paradas.items()
                 if pid in puntos and termino in p["nombre"].upper()]
        if not suyas:
            continue
        clave = "@" + termino
        centros[clave] = (statistics.median(p[0] for p in suyas),
                          statistics.median(p[1] for p in suyas))
        de_anejo[clave] = muni

    fijos = dict(centros)
    asignacion = {}

    for _ in range(ITERACIONES):
        for pid, pt in puntos.items():
            if pid in anclas:
                asignacion[pid] = "Sevilla"
                continue
            asignacion[pid] = min(centros, key=lambda m: haversine(pt, centros[m]))
        # Recolocar cada núcleo sobre la mediana de sus paradas, sin dejar
        # que se aleje demasiado del catálogo.
        nuevos = {}
        for muni, base in fijos.items():
            suyas = [puntos[pid] for pid, m in asignacion.items() if m == muni]
            if not suyas:
                nuevos[muni] = base
                continue
            cand = (statistics.median(p[0] for p in suyas),
                    statistics.median(p[1] for p in suyas))
            nuevos[muni] = cand if haversine(cand, base) <= MAX_DERIVA_KM else base
        if nuevos == centros:
            break
        centros = nuevos

    asignacion = {pid: de_anejo.get(m, m) for pid, m in asignacion.items()}

    # Suavizado por vecindad: arregla los bordes, donde "el núcleo más
    # cercano" no es buen criterio (sobre todo en la capital).
    ids = list(puntos)
    for _ in range(PASADAS_VOTO):
        cambios = 0
        nuevo = dict(asignacion)
        for pid in ids:
            if pid in anclas:
                continue
            pt = puntos[pid]
            cercanas = sorted((haversine(pt, puntos[o]), o) for o in ids if o != pid)[:VECINOS_VOTO]
            voto = Counter(asignacion[o] for _, o in cercanas)
            muni, cuantos = voto.most_common(1)[0]
            if cuantos >= MAYORIA_VOTO and muni != asignacion[pid]:
                nuevo[pid] = muni
                cambios += 1
        asignacion = nuevo
        if not cambios:
            break

    # Coherencia entre las dos caras de una misma parada: ctas.es publica
    # cada sentido como parada distinta con el mismo nombre ("X" y "X (V)").
    # Estando a unos metros una de otra, no pueden salir de municipios
    # distintos — pero justo ahí, en el borde, es donde la distancia al
    # núcleo decide peor. Se unifican al municipio cuyo núcleo quede más
    # cerca del punto medio del grupo.
    finales = {}
    for muni in set(asignacion.values()):
        suyas = [puntos[pid] for pid, m in asignacion.items() if m == muni]
        finales[muni] = (statistics.median(p[0] for p in suyas),
                         statistics.median(p[1] for p in suyas))

    grupos = {}
    for pid in puntos:
        grupos.setdefault(clave_nombre(paradas[pid]["nombre"]), []).append(pid)
    for miembros in grupos.values():
        if len(miembros) < 2:
            continue
        if len({asignacion[pid] for pid in miembros}) == 1:
            continue
        medio = (statistics.mean(puntos[pid][0] for pid in miembros),
                 statistics.mean(puntos[pid][1] for pid in miembros))
        if max(haversine(medio, puntos[pid]) for pid in miembros) > MAX_SEPARACION_KM:
            continue  # mismo nombre pero sitios distintos de verdad
        ganador = min(finales, key=lambda m: haversine(medio, finales[m]))
        for pid in miembros:
            if pid not in anclas:
                asignacion[pid] = ganador

    # Las paradas sin coordenadas (ctas.es no las publica para todas) se
    # resuelven por su sitio en el recorrido: se mira qué municipio tienen
    # las paradas contiguas en cada variante que pasa por ellas y gana la
    # más votada.
    for linea in data["lineas"]:
        for variante in linea.get("variantes", []):
            ruta = variante.get("paradas", [])
            for i, pid in enumerate(ruta):
                if pid in asignacion or pid not in paradas:
                    continue
                voto = Counter()
                for j in (i - 2, i - 1, i + 1, i + 2):
                    if 0 <= j < len(ruta):
                        vecino = asignacion.get(ruta[j])
                        if vecino:
                            voto[vecino] += 2 if abs(j - i) == 1 else 1
                if voto:
                    asignacion[pid] = voto.most_common(1)[0][0]

    for pid, p in paradas.items():
        p["municipio"] = asignacion.get(pid) or None

    # La lista de municipios del fichero pasa a ser la de los que de
    # verdad tienen paradas, para que la app no ofrezca filtros vacíos.
    con_paradas = sorted({m for m in asignacion.values() if m},
                         key=lambda s: s.lower())
    data["municipios"] = con_paradas

    with open(FICHERO, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))

    reparto = Counter(asignacion.values())
    print(f"{len(asignacion)} paradas asignadas a {len(reparto)} municipios")
    for muni, n in reparto.most_common():
        print(f"  {n:5d}  {muni}")
    sin = [pid for pid in paradas if not paradas[pid].get("municipio")]
    if sin:
        print(f"AVISO: {len(sin)} paradas sin coordenadas y por tanto sin municipio", file=sys.stderr)


if __name__ == "__main__":
    main()
