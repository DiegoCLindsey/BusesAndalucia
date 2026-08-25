#!/usr/bin/env python3
"""Comprobaciones sobre los datos generados, para no publicar algo roto.

No mira la sintaxis del JSON —eso ya lo garantiza json.dump— sino que lo
que hay dentro tenga sentido: que ningún viaje retroceda en el tiempo, que
las paradas de un bloque existan, que cada consorcio quepa en el
presupuesto y que el calendario no se haya quedado sin días.
"""

import json, os, sys

PRESUPUESTO_KB = 2560
fallos = []


def comprobar(condicion, mensaje):
    if not condicion:
        fallos.append(mensaje)


indice = json.load(open("data/consorcios.json", encoding="utf-8"))
comprobar(len(indice["consorcios"]) == 9, "no están los nueve consorcios")
comprobar(bool(indice.get("atribucion")), "falta la atribución de la fuente")

for c in indice["consorcios"]:
    idc = c["id"]
    lineas = json.load(open(f"data/{idc}/lineas.json", encoding="utf-8"))
    rutas = json.load(open(f"data/{idc}/rutas.json", encoding="utf-8"))
    etiqueta = f"[{idc} {c['nombre']}]"

    kb = sum(os.path.getsize(f"data/{idc}/{f}") for f in ("lineas.json", "rutas.json")) / 1024
    comprobar(kb <= PRESUPUESTO_KB, f"{etiqueta} ocupa {kb:.0f} KB, más de {PRESUPUESTO_KB}")
    comprobar(lineas["generado"] == rutas["generado"] == indice["generado"],
              f"{etiqueta} las fechas de generación no cuadran")

    paradas = lineas["paradas"]
    comprobar(len(paradas) > 0, f"{etiqueta} sin paradas")
    sin_muni = sum(1 for p in paradas.values() if not p[4])
    comprobar(sin_muni <= len(paradas) * 0.05,
              f"{etiqueta} {sin_muni} de {len(paradas)} paradas sin municipio")

    servicios = lineas["calendario"]["servicios"]
    comprobar(len(servicios) > 0, f"{etiqueta} calendario vacío")

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
          f"{len(rutas['bloques'])} bloques · {kb:.0f} KB")

if fallos:
    print("\nDATOS NO PUBLICABLES:", file=sys.stderr)
    for f in fallos:
        print("  · " + f, file=sys.stderr)
    sys.exit(1)
print("\nTodo correcto.")
