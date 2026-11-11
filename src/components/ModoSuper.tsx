"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { escanear, precioGondola, productoNuevoEan, terminarCompra, terminarEscaneo, type Escaneo } from "@/app/actions";

export type PromoHoy = { porcentaje: number; tope: number | null; minimo: number | null; medio: string };

/** Ítem de la lista para este súper */
export type FilaLista = {
  key: string; origen: "mio" | "setto"; itemId: string; titulo: string; termino: string; productoId: string | null;
  precio: number | null;       // unitario acá
  cantidad: number; urgente: boolean; detalle: string | null; anotado: boolean;
  conviene: boolean;           // acá está al mejor precio (o lo anotaste para acá)
  otroLado: string | null;     // "Toledo: $2.699 · $8.178/kg"
  deMas: number;               // cuánto pagás de más por comprarlo acá (total)
};

/** Lo que está en el carrito: de la lista (tocado o escaneado) o escaneado suelto */
type EnCarro = {
  id: string; rowKey: string | null; productoId: string | null; nombre: string;
  precio: number | null; cantidad: number; deMas: number; aviso: string | null; escaneado: boolean;
};

type Pendiente =
  | { tipo: "precio"; ean: string; r: NonNullable<Escaneo> }
  | { tipo: "nuevo"; ean: string };

