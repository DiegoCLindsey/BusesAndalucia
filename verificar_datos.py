#!/usr/bin/env python3
"""Comprobaciones sobre los datos generados, para no publicar algo roto.

No mira la sintaxis del JSON —eso ya lo garantiza json.dump— sino que lo
que hay dentro tenga sentido: que ningún viaje retroceda en el tiempo, que
las paradas de un bloque existan, que cada consorcio quepa en el
presupuesto y que el calendario no se haya quedado sin días.
"""

import json, os, sys

PRESUPUESTO_KB = 2560       # por área, lo que se baja al abrir una parada de allí
PRESUPUESTO_CATALOGO_KB = 768   # esto se baja SIEMPRE, así que se vigila más
fallos = []


def comprobar(condicion, mensaje):
    if not condicion:
        fallos.append(mensaje)


indice = json.load(open("data/consorcios.json", encoding="utf-8"))
comprobar(len(indice["consorcios"]) == 9, "no están los nueve consorcios")
comprobar(bool(indice.get("atribucion")), "falta la atribución de la fuente")

catalogo = json.load(open("data/catalogo.json", encoding="utf-8"))
kb_cat = os.path.getsize("data/catalogo.json") / 1024
comprobar(kb_cat <= PRESUPUESTO_CATALOGO_KB,
          f"[catálogo] ocupa {kb_cat:.0f} KB, más de {PRESUPUESTO_CATALOGO_KB}")
comprobar(catalogo["generado"] == indice["generado"],
          "[catálogo] la fecha de generación no cuadra con el índice")

# Los identificadores tienen que ser únicos en toda Andalucía: si se
# repitiesen, una parada de Málaga enseñaría los horarios de otra de Sevilla.
por_area = {}
for pid in catalogo["paradas"]:
    comprobar("_" in pid, f"[catálogo] la parada {pid} no lleva prefijo de área")
    por_area.setdefault(int(pid.split("_", 1)[0]), set()).add(pid)
comprobar(len(por_area) == 9, "[catálogo] no hay paradas de las nueve áreas")

slugs = [l["slug"] for l in catalogo["lineas"]]
comprobar(len(slugs) == len(set(slugs)), "[catálogo] hay líneas con el mismo slug")
comprobar(all(l.get("idc") for l in catalogo["lineas"]),
          "[catálogo] alguna línea no dice de qué área es")

for c in indice["consorcios"]:
    idc = c["id"]
    rutas = json.load(open(f"data/{idc}/horarios.json", encoding="utf-8"))
    etiqueta = f"[{idc} {c['nombre']}]"

    kb = os.path.getsize(f"data/{idc}/horarios.json") / 1024
    comprobar(kb <= PRESUPUESTO_KB, f"{etiqueta} ocupa {kb:.0f} KB, más de {PRESUPUESTO_KB}")
    comprobar(rutas["generado"] == indice["generado"],
              f"{etiqueta} las fechas de generación no cuadran")

    paradas = {pid: catalogo["paradas"][pid] for pid in por_area.get(idc, ())}
    lineas = {"lineas": [l for l in catalogo["lineas"] if l["idc"] == idc]}
    comprobar(len(paradas) > 0, f"{etiqueta} sin paradas")
    sin_muni = sum(1 for p in paradas.values() if not p[4])
    comprobar(sin_muni <= len(paradas) * 0.05,
              f"{etiqueta} {sin_muni} de {len(paradas)} paradas sin municipio")

    servicios = rutas["calendario"]["servicios"]
    comprobar(len(servicios) > 0, f"{etiqueta} calendario vacío")

    # El grafo a pie: sin él el buscador no puede cambiar de autobús andando.
    vecinos = rutas.get("vecinos") or {}
    comprobar(len(vecinos) >= len(paradas) * 0.4,
              f"{etiqueta} sólo {len(vecinos)} de {len(paradas)} paradas tienen vecinos a pie")
    comprobar(all(pid in catalogo["paradas"] for pid in vecinos),
              f"{etiqueta} el grafo a pie nombra paradas que no existen")

    huerfanas = retrocesos = sin_servicio = 0
    for b in rutas["bloques"]:
        comprobar(len(b["p"]) >= 2, f"{etiqueta} bloque con menos de dos paradas")
        huerfanas += sum(1 for pid in b["p"] if pid not in paradas)
        sin_servicio += sum(1 for sid in b["s"] if sid not in servicios)
        comprobar(len(b["v"]) == len(b["s"]),
                  f"{etiqueta} un bloque tiene {len(b['v'])} viajes y {len(b['s'])} servicios")
        for viaje in b["v"]:
            comprobar(len(viaje) == len(b["p"]),
                      f"{etiqueta} un viaje no tiene una hora por parada")
            if any(viaje[i + 1] < viaje[i] for i in range(len(viaje) - 1)):
                retrocesos += 1
    comprobar(huerfanas == 0, f"{etiqueta} {huerfanas} paradas de bloque que no existen")
    comprobar(retrocesos == 0, f"{etiqueta} {retrocesos} viajes cuyas horas retroceden")
    comprobar(sin_servicio == 0, f"{etiqueta} {sin_servicio} viajes con un servicio desconocido")

    print(f"  {etiqueta} {len(paradas)} paradas · {len(lineas['lineas'])} líneas · "
          f"{len(rutas['bloques'])} bloques · {len(vecinos)} a pie · {kb:.0f} KB")

if fallos:
    print("\nDATOS NO PUBLICABLES:", file=sys.stderr)
    for f in fallos:
        print("  · " + f, file=sys.stderr)
    sys.exit(1)
print("\nTodo correcto.")
