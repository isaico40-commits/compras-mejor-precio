"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icono } from "@/components/IconoProducto";
import { EVENTO_OFERTA, type OfertaSuper } from "@/components/OfertasSuper";
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
  cat: string;                 // categoría (para el ícono)
};

/** Lo que está en el carrito: de la lista (tocado o escaneado) o escaneado suelto */
type EnCarro = {
  id: string; rowKey: string | null; productoId: string | null; nombre: string;
  precio: number | null; cantidad: number; deMas: number; aviso: string | null; escaneado: boolean; cat?: string | null;
};

type Pendiente =
  | { tipo: "precio"; ean: string; r: NonNullable<Escaneo> }
  | { tipo: "nuevo"; ean: string };

type Detector = { detect: (s: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type DetectorCtor = new (o: { formats: string[] }) => Detector;

const SOBREPRECIO = 1.05;
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");

/** Modo súper: lista y carrito en una sola pantalla, con escáner de códigos. */
export function ModoSuper({ superId, nombreSuper, promo, filas, abajo }: { superId: string; nombreSuper: string; promo: PromoHoy | null; filas: FilaLista[]; abajo?: React.ReactNode }) {
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
  const [teclado, setTeclado] = useState(false);
  const [verCarro, setVerCarro] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
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

  // Oferta tocada abajo: al carrito (si ya estaba, suma uno)
  useEffect(() => {
    const h = (ev: Event) => {
      const o = (ev as CustomEvent<OfertaSuper>).detail;
      const fila = filasRef.current.find((f) => f.productoId === o.producto_id);
      if (navigator.vibrate) navigator.vibrate(30);
      cambiar((prev) => {
        const i = prev.findIndex((c) => c.productoId === o.producto_id);
        if (i >= 0) return prev.map((c, j) => (j === i ? { ...c, cantidad: c.cantidad + 1 } : c));
        const libre = fila && !prev.some((c) => c.rowKey === fila.key);
        return [{ id: libre ? fila!.key : `oferta-${o.producto_id}`, rowKey: libre ? fila!.key : null, productoId: o.producto_id, nombre: fila?.titulo ?? o.nombre,
          precio: o.precio, cantidad: 1, deMas: 0, aviso: `Oferta: ${o.ahorro}% menos que en ${o.super_sig}`, escaneado: false, cat: fila?.cat ?? null }, ...prev];
      });
      setToast(`🛒 ${o.nombre.split(" ").slice(0, 4).join(" ")} al carrito`);
    };
    window.addEventListener(EVENTO_OFERTA, h);
    return () => window.removeEventListener(EVENTO_OFERTA, h);
  }, [cambiar]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 1800); return () => clearTimeout(t); }, [toast]);

  const enCarro = useMemo(() => new Set(carro.map((c) => c.rowKey).filter(Boolean)), [carro]);
  const porComprar = filas.filter((f) => !enCarro.has(f.key));
  const aca = porComprar.filter((f) => f.conviene);
  const otro = porComprar.filter((f) => !f.conviene);

  // Tocar un ítem de la lista = lo pusiste en el carrito y el precio estaba bien
  const meter = (f: FilaLista) => {
    if (navigator.vibrate) navigator.vibrate(30);
    cambiar((prev) => [{ id: f.key, rowKey: f.key, productoId: f.productoId, nombre: f.titulo, precio: f.precio, cantidad: f.cantidad, deMas: f.deMas, aviso: f.deMas > 0 && f.otroLado ? `Más barato en ${f.otroLado.split(" · ")[0]}` : null, escaneado: false, cat: f.cat }, ...prev]);
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
    const aviso = caro ? `Más barato en ${mejor!.super}: ${fmt(mejor!.precio)}`
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
        deMas: caro ? precio - mejor!.precio : 0, aviso, escaneado: true, cat: fila?.cat ?? null,
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

  // ---------- Vista ----------
  const nProductos = carro.reduce((t, c) => t + c.cantidad, 0);
  const R = 26, CIRC = 2 * Math.PI * R;

  const Fila = ({ f }: { f: FilaLista }) => (
    <li>
      <button onClick={() => meter(f)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors active:bg-menta">
        <Icono nombre={f.titulo} cat={f.cat} marca={f.urgente ? "urgente" : f.cantidad} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-semibold">{f.titulo}</span>
          {!f.conviene && f.otroLado && <span className="mt-0.5 inline-block rounded-full bg-durazno px-2 py-0.5 text-[12px] font-semibold text-durazno-tinta">{f.otroLado.split(" · ")[0]}</span>}
        </span>
        <span className="num shrink-0 text-[16px] font-bold">{f.precio != null ? fmt(f.precio * f.cantidad) : "—"}</span>
      </button>
    </li>
  );

  return (
    <div className="space-y-4 px-4">
      {fin && <p className="rounded-2xl bg-menta px-4 py-3 text-[15px] font-semibold text-menta-tinta">🎉 {fin}</p>}

      {/* Resumen: progreso de la lista y chips */}
      <section className="flex items-center gap-4 rounded-3xl bg-tarjeta p-4 shadow-sm ring-1 ring-linea">
        <svg viewBox="0 0 64 64" className="h-16 w-16 shrink-0 -rotate-90">
          <circle cx="32" cy="32" r={R} fill="none" strokeWidth="7" className="stroke-linea" />
          <circle cx="32" cy="32" r={R} fill="none" strokeWidth="7" strokeLinecap="round" className="stroke-marca transition-all duration-500"
            strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - progreso / 100)} />
          <text x="32" y="37" textAnchor="middle" className="rotate-90 fill-current text-[15px] font-bold" style={{ transformOrigin: "32px 32px" }}>
            {filas.length ? `${filas.length - faltan}/${filas.length}` : nProductos}
          </text>
        </svg>
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-bold leading-tight">
            {!filas.length ? "Escaneá lo que llevás" : faltan ? `Te faltan ${faltan}` : "¡Tenés todo! 🎉"}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {promo && <span className="rounded-full bg-menta px-2.5 py-1 text-[13px] font-semibold text-menta-tinta">🏷️ −{promo.porcentaje}% {promo.medio}</span>}
            {deMas > 0
              ? <span className="rounded-full bg-durazno px-2.5 py-1 text-[13px] font-semibold text-durazno-tinta">⚠️ {fmt(deMas)} de más</span>
              : carro.length > 0 && <span className="rounded-full bg-cielo px-2.5 py-1 text-[13px] font-semibold text-cielo-tinta">👍 Buen precio</span>}
          </div>
        </div>
      </section>

      {/* Escáner */}
      <div className="flex gap-2">
        {soportado && !camara && (
          <button onClick={() => { setFin(null); setCamara(true); }} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-tinta py-3.5 text-[16px] font-bold text-white active:opacity-80">
            <span className="text-xl">📷</span> Escanear
          </button>
        )}
        {(!soportado || !camara) && (
          <button onClick={() => setTeclado(!teclado)} aria-label="Escribir código" className={`flex items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-[15px] font-semibold ring-1 ring-linea ${teclado ? "bg-cielo text-cielo-tinta" : "bg-tarjeta"} ${soportado ? "" : "flex-1"}`}>
            ⌨️{!soportado && " Escribir código"}
          </button>
        )}
      </div>
      {camara && (
        <div className="relative overflow-hidden rounded-3xl bg-black">
          <video ref={video} playsInline muted className="aspect-[16/9] w-full object-cover" />
          <div className="pointer-events-none absolute inset-x-10 top-1/2 h-0.5 -translate-y-1/2 rounded bg-red-500/90 shadow-[0_0_12px_rgba(239,68,68,.9)]" />
          <button onClick={() => setCamara(false)} className="absolute right-2 top-2 rounded-full bg-black/60 px-3 py-1.5 text-sm font-semibold text-white">✕</button>
          {ocupado && <p className="absolute inset-x-0 bottom-2 text-center text-sm font-semibold text-white">Buscando…</p>}
        </div>
      )}
      {teclado && (
        <form onSubmit={(e) => { e.preventDefault(); if (manual) { procesar(manual); setManual(""); } }} className="flex gap-2">
          <input value={manual} onChange={(e) => setManual(e.target.value)} inputMode="numeric" autoFocus placeholder="Número del código (779…)" className="min-w-0 flex-1 rounded-2xl border border-linea bg-tarjeta px-4 py-3 text-[16px]" />
          <button disabled={ocupado} className="rounded-2xl bg-tinta px-5 font-semibold text-white disabled:opacity-50">OK</button>
        </form>
      )}
      {msg && <p className="rounded-2xl bg-alerta-suave p-3 text-sm text-alerta">{msg}</p>}

      {pend && (
        <form
          className="space-y-3 rounded-3xl bg-lila p-4"
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
            <div className="flex items-center gap-3">
              <Icono nombre={pend.r.producto.nombre} />
              <div className="min-w-0">
                <p className="truncate text-[16px] font-bold">{pend.r.producto.nombre}</p>
                <p className="text-sm text-lila-tinta">¿Qué precio dice la góndola?</p>
              </div>
            </div>
          ) : (
            <>
              <p className="text-[16px] font-bold">🆕 Producto nuevo</p>
              <input name="nombre" required placeholder="¿Qué es? (ej. Yerba Playadito 1 kg)" className="w-full rounded-2xl border border-linea bg-tarjeta px-4 py-3 text-[16px]" />
            </>
          )}
          <input name="precio" inputMode="decimal" required={pend.tipo === "precio"} placeholder="$ Precio" className="num w-full rounded-2xl border border-linea bg-tarjeta px-4 py-3 text-[20px] font-bold" autoFocus />
          {pend.tipo === "precio" && pend.r.otros[0] && <p className="text-sm text-suave">En {pend.r.otros[0].super}: {fmt(Number(pend.r.otros[0].precio))}</p>}
          <div className="flex gap-2">
            <button disabled={ocupado} className="flex-1 rounded-2xl bg-tinta py-3 font-bold text-white disabled:opacity-50">Al carrito</button>
            <button type="button" onClick={() => setPend(null)} className="rounded-2xl px-4 font-semibold text-suave">Cancelar</button>
          </div>
        </form>
      )}

      {/* Por comprar */}
      {aca.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-baseline justify-between px-1">
            <span className="text-[18px] font-bold">Por comprar</span>
            <span className="text-[13px] text-suave">tocá al agarrarlo</span>
          </h2>
          <ul className="divide-y divide-linea overflow-hidden rounded-3xl bg-tarjeta shadow-sm ring-1 ring-linea">{aca.map((f) => <Fila key={f.key} f={f} />)}</ul>
        </section>
      )}
      {/* Abajo, juntos: lo que conviene en otro lado y las ofertas de acá */}
      {(otro.length > 0 || abajo) && (
        <div className="space-y-2 pt-2">
        {otro.length > 0 && (
          <section>
            <button onClick={() => setVerOtroLado(!verOtroLado)} className="flex w-full items-center justify-between rounded-2xl bg-durazno px-4 py-3 text-left">
              <span className="text-[15px] font-semibold text-durazno-tinta">🔀 {otro.length} {otro.length === 1 ? "conviene" : "convienen"} en otro súper</span>
              <span className={`text-durazno-tinta transition-transform ${verOtroLado ? "rotate-180" : ""}`}>▾</span>
            </button>
            {verOtroLado && <ul className="mt-2 divide-y divide-linea overflow-hidden rounded-3xl bg-tarjeta shadow-sm ring-1 ring-linea">{otro.map((f) => <Fila key={f.key} f={f} />)}</ul>}
          </section>
        )}

          {abajo}
        </div>
      )}

      {toast && <p className="fixed inset-x-4 bottom-[calc(150px+env(safe-area-inset-bottom))] z-30 mx-auto max-w-sm rounded-full bg-tinta px-4 py-2.5 text-center text-sm font-semibold text-white shadow-lg">{toast}</p>}

      {/* Barra fija: tocá para ver el carrito */}
      {carro.length > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-10 px-4">
          <div className="mx-auto flex max-w-xl items-center justify-between gap-2 rounded-3xl bg-tinta py-2.5 pl-2.5 pr-2.5 text-white shadow-xl">
            <button onClick={() => setVerCarro(true)} className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl py-0.5 pl-2.5 text-left active:bg-white/10">
              <span className="relative text-[26px]">🛒<span className="num absolute -right-2 -top-1 rounded-full bg-marca px-1.5 text-[11px] font-bold leading-5">{nProductos}</span></span>
              <span className="min-w-0">
                <span className="num block text-[22px] font-bold leading-tight">{fmt(total - descHoy)}</span>
                <span className="block truncate text-[12px] opacity-75">Ver carrito ▴{deMas > 0 ? ` · ⚠️ ${fmt(deMas)} de más` : ""}</span>
              </span>
            </button>
            <button onClick={terminar} disabled={ocupado} className="rounded-2xl bg-marca px-5 py-3 text-[15px] font-bold disabled:opacity-50">Terminar ✓</button>
          </div>
        </div>
      )}

      {/* Carrito en pop-up, con el detalle */}
      {verCarro && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/40" onClick={() => setVerCarro(false)}>
          <div className="mx-auto flex max-h-[88dvh] w-full max-w-xl flex-col rounded-t-3xl bg-fondo pb-[env(safe-area-inset-bottom)]" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 pt-3">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-linea" />
              <div className="flex items-center justify-between">
                <p className="text-[20px] font-bold">🛒 Tu carrito</p>
                <button onClick={() => setVerCarro(false)} aria-label="Cerrar" className="h-9 w-9 rounded-full bg-tarjeta text-lg ring-1 ring-linea">✕</button>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <span className="rounded-2xl bg-tarjeta px-2 py-2 ring-1 ring-linea">
                  <span className="block text-[11px] font-semibold uppercase text-suave">Productos</span>
                  <span className="num block text-[18px] font-bold">{nProductos}</span>
                </span>
                <span className={`rounded-2xl px-2 py-2 ${descHoy > 0 ? "bg-menta text-menta-tinta" : "bg-tarjeta ring-1 ring-linea"}`}>
                  <span className="block text-[11px] font-semibold uppercase opacity-75">Descuento</span>
                  <span className="num block text-[18px] font-bold">{descHoy > 0 ? `−${fmt(descHoy)}` : "—"}</span>
                </span>
                <span className={`rounded-2xl px-2 py-2 ${deMas > 0 ? "bg-durazno text-durazno-tinta" : "bg-cielo text-cielo-tinta"}`}>
                  <span className="block text-[11px] font-semibold uppercase opacity-75">{deMas > 0 ? "De más" : "Precio"}</span>
                  <span className="num block text-[18px] font-bold">{deMas > 0 ? fmt(deMas) : "👍 OK"}</span>
                </span>
              </div>
              {promo && descHoy === 0 && promo.minimo && <p className="mt-2 text-center text-[13px] text-suave">El −{promo.porcentaje}% de {promo.medio} arranca desde {fmt(promo.minimo)}.</p>}
            </div>
            <ul className="mt-3 flex-1 space-y-2 overflow-y-auto px-4 pb-3">
              {carro.map((c) => (
                <li key={c.id} className="rounded-3xl bg-tarjeta p-3 shadow-sm ring-1 ring-linea">
                  <div className="flex items-center gap-3">
                    <Icono nombre={c.nombre} cat={c.cat} marca={c.deMas > 0 ? "caro" : "ok"} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[16px] font-semibold">{c.nombre}</span>
                      <span className="num text-[13px] text-suave">{c.cantidad} × {c.precio != null ? fmt(c.precio) : "sin precio"}{c.escaneado ? " · escaneado" : ""}</span>
                    </span>
                    <span className={`num shrink-0 text-[17px] font-bold ${c.deMas > 0 ? "text-durazno-tinta" : ""}`}>{c.precio != null ? fmt(c.precio * c.cantidad) : "$ ?"}</span>
                  </div>
                  {(c.aviso || c.deMas > 0) && (
                    <p className={`mt-2 rounded-xl px-3 py-1.5 text-[13px] font-medium ${c.deMas > 0 ? "bg-durazno text-durazno-tinta" : "bg-menta text-menta-tinta"}`}>
                      {c.deMas > 0 ? `⚠️ ${fmt(c.deMas)} de más · ${c.aviso ?? ""}` : `✓ ${c.aviso}`}
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    <span className="flex items-center rounded-full bg-fondo ring-1 ring-linea">
                      <button onClick={() => cant(c.id, -1)} className="h-9 w-9 text-lg font-bold" aria-label="menos">−</button>
                      <span className="num w-6 text-center font-bold">{c.cantidad}</span>
                      <button onClick={() => cant(c.id, 1)} className="h-9 w-9 text-lg font-bold" aria-label="más">+</button>
                    </span>
                    <button onClick={() => corregirPrecio(c)} className="h-9 flex-1 rounded-full bg-fondo text-sm font-semibold ring-1 ring-linea">✏️ Precio</button>
                    <button onClick={() => sacar(c.id)} className="h-9 rounded-full bg-fondo px-4 text-sm font-semibold text-alerta ring-1 ring-linea">Sacar</button>
                  </div>
                </li>
              ))}
              {!carro.length && <li className="py-10 text-center text-suave">Vacío. Escaneá o tocá algo de la lista.</li>}
            </ul>
            <div className="border-t border-linea px-4 py-3">
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-[15px] text-suave">Total{sinPrecio ? ` (${sinPrecio} sin precio)` : ""}</span>
                <span className="num text-[26px] font-bold">{fmt(total - descHoy)}</span>
              </div>
              <button onClick={() => { setVerCarro(false); terminar(); }} disabled={ocupado || !carro.length} className="w-full rounded-2xl bg-marca py-3.5 text-[16px] font-bold text-white disabled:opacity-50">Terminar compra ✓</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
