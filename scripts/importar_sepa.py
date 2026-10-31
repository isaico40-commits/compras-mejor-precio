"""Importa precios de Precios Claros (SEPA) de los súpers de Mar del Plata a Supabase.

Descarga el ZIP del día publicado en datos.produccion.gob.ar, filtra las sucursales
de Mar del Plata / General Pueyrredón, se queda con el precio más bajo de cada
producto por cadena (bandera) y lo carga con la función `sepa_cargar`.

Uso:
  python scripts/importar_sepa.py                 # descarga y carga
  python scripts/importar_sepa.py --zip x.zip     # usa un ZIP local
  python scripts/importar_sepa.py --dry-run       # no escribe en Supabase

Variables de entorno: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import io
import json
import os
import re
import sys
import tempfile
import unicodedata
import urllib.request
import zipfile

DATASET_URL = "https://datos.produccion.gob.ar/dataset/sepa-precios"
DIAS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"]
LOTE = 1000
UA = {"User-Agent": "Mozilla/5.0 (compras-mejor-precio importador)"}

csv.field_size_limit(10_000_000)


def norm(s: str | None) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", s).strip().lower()


def es_mar_del_plata(suc: dict) -> bool:
    loc = norm(suc.get("sucursales_localidad"))
    if "mar del plata" in loc or "pueyrredon" in loc or loc == "batan":
        return True
    cp = re.sub(r"\D", "", suc.get("sucursales_codigo_postal") or "")
    prov = norm(suc.get("sucursales_provincia"))
    return cp[:4] in {f"76{n:02d}" for n in range(0, 13)} and prov in {"ar-b", "buenos aires", "b", ""}


def num(v: str | None) -> float | None:
    try:
        x = float((v or "").replace(",", "."))
        return x if x > 0 else None
    except ValueError:
        return None


def http_get(url: str) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
        return r.read()


def url_del_dia(fecha: dt.date) -> str:
    html = http_get(DATASET_URL).decode("utf-8", "ignore")
    links = set(re.findall(r'https?://[^"\']+/download/sepa_[a-z]+\.zip', html))
    dia = DIAS[fecha.weekday()]
    for link in links:
        if link.endswith(f"sepa_{dia}.zip"):
            return link
    raise SystemExit(f"No encontré el ZIP de {dia} en {DATASET_URL} (links: {sorted(links)})")


def descargar(url: str, destino: str) -> None:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=600) as r, open(destino, "wb") as f:
        while chunk := r.read(1 << 20):
            f.write(chunk)


def leer_csv(zf: zipfile.ZipFile, nombre: str):
    """Itera filas de un CSV de SEPA (separador | o , con encabezado)."""
    with zf.open(nombre) as raw:
        texto = io.TextIOWrapper(raw, encoding="utf-8-sig", errors="replace", newline="")
        encabezado = texto.readline()
        sep = "|" if encabezado.count("|") >= encabezado.count(",") else ","
        campos = [c.strip().strip('"') for c in next(csv.reader([encabezado], delimiter=sep))]
        for fila in csv.reader(texto, delimiter=sep):
            if len(fila) < len(campos) - 4 or not fila[0] or fila[0].startswith("Últ"):
                continue
            yield dict(zip(campos, (c.strip() for c in fila)))


def zips_de_comercios(ruta: str):
    """Devuelve cada ZIP con comercio/sucursales/productos (soporta ZIPs anidados)."""
    externo = zipfile.ZipFile(ruta)
    nombres = externo.namelist()
    if any(n.endswith("productos.csv") for n in nombres) and not any(n.endswith(".zip") for n in nombres):
        yield externo
        return
    for n in nombres:
        if n.endswith(".zip"):
            try:
                yield zipfile.ZipFile(io.BytesIO(externo.read(n)))
            except zipfile.BadZipFile:
                print(f"  ZIP interno dañado: {n}", file=sys.stderr)


def buscar(zf: zipfile.ZipFile, archivo: str) -> str | None:
    return next((n for n in zf.namelist() if n.lower().endswith(archivo)), None)


def procesar(ruta: str) -> list[dict]:
    mejores: dict[tuple, dict] = {}
    for zf in zips_de_comercios(ruta):
        f_com, f_suc, f_prod = buscar(zf, "comercio.csv"), buscar(zf, "sucursales.csv"), buscar(zf, "productos.csv")
        if not (f_com and f_suc and f_prod):
            continue
        banderas = {(c["id_comercio"], c["id_bandera"]): c.get("comercio_bandera_nombre") or c.get("comercio_razon_social")
                    for c in leer_csv(zf, f_com)}
        sucursales = {(s["id_comercio"], s["id_bandera"], s["id_sucursal"])
                      for s in leer_csv(zf, f_suc) if es_mar_del_plata(s)}
        if not sucursales:
            continue
        print(f"  {', '.join(sorted({banderas.get(k[:2], k[0]) for k in sucursales}))}: {len(sucursales)} sucursales en MdP")
        for p in leer_csv(zf, f_prod):
            if (p["id_comercio"], p["id_bandera"], p["id_sucursal"]) not in sucursales:
                continue
            ean = re.sub(r"\D", "", p.get("productos_ean") or "")
            precio = num(p.get("productos_precio_lista"))
            if len(ean) < 8 or not precio:
                continue
            promos = [(num(p.get(f"productos_precio_unitario_promo{i}")), p.get(f"productos_leyenda_promo{i}") or None) for i in (1, 2)]
            promos = [x for x in promos if x[0] and x[0] < precio]
            promo, leyenda = min(promos) if promos else (None, None)
            clave = (p["id_comercio"], p["id_bandera"], ean)
            actual = mejores.get(clave)
            efectivo = promo or precio
            if actual and (actual["promo"] or actual["precio"]) <= efectivo:
                continue
            mejores[clave] = {
                "comercio": p["id_comercio"], "bandera": p["id_bandera"],
                "bandera_nombre": banderas.get((p["id_comercio"], p["id_bandera"])) or f"Comercio {p['id_comercio']}",
                "ean": ean, "descripcion": p.get("productos_descripcion") or ean,
                "marca": p.get("productos_marca") or None,
                "cantidad": num(p.get("productos_cantidad_presentacion")),
                "unidad": (p.get("productos_unidad_medida_presentacion") or "").lower() or None,
                "precio": round(precio, 2), "promo": round(promo, 2) if promo else None, "leyenda": leyenda,
            }
    return list(mejores.values())


def cargar(filas: list[dict], fecha: dt.date) -> None:
    url = os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1/rpc/sepa_cargar"
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    total = 0
    for i in range(0, len(filas), LOTE):
        body = json.dumps({"p_fecha": fecha.isoformat(), "p_rows": filas[i:i + LOTE]}).encode()
        with urllib.request.urlopen(urllib.request.Request(url, body, headers, method="POST"), timeout=120) as r:
            total += int(r.read() or 0)
        print(f"  lote {i // LOTE + 1}/{-(-len(filas) // LOTE)}", flush=True)
    print(f"Listo: {len(filas)} precios procesados, {total} nuevos o cambiados.")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--zip", help="ZIP local en vez de descargar")
    ap.add_argument("--fecha", help="Fecha de los precios (AAAA-MM-DD). Default: hoy en Argentina")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    hoy_ar = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3)).date()
    fecha = dt.date.fromisoformat(a.fecha) if a.fecha else hoy_ar

    ruta = a.zip
    if not ruta:
        url = url_del_dia(fecha)
        ruta = os.path.join(tempfile.mkdtemp(), "sepa.zip")
        print(f"Descargando {url}", flush=True)
        descargar(url, ruta)

    filas = procesar(ruta)
    print(f"{len(filas)} productos con precio en Mar del Plata")
    if not filas:
        raise SystemExit("No encontré precios de Mar del Plata: revisar el formato del ZIP")
    if a.dry_run:
        print(json.dumps(filas[:3], ensure_ascii=False, indent=2))
        return
    cargar(filas, fecha)


if __name__ == "__main__":
    main()
