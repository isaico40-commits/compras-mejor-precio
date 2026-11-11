"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { escanear, precioGondola, productoNuevoEan, terminarEscaneo, type Escaneo } from "@/app/actions";
import { pesos } from "@/lib/formato";
import type { PromoHoy } from "@/components/Changuito";

type Item = {
  ean: string; productoId: string; nombre: string; precio: number; cantidad: number;
  mejor: { super: string; precio: number } | null;
};
type Pendiente =
  | { tipo: "precio"; ean: string; r: NonNullable<Escaneo> }   // producto conocido, falta el precio acá
  | { tipo: "nuevo"; ean: string };                              // código que no está en la base

// BarcodeDetector todavía no está en los tipos de TypeScript
type Detector = { detect: (s: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type DetectorCtor = new (o: { formats: string[] }) => Detector;

const SOBREPRECIO = 1.05; // más de 5% arriba del más barato

/** Carrito virtual: escaneás el código de barras, ves cuánto llevás y si estás pagando de más. */
export function Escaner({ superId, nombreSuper, promo }: { superId: string; nombreSuper: string; promo: PromoHoy | null }) {
  const claveLS = `escaner:${superId}:${new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)}`;
  const [items, setItems] = useState<Item[]>([]);
  const [camara, setCamara] = useState(false);
  const [soportado, setSoportado] = useState(true);
  const [pend, setPend] = useState<Pendiente | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [manual, setManual] = useState("");
  const [fin, setFin] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const ultimo = useRef<{ ean: string; t: number }>({ ean: "", t: 0 });
  const pausa = useRef(false);

  useEffect(() => {
    try { const g = localStorage.getItem(claveLS); if (g) setItems(JSON.parse(g)); } catch {}
    setSoportado(typeof window !== "undefined" && "BarcodeDetector" in window);
  }, [claveLS]);
  const guardar = (xs: Item[]) => { setItems(xs); try { localStorage.setItem(claveLS, JSON.stringify(xs)); } catch {} };

  const agregar = useCallback((ean: string, r: NonNullable<Escaneo>, precio: number) => {
    const mejor = r.otros[0] ? { super: r.otros[0].super, precio: Number(r.otros[0].precio) } : null;
    setItems((prev) => {
      const i = prev.findIndex((x) => x.productoId === r.producto.id);
      const xs = i >= 0
        ? prev.map((x, j) => (j === i ? { ...x, cantidad: x.cantidad + 1, precio } : x))
        : [{ ean, productoId: r.producto.id, nombre: r.producto.nombre, precio, cantidad: 1, mejor }, ...prev];
      try { localStorage.setItem(claveLS, JSON.stringify(xs)); } catch {}
      return xs;
    });
    if (navigator.vibrate) navigator.vibrate(60);
  }, [claveLS]);

  const procesar = useCallback(async (ean: string) => {
    ean = ean.replace(/\D/g, "");
    if (ean.length < 7) return;
    pausa.current = true; setOcupado(true); setMsg(null);
    try {
      const r = await escanear(ean, superId);
      if (!r) setPend({ tipo: "nuevo", ean });
      else if (r.aca?.precio) agregar(ean, r, Number(r.aca.precio));
      else setPend({ tipo: "precio", ean, r });
    } catch (e) {
      setMsg(`No pude buscar el código: ${(e as Error).message}`);
    } finally {
      setOcupado(false);
      pausa.current = false;
    }
  }, [superId, agregar]);

  // Cámara + lector de códigos del navegador (Chrome en Android)
  useEffect(() => {
    if (!camara) return;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let vivo = true;
    (async () => {
      try {
        const Ctor = (window as unknown as { BarcodeDetector: DetectorCtor }).BarcodeDetector;
        const det = new Ctor({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (!vivo || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        timer = setInterval(async () => {
          if (pausa.current || !video.current || video.current.readyState < 2) return;
          const cods = await det.detect(video.current).catch(() => []);
          const ean = cods[0]?.rawValue;
          if (!ean) return;
          const ahora = Date.now();
          if (ean === ultimo.current.ean && ahora - ultimo.current.t < 2500) return; // mismo código seguido
          ultimo.current = { ean, t: ahora };
          procesar(ean);
        }, 300);
      } catch (e) {
        setMsg(`No pude abrir la cámara: ${(e as Error).message}`);
        setCamara(false);
      }
    })();
    return () => { vivo = false; if (timer) clearInterval(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, [camara, procesar]);

  // Totales
  const total = items.reduce((t, x) => t + x.precio * x.cantidad, 0);
  const caros = items.filter((x) => x.mejor && x.precio > x.mejor.precio * SOBREPRECIO);
  const deMas = caros.reduce((t, x) => t + (x.precio - x.mejor!.precio) * x.cantidad, 0);
  const descHoy = promo && (!promo.minimo || total >= promo.minimo) ? Math.min((total * promo.porcentaje) / 100, promo.tope ?? Infinity) : 0;

  const cambiarCant = (i: number, d: number) => guardar(items.flatMap((x, j) => (j !== i ? [x] : x.cantidad + d <= 0 ? [] : [{ ...x, cantidad: x.cantidad + d }])));
  const cambiarPrecio = async (i: number) => {
    const v = Number(prompt(`Precio de ${items[i].nombre} en ${nombreSuper}`, String(items[i].precio))?.replace(",", "."));
    if (!(v > 0)) return;
    guardar(items.map((x, j) => (j === i ? { ...x, precio: v } : x)));
    precioGondola(items[i].productoId, superId, v).catch(() => {});
  };

  async function terminar() {
    if (!confirm(`¿Terminar la compra? ${items.length} productos, ${pesos(total - descHoy)}.`)) return;
    setOcupado(true);
    try {
      const r = await terminarEscaneo(superId, items.map((x) => ({ productoId: x.productoId, nombre: x.nombre, precio: x.precio, cantidad: x.cantidad })));
      guardar([]);
      try { localStorage.removeItem(claveLS); } catch {}
      setFin(`Listo, quedó en Gastos.${r.tachados ? ` Taché ${r.tachados} de tu lista.` : ""}`);
    } catch (e) {
      setMsg(`No pude guardar la compra: ${(e as Error).message}`);
    } finally { setOcupado(false); }
  }

  return (
    <div className="space-y-4 px-4 pb-28">
      {/* Resumen */}
      <section className="rounded-2xl bg-menta p-4">
        <p className="text-[15px] font-bold text-menta-tinta">Llevás</p>
        <p className="num text-[30px] font-bold leading-none">{pesos(total)}</p>
        {descHoy > 0 && <p className="mt-1 text-sm">Con {promo!.porcentaje}% {promo!.medio}: <b className="num">{pesos(total - descHoy)}</b></p>}
        <p className="mt-2 text-sm text-suave">{items.reduce((t, x) => t + x.cantidad, 0)} productos</p>
        {deMas > 0 ? (
          <p className="mt-2 rounded-xl bg-durazno px-3 py-2 text-sm text-durazno-tinta">
            Estás pagando <b className="num">{pesos(deMas)}</b> de más en {caros.length} producto{caros.length === 1 ? "" : "s"} comparado con otros súpers.
          </p>
        ) : items.length > 0 ? (
          <p className="mt-2 rounded-xl bg-tarjeta px-3 py-2 text-sm">Nada de lo que llevás está más de 5% arriba que en otro súper.</p>
        ) : null}
      </section>

      {fin && <p className="rounded-xl bg-menta px-3 py-2 text-sm font-semibold text-menta-tinta">{fin}</p>}

      {/* Cámara */}
      {soportado ? (
        camara ? (
          <div className="relative overflow-hidden rounded-2xl bg-black">
            <video ref={video} playsInline muted className="aspect-[4/3] w-full object-cover" />
            <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80" />
            <button onClick={() => setCamara(false)} className="absolute right-2 top-2 rounded-full bg-black/60 px-3 py-1 text-sm font-semibold text-white">Cerrar</button>
            {ocupado && <p className="absolute inset-x-0 bottom-2 text-center text-sm font-semibold text-white">Buscando…</p>}
          </div>
        ) : (
          <button onClick={() => { setFin(null); setCamara(true); }} className="w-full rounded-2xl bg-tinta py-4 text-[17px] font-bold text-white active:opacity-80">📷 Escanear código</button>
        )
      ) : (
        <p className="rounded-xl bg-limon px-3 py-2 text-sm text-limon-tinta">Este navegador no puede leer códigos con la cámara (en Android usá Chrome). Podés escribir el número de abajo del código de barras.</p>
      )}

      <form onSubmit={(e) => { e.preventDefault(); if (manual) { procesar(manual); setManual(""); } }} className="flex gap-2">
        <input value={manual} onChange={(e) => setManual(e.target.value)} inputMode="numeric" placeholder="O escribí el código (779…)" className="min-w-0 flex-1 rounded-xl border border-linea bg-tarjeta px-3 py-2.5 text-[15px]" />
        <button disabled={ocupado} className="rounded-xl bg-tarjeta px-4 font-semibold ring-1 ring-linea disabled:opacity-50">Buscar</button>
      </form>

      {msg && <p className="rounded-xl bg-alerta-suave p-3 text-sm text-alerta">{msg}</p>}

      {/* Falta un dato: precio acá o producto nuevo */}
      {pend && (
        <form
          className="space-y-2 rounded-2xl bg-lila p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const precio = Number(String(f.get("precio") ?? "").replace(",", "."));
            setOcupado(true);
            try {
              if (pend.tipo === "precio") {
                if (!(precio > 0)) return;
                await precioGondola(pend.r.producto.id, superId, precio);
                agregar(pend.ean, pend.r, precio);
              } else {
                const r = await productoNuevoEan(pend.ean, String(f.get("nombre") ?? ""), superId, precio > 0 ? precio : null);
                if (r && precio > 0) agregar(pend.ean, r, precio);
              }
              setPend(null);
            } catch (err) { setMsg((err as Error).message); } finally { setOcupado(false); }
          }}
        >
          {pend.tipo === "precio" ? (
            <>
              <p className="text-[15px] font-bold text-lila-tinta">{pend.r.producto.nombre}</p>
              <p className="text-sm text-suave">
                No tengo precio de {nombreSuper}. ¿Cuánto dice la góndola?
                {pend.r.otros[0] && <> En {pend.r.otros[0].super} sale <b className="num">{pesos(Number(pend.r.otros[0].precio))}</b>.</>}
              </p>
            </>
          ) : (
            <>
              <p className="text-[15px] font-bold text-lila-tinta">Código nuevo: {pend.ean}</p>
              <p className="text-sm text-suave">No lo tengo. Cargalo una vez y la próxima lo reconozco.</p>
              <input name="nombre" required placeholder="Nombre (ej. Yerba Playadito 1 kg)" className="w-full rounded-xl border border-linea bg-tarjeta px-3 py-2.5 text-[15px]" />
            </>
          )}
          <input name="precio" inputMode="decimal" required={pend.tipo === "precio"} placeholder="Precio $" className="w-full rounded-xl border border-linea bg-tarjeta px-3 py-2.5 text-[15px]" autoFocus />
          <div className="flex gap-2">
            <button disabled={ocupado} className="flex-1 rounded-xl bg-tinta py-2.5 font-semibold text-white disabled:opacity-50">Agregar al carrito</button>
            <button type="button" onClick={() => setPend(null)} className="rounded-xl px-4 font-semibold text-suave">Cancelar</button>
          </div>
        </form>
      )}

      {/* Carrito */}
      {items.length > 0 && (
        <ul className="divide-y divide-linea overflow-hidden rounded-2xl border border-linea bg-tarjeta">
          {items.map((x, i) => {
            const caro = x.mejor && x.precio > x.mejor.precio * SOBREPRECIO;
            const pct = x.mejor ? Math.round((x.precio / x.mejor.precio - 1) * 100) : 0;
            return (
              <li key={x.productoId} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 text-[15px] font-medium">{x.nombre}</p>
                  <button onClick={() => cambiarPrecio(i)} className="num shrink-0 font-semibold underline decoration-dotted">{pesos(x.precio * x.cantidad)}</button>
                </div>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <p className={`text-sm ${caro ? "font-semibold text-durazno-tinta" : "text-suave"}`}>
                    {!x.mejor ? "Sin precio de otros súpers para comparar"
                      : caro ? `⚠️ ${pct}% más caro: en ${x.mejor.super} sale ${pesos(x.mejor.precio)}`
                      : x.precio < x.mejor.precio ? `✅ Más barato que en ${x.mejor.super} (${pesos(x.mejor.precio)})`
                      : `✅ Precio parecido a ${x.mejor.super} (${pesos(x.mejor.precio)})`}
                  </p>
                  <span className="flex shrink-0 items-center gap-1">
                    <button onClick={() => cambiarCant(i, -1)} className="h-8 w-8 rounded-full bg-fondo font-bold">−</button>
                    <span className="num w-6 text-center">{x.cantidad}</span>
                    <button onClick={() => cambiarCant(i, 1)} className="h-8 w-8 rounded-full bg-fondo font-bold">+</button>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {items.length > 0 && (
        <button onClick={terminar} disabled={ocupado} className="w-full rounded-2xl bg-marca py-3.5 text-[16px] font-bold text-white disabled:opacity-50">Terminar compra</button>
      )}
      <p className="px-1 text-sm text-suave">Tocá el precio de un producto para corregirlo. El precio de la góndola queda guardado para {nombreSuper}.</p>
    </div>
  );
}
