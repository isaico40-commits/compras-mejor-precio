"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmarCompra, type ParaConfirmar } from "@/components/ConfirmarCompra";

export type FilaSuper = {
  key: string; origen: "mio" | "setto"; itemId: string; titulo: string; termino: string; productoId: string | null;
  precio: number | null;       // total (precio × cantidad) en este súper
  precioTxt: string; cantidad: number; urgente: boolean; detalle: string | null; anotado: boolean; otroLado: string | null;
};
export type BloqueSuper = { titulo: string; tono: "verde" | "naranja"; filas: FilaSuper[] };

const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");

/** Lista del súper con tildes: lo que metés al changuito se tacha y abajo ves cuánto llevás. */
export type PromoHoy = { porcentaje: number; tope: number | null; minimo: number | null; medio: string };

export function Changuito({ superId, bloques, promo }: { superId: string; bloques: BloqueSuper[]; promo?: PromoHoy | null }) {
  const router = useRouter();
  const hoy = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const claveLS = `changuito:${superId}:${hoy}`;
  const [tildados, setTildados] = useState<Set<string>>(new Set());
  const [confirmando, setConfirmando] = useState<ParaConfirmar[] | null>(null);
  const [fin, setFin] = useState<{ total: number; n: number; aviso: string | null } | null>(null);

  useEffect(() => {
    try { const g = localStorage.getItem(claveLS); if (g) setTildados(new Set(JSON.parse(g))); } catch {}
  }, [claveLS]);
  const guardar = (s: Set<string>) => {
    setTildados(s);
    try { localStorage.setItem(claveLS, JSON.stringify([...s])); } catch {}
  };
  const toggle = (k: string) => {
    const s = new Set(tildados);
    if (s.has(k)) s.delete(k); else s.add(k);
    guardar(s);
  };

  const todas = useMemo(() => bloques.flatMap((b) => b.filas), [bloques]);
  const enCarro = todas.filter((f) => tildados.has(f.key));
  const total = enCarro.reduce((t, f) => t + (f.precio ?? 0), 0);
  const ahorro = promo && (!promo.minimo || total >= promo.minimo)
    ? Math.min((total * promo.porcentaje) / 100, promo.tope ?? Infinity) : 0;
  const sinPrecio = enCarro.filter((f) => f.precio == null).length;

  // "Terminar compra" primero pregunta si los precios estaban bien
  const terminar = () => setConfirmando(enCarro.map((f) => ({
    key: f.key, cantidad: f.cantidad,
    item: { origen: f.origen, itemId: f.itemId, titulo: f.titulo, termino: f.termino, productoId: f.productoId, precio: f.precio != null ? f.precio / f.cantidad : null },
  })));
  const listo = (r: { total: number; n: number; settoError: string | null }) => {
    try { localStorage.removeItem(claveLS); } catch {}
    const desc = promo && (!promo.minimo || r.total >= promo.minimo) ? Math.min((r.total * promo.porcentaje) / 100, promo.tope ?? Infinity) : 0;
    setFin({ total: r.total - desc, n: r.n, aviso: r.settoError });
    setConfirmando(null);
    setTildados(new Set());
    router.refresh();
  };

  return (
    <>
      {confirmando && <ConfirmarCompra items={confirmando} superId={superId} onCerrar={() => setConfirmando(null)} onListo={listo} />}
      {fin && (
        <div className="rounded-2xl bg-marca-suave p-4 text-marca">
          <p className="font-bold">Compra terminada: {fin.n} cosas · <span className="num">{fmt(fin.total)}</span></p>
          <p className="text-sm">Lo de tu lista quedó tachado y lo de Setto marcado como comprado en la caja.</p>
          {fin.aviso && <p className="mt-1 text-sm text-alerta">{fin.aviso}</p>}
        </div>
      )}

      {bloques.filter((b) => b.filas.length).map((b) => (
        <section key={b.titulo}>
          <h2 className={`mb-2 px-1 text-lg font-bold ${b.tono === "verde" ? "text-marca" : "text-alerta"}`}>{b.titulo}</h2>
          <ul className="divide-y divide-linea overflow-hidden rounded-2xl border border-linea bg-tarjeta">
            {b.filas.map((f) => {
              const on = tildados.has(f.key);
              return (
                <li key={f.key}>
                  <button onClick={() => toggle(f.key)} className="flex w-full items-start gap-3 px-3 py-3 text-left active:bg-fondo">
                    <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${on ? "border-marca bg-marca text-white" : "border-linea"}`}>
                      {on && <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3"><path d="m5 12 5 5 9-10" /></svg>}
                    </span>
                    <span className={`min-w-0 flex-1 ${on ? "opacity-50" : ""}`}>
                      <span className="flex justify-between gap-2">
                        <span className={`font-semibold leading-snug ${on ? "line-through" : ""}`}>
                          {f.urgente && <span className="text-alerta">● </span>}
                          {f.cantidad > 1 && <span className="num text-suave">{f.cantidad}× </span>}{f.titulo}
                          {f.origen === "setto" && <span className="ml-1.5 rounded bg-fondo px-1 text-[10px] font-bold text-suave">S</span>}
                        </span>
                        <span className="num shrink-0 font-semibold">{f.precioTxt}</span>
                      </span>
                      {f.detalle && <span className="block truncate text-sm text-suave">{f.detalle}</span>}
                      {f.anotado && <span className="mt-0.5 inline-block rounded-full bg-marca-suave px-2 py-0.5 text-[11px] font-semibold text-marca">anotado para acá</span>}
                      {f.otroLado && <span className="block text-sm text-alerta">{f.otroLado}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {enCarro.length > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-10 px-4">
          <div className="mx-auto flex max-w-xl items-center justify-between gap-3 rounded-2xl bg-tinta px-4 py-3 text-white shadow-lg">
            <span>
              <span className="block text-xs opacity-75">En el changuito: {enCarro.length}{sinPrecio ? ` (${sinPrecio} sin precio)` : ""}</span>
              <span className="num text-lg font-bold">{fmt(total - ahorro)}</span>
              {ahorro > 0 && <span className="block text-xs opacity-75">con {promo!.medio}: −{fmt(ahorro)}</span>}
            </span>
            <button onClick={terminar} className="rounded-xl bg-marca px-4 py-2.5 font-semibold">Terminar compra</button>
          </div>
        </div>
      )}
    </>
  );
}