type Detector = { detect: (s: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type DetectorCtor = new (o: { formats: string[] }) => Detector;

const SOBREPRECIO = 1.05;
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");

/** Modo súper: lista y carrito en una sola pantalla, con escáner de códigos. */
export function ModoSuper({ superId, nombreSuper, promo, filas }: { superId: string; nombreSuper: string; promo: PromoHoy | null; filas: FilaLista[] }) {
  const router = useRouter();
  const hoy = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const claveLS = `super:${superId}:${hoy}`;
  const [carro, setCarro] = useState<EnCarro[]>([]);
  const [camara, setCamara] = useState(false);
  const [soportado, setSoportado] = useState(true);
  const [pend, setPend] = useState<Pendiente | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [manual, setManual] = useState("");
  const [fin, setFin] = useState<string | null>(null);
  const [verOtroLado, setVerOtroLado] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const ultimo = useRef<{ ean: string; t: number }>({ ean: "", t: 0 });
  const pausa = useRef(false);
  const filasRef = useRef(filas);
  filasRef.current = filas;

  useEffect(() => {
    try { const g = localStorage.getItem(claveLS); if (g) setCarro(JSON.parse(g)); } catch {}
    setSoportado("BarcodeDetector" in window);
  }, [claveLS]);

  const cambiar = useCallback((f: (prev: EnCarro[]) => EnCarro[]) => {
    setCarro((prev) => {
      const xs = f(prev);
      try { localStorage.setItem(claveLS, JSON.stringify(xs)); } catch {}
      return xs;
    });
  }, [claveLS]);

  const enCarro = useMemo(() => new Set(carro.map((c) => c.rowKey).filter(Boolean)), [carro]);
  const porComprar = filas.filter((f) => !enCarro.has(f.key));
  const aca = porComprar.filter((f) => f.conviene);
  const otro = porComprar.filter((f) => !f.conviene);

  // Tocar un ítem de la lista = lo pusiste en el carrito y el precio estaba bien
  const meter = (f: FilaLista) => {
    if (navigator.vibrate) navigator.vibrate(30);
    cambiar((prev) => [{ id: f.key, rowKey: f.key, productoId: f.productoId, nombre: f.titulo, precio: f.precio, cantidad: f.cantidad, deMas: f.deMas, aviso: f.deMas > 0 ? f.otroLado : null, escaneado: false }, ...prev]);
  };
  const sacar = (id: string) => cambiar((prev) => prev.filter((c) => c.id !== id));
  const cant = (id: string, d: number) => cambiar((prev) => prev.flatMap((c) => {
    if (c.id !== id) return [c];
    const n = c.cantidad + d;
    if (n <= 0) return [];
    return [{ ...c, cantidad: n, deMas: c.cantidad ? (c.deMas / c.cantidad) * n : 0 }];
  }));

  // Escaneado: si está en la lista, lo tacha de ahí con el precio real
  const agregarEscaneado = useCallback((r: NonNullable<Escaneo>, precio: number) => {
    const mejor = r.otros[0] ? { super: r.otros[0].super, precio: Number(r.otros[0].precio) } : null;
    const caro = mejor && precio > mejor.precio * SOBREPRECIO;
    const aviso = caro ? `${Math.round((precio / mejor!.precio - 1) * 100)}% más caro: en ${mejor!.super} sale ${fmt(mejor!.precio)}`
      : mejor ? `Bien de precio (${mejor.super}: ${fmt(mejor.precio)})` : null;
    const fila = filasRef.current.find((f) => f.productoId === r.producto.id);
    if (navigator.vibrate) navigator.vibrate(60);
    cambiar((prev) => {
      const i = prev.findIndex((c) => c.productoId === r.producto.id);
      if (i >= 0) {
        // Ya estaba (tocado de la lista): el escaneo confirma el precio; si ya estaba escaneado, suma uno
        const n = prev[i].escaneado ? prev[i].cantidad + 1 : prev[i].cantidad;
        return prev.map((c, j) => (j !== i ? c : { ...c, precio, cantidad: n, escaneado: true, aviso, deMas: caro ? (precio - mejor!.precio) * n : 0 }));
      }
      const yaEnCarro = fila && prev.some((c) => c.rowKey === fila.key);
      return [{
        id: fila && !yaEnCarro ? fila.key : `scan-${r.producto.id}`, rowKey: fila && !yaEnCarro ? fila.key : null,
        productoId: r.producto.id, nombre: fila?.titulo ?? r.producto.nombre, precio, cantidad: 1,
        deMas: caro ? precio - mejor!.precio : 0, aviso, escaneado: true,
      }, ...prev];
    });
  }, [cambiar]);

  const procesar = useCallback(async (ean: string) => {
    ean = ean.replace(/\D/g, "");
    if (ean.length < 7) return;
    pausa.current = true; setOcupado(true); setMsg(null);
    try {
      const r = await escanear(ean, superId);
      if (!r) setPend({ tipo: "nuevo", ean });
      else if (r.aca?.precio) agregarEscaneado(r, Number(r.aca.precio));
      else setPend({ tipo: "precio", ean, r });
    } catch (e) {
      setMsg(`No pude buscar el código: ${(e as Error).message}`);
    } finally { setOcupado(false); pausa.current = false; }
  }, [superId, agregarEscaneado]);

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
          if (ean === ultimo.current.ean && ahora - ultimo.current.t < 2500) return;
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
  const total = carro.reduce((t, c) => t + (c.precio ?? 0) * c.cantidad, 0);
  const sinPrecio = carro.filter((c) => c.precio == null).length;
  const deMas = carro.reduce((t, c) => t + c.deMas, 0);
  const descHoy = promo && (!promo.minimo || total >= promo.minimo) ? Math.min((total * promo.porcentaje) / 100, promo.tope ?? Infinity) : 0;
  const faltan = filas.length - enCarro.size;
  const progreso = filas.length ? Math.round(((filas.length - faltan) / filas.length) * 100) : 0;

  const corregirPrecio = (c: EnCarro) => {
    const v = Number(prompt(`Precio de ${c.nombre} en ${nombreSuper}`, c.precio != null ? String(c.precio) : "")?.replace(",", "."));
    if (!(v > 0)) return;
    cambiar((prev) => prev.map((x) => (x.id === c.id ? { ...x, precio: v } : x)));
    if (c.productoId) precioGondola(c.productoId, superId, v).catch(() => {});
  };

  async function terminar() {
    if (!confirm(`¿Terminar la compra? ${carro.length} productos, ${fmt(total - descHoy)}.`)) return;
    setOcupado(true); setMsg(null);
    try {
      const deLista = carro.filter((c) => c.rowKey).map((c) => ({ c, f: filas.find((f) => f.key === c.rowKey)! })).filter((x) => x.f);
      const sueltos = carro.filter((c) => !c.rowKey && c.productoId && c.precio != null);
      const [r1] = await Promise.all([
        deLista.length ? terminarCompra(superId, deLista.map(({ c, f }) => ({ origen: f.origen, itemId: f.itemId, titulo: f.titulo, termino: f.termino, productoId: c.productoId, precio: c.precio }))) : Promise.resolve(null),
        sueltos.length ? terminarEscaneo(superId, sueltos.map((c) => ({ productoId: c.productoId!, nombre: c.nombre, precio: c.precio!, cantidad: c.cantidad }))) : Promise.resolve(null),
      ]);
      try { localStorage.removeItem(claveLS); } catch {}
      setCarro([]);
      setFin(`Compra guardada: ${fmt(total - descHoy)}. Quedó en Gastos y tachado de tu lista.${r1?.settoError ? ` (Setto: ${r1.settoError})` : ""}`);
      router.refresh();
    } catch (e) {
      setMsg(`No pude guardar la compra: ${(e as Error).message}`);
    } finally { setOcupado(false); }
  }

  const FilaPorComprar = ({ f }: { f: FilaLista }) => (
    <li>
      <button onClick={() => meter(f)} className="flex w-full items-center gap-3 px-3 py-3 text-left active:bg-fondo">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-linea text-lg leading-none text-suave">+</span>
        <span className="min-w-0 flex-1">
          <span className="flex justify-between gap-2">
            <span className="font-semibold leading-snug">
              {f.urgente && <span className="text-alerta">● </span>}
              {f.cantidad > 1 && <span className="num text-suave">{f.cantidad}× </span>}{f.titulo}
              {f.origen === "setto" && <span className="ml-1.5 rounded bg-fondo px-1 text-[10px] font-bold text-suave">S</span>}
            </span>
            <span className="num shrink-0 font-semibold">{f.precio != null ? fmt(f.precio * f.cantidad) : "—"}</span>
          </span>
          {f.detalle && <span className="block truncate text-sm text-suave">{f.detalle}</span>}
          {f.anotado && <span className="mt-0.5 inline-block rounded-full bg-marca-suave px-2 py-0.5 text-[11px] font-semibold text-marca">anotado para acá</span>}
          {!f.conviene && f.otroLado && <span className="block text-sm text-alerta">{f.otroLado}</span>}
        </span>
      </button>
    </li>
  );

  return (
    <div className="space-y-4 px-4">
      {fin && <p className="rounded-2xl bg-menta px-4 py-3 text-sm font-semibold text-menta-tinta">{fin}</p>}

      {/* Escáner */}
      {soportado ? (
        camara ? (
          <div className="relative overflow-hidden rounded-2xl bg-black">
            <video ref={video} playsInline muted className="aspect-[16/9] w-full object-cover" />
            <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80" />
            <button onClick={() => setCamara(false)} className="absolute right-2 top-2 rounded-full bg-black/60 px-3 py-1 text-sm font-semibold text-white">Cerrar cámara</button>
            {ocupado && <p className="absolute inset-x-0 bottom-2 text-center text-sm font-semibold text-white">Buscando…</p>}
          </div>
        ) : (
          <button onClick={() => { setFin(null); setCamara(true); }} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-tinta py-3.5 text-[16px] font-bold text-white active:opacity-80">📷 Escanear código</button>
        )
      ) : null}
      <form onSubmit={(e) => { e.preventDefault(); if (manual) { procesar(manual); setManual(""); } }} className="flex gap-2">
        <input value={manual} onChange={(e) => setManual(e.target.value)} inputMode="numeric" placeholder={soportado ? "O escribí el código (779…)" : "Código de barras (779…)"} className="min-w-0 flex-1 rounded-xl border border-linea bg-tarjeta px-3 py-2.5 text-[15px]" />
        <button disabled={ocupado} className="rounded-xl bg-tarjeta px-4 font-semibold ring-1 ring-linea disabled:opacity-50">Buscar</button>
      </form>
      {msg && <p className="rounded-xl bg-alerta-suave p-3 text-sm text-alerta">{msg}</p>}

      {pend && (
        <form
          className="space-y-2 rounded-2xl bg-lila p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const precio = Number(String(fd.get("precio") ?? "").replace(",", "."));
            setOcupado(true);
            try {
              if (pend.tipo === "precio") {
                if (!(precio > 0)) return;
                await precioGondola(pend.r.producto.id, superId, precio);
                agregarEscaneado(pend.r, precio);
              } else {
                const r = await productoNuevoEan(pend.ean, String(fd.get("nombre") ?? ""), superId, precio > 0 ? precio : null);
                if (r && precio > 0) agregarEscaneado(r, precio);
              }
              setPend(null);
            } catch (err) { setMsg((err as Error).message); } finally { setOcupado(false); }
          }}
        >
          {pend.tipo === "precio" ? (
            <>
              <p className="text-[15px] font-bold text-lila-tinta">{pend.r.producto.nombre}</p>
              <p className="text-sm text-suave">No tengo precio de {nombreSuper}. ¿Cuánto dice la góndola?
                {pend.r.otros[0] && <> En {pend.r.otros[0].super} sale <b className="num">{fmt(Number(pend.r.otros[0].precio))}</b>.</>}</p>
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
            <button disabled={ocupado} className="flex-1 rounded-xl bg-tinta py-2.5 font-semibold text-white disabled:opacity-50">Al carrito</button>
            <button type="button" onClick={() => setPend(null)} className="rounded-xl px-4 font-semibold text-suave">Cancelar</button>
          </div>
        </form>
      )}

      {/* Progreso */}
      {filas.length > 0 && (
        <div>
          <div className="flex justify-between text-sm font-semibold">
            <span>{faltan ? `Te faltan ${faltan} de ${filas.length}` : "¡Tenés todo lo de la lista!"}</span>
            <span className="text-suave">{progreso}%</span>
          </div>
          <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-linea">
            <div className="h-full rounded-full bg-marca transition-all" style={{ width: `${progreso}%` }} />
          </div>
        </div>
      )}

      {/* Por comprar */}
      {aca.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-linea bg-tarjeta">
          <h2 className="bg-menta px-3 py-2.5 text-[16px] font-bold text-menta-tinta">Por comprar acá <span className="font-normal">· tocá cuando lo agarrás</span></h2>
          <ul className="divide-y divide-linea">{aca.map((f) => <FilaPorComprar key={f.key} f={f} />)}</ul>
        </section>
      )}
      {otro.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-linea bg-tarjeta">
          <button onClick={() => setVerOtroLado(!verOtroLado)} className="flex w-full items-center justify-between bg-durazno px-3 py-2.5 text-left text-[16px] font-bold text-durazno-tinta">
            <span>Mejor en otro lado ({otro.length})</span><span>{verOtroLado ? "▲" : "▼"}</span>
          </button>
          {verOtroLado && <ul className="divide-y divide-linea">{otro.map((f) => <FilaPorComprar key={f.key} f={f} />)}</ul>}
        </section>
      )}

      {/* Carrito */}
      <section className="overflow-hidden rounded-2xl border border-linea bg-tarjeta">
        <h2 className="flex items-center justify-between bg-cielo px-3 py-2.5 text-[16px] font-bold text-cielo-tinta">
          <span>🛒 En el carrito ({carro.length})</span><span className="num">{fmt(total)}</span>
        </h2>
        {!carro.length ? (
          <p className="px-3 py-4 text-sm text-suave">Escaneá un código o tocá algo de la lista para sumarlo.</p>
        ) : (
          <ul className="divide-y divide-linea">
            {carro.map((c) => (
              <li key={c.id} className="px-3 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 text-[15px] font-medium leading-snug">
                    {c.escaneado && <span title="escaneado">📷 </span>}{c.nombre}
                  </p>
                  <button onClick={() => corregirPrecio(c)} className="num shrink-0 font-semibold underline decoration-dotted">{c.precio != null ? fmt(c.precio * c.cantidad) : "poner $"}</button>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className={`min-w-0 text-sm ${c.deMas > 0 ? "font-semibold text-durazno-tinta" : "text-suave"}`}>
                    {c.deMas > 0 ? `⚠️ ${c.aviso ?? `pagás ${fmt(c.deMas)} de más`}` : c.aviso ? `✅ ${c.aviso}` : "✅ Precio de tu lista"}
                  </p>
                  <span className="flex shrink-0 items-center gap-1">
                    <button onClick={() => cant(c.id, -1)} className="h-8 w-8 rounded-full bg-fondo font-bold" aria-label="menos">−</button>
                    <span className="num w-5 text-center">{c.cantidad}</span>
                    <button onClick={() => cant(c.id, 1)} className="h-8 w-8 rounded-full bg-fondo font-bold" aria-label="más">+</button>
                    <button onClick={() => sacar(c.id)} className="ml-1 h-8 rounded-full px-2 text-sm text-suave" aria-label="sacar">↩</button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Barra fija: total, sobreprecio y terminar */}
      {carro.length > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-10 px-4">
          <div className="mx-auto max-w-xl rounded-2xl bg-tinta px-4 py-3 text-white shadow-lg">
            <div className="flex items-center justify-between gap-3">
              <span>
                <span className="block text-sm opacity-75">Llevás {carro.reduce((t, c) => t + c.cantidad, 0)} productos{sinPrecio ? ` (${sinPrecio} sin precio)` : ""}</span>
                <span className="num text-xl font-bold">{fmt(total - descHoy)}</span>
                {descHoy > 0 && <span className="block text-sm opacity-75">con {promo!.medio}: −{fmt(descHoy)}</span>}
              </span>
              <button onClick={terminar} disabled={ocupado} className="rounded-xl bg-marca px-4 py-2.5 font-semibold disabled:opacity-50">Terminar</button>
            </div>
            {deMas > 0 && <p className="mt-1.5 rounded-lg bg-white/10 px-2 py-1 text-sm">⚠️ Pagás <b className="num">{fmt(deMas)}</b> de más que en otros súpers</p>}
          </div>
        </div>
      )}
    </div>
  );
}
