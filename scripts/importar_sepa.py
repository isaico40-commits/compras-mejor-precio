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


def links_por_dia() -> dict[str, str]:
    html = http_get(DATASET_URL).decode("utf-8", "ignore")
    links = set(re.findall(r'https?://[^"\']+/download/sepa_[a-z]+\.zip', html))
    return {re.search(r"sepa_([a-z]+)\.zip$", l).group(1): l for l in links}


def fecha_del_zip(ruta: str) -> dt.date | None:
    """Los ZIPs internos se llaman ...AAAA-MM-DD_hh-mm-ss.zip: esa es la fecha real de los precios."""
    fechas = re.findall(r"(\d{4}-\d{2}-\d{2})", " ".join(zipfile.ZipFile(ruta).namelist()))
    return dt.date.fromisoformat(max(fechas)) if fechas else None


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
            except zipfile.BadZipFile as e:
                print(f"  ZIP interno dañado: {n} ({e})", flush=True)


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
        print(f"  {', '.join(sorted({banderas.get(k[:2], k[0]) for k in sucursales}))}: {len(sucursales)} sucursales en MdP", flush=True)
        vistos = 0
        for p in leer_csv(zf, f_prod):
            if (p.get("id_comercio"), p.get("id_bandera"), p.get("id_sucursal")) not in sucursales:
                continue
            # En SEPA "productos_ean" suele ser un indicador (1/0) y el código de barras está en id_producto
            ean = re.sub(r"\D", "", p.get("productos_ean") or "")
            if not 8 <= len(ean) <= 14:
                ean = re.sub(r"\D", "", p.get("id_producto") or "")
            vistos += 1
            precio = num(p.get("productos_precio_lista"))
            if not 8 <= len(ean) <= 14 or not precio:
                if vistos <= 2:
                    print(f"    fila descartada (ejemplo): {p}", flush=True)
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
        print(f"    {vistos} filas de precios en MdP, acumulado {len(mejores)} productos por cadena", flush=True)
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
        # Cada día de la semana tiene su archivo y se pisa una vez por semana:
        # busco el más reciente probando hoy, ayer y anteayer.
        links = links_por_dia()
        mejor: tuple[dt.date, str] | None = None
        for atras in range(3):
            d = fecha - dt.timedelta(days=atras)
            url = links.get(DIAS[d.weekday()])
            if not url:
                continue
            destino = os.path.join(tempfile.mkdtemp(), "sepa.zip")
            print(f"Descargando {url}", flush=True)
            descargar(url, destino)
            f_zip = fecha_del_zip(destino) or d
            print(f"  precios del {f_zip}", flush=True)
            if not mejor or f_zip > mejor[0]:
                mejor = (f_zip, destino)
            if f_zip >= d:
                break
        if not mejor:
            raise SystemExit(f"No encontré archivos en {DATASET_URL}")
        fecha, ruta = mejor
    elif not a.fecha:
        fecha = fecha_del_zip(ruta) or fecha
    print(f"Fecha de los precios: {fecha}", flush=True)

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
