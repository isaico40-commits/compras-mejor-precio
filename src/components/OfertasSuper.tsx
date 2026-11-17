"use client";

import { useState } from "react";
import { Icono } from "@/components/IconoProducto";

export type OfertaSuper = { producto_id: string; nombre: string; precio: number; siguiente: number; super_sig: string; ahorro: number; promo: boolean; pres: string | null };

/** Evento que escucha ModoSuper para meter una oferta en el carrito. */
export const EVENTO_OFERTA = "super:oferta";

/** Ofertas del súper donde estás: tocás una y va al carrito. */
export function OfertasSuper({ nombreSuper, tuyas, otras }: { nombreSuper: string; tuyas: OfertaSuper[]; otras: OfertaSuper[] }) {
  const [abierto, setAbierto] = useState(false);
  const [puestas, setPuestas] = useState<Set<string>>(new Set());
  const n = tuyas.length + otras.length;

  const agregar = (o: OfertaSuper) => {
    window.dispatchEvent(new CustomEvent(EVENTO_OFERTA, { detail: o }));
    setPuestas((s) => new Set(s).add(o.producto_id));
  };
  const Lista = ({ ops }: { ops: OfertaSuper[] }) => (
    <ul className="divide-y divide-linea overflow-hidden rounded-3xl bg-tarjeta shadow-sm ring-1 ring-linea">
      {ops.map((o) => {
        const ya = puestas.has(o.producto_id);
        return (
          <li key={o.producto_id}>
            <button onClick={() => agregar(o)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors active:bg-menta">
              <Icono nombre={o.nombre} marca={ya ? "ok" : undefined} />
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-[15px] font-semibold leading-snug">{o.nombre}</span>
                <span className="mt-0.5 flex flex-wrap gap-1">
                  <span className="rounded-full bg-menta px-2 py-0.5 text-[12px] font-semibold text-menta-tinta">−{o.ahorro}% vs {o.super_sig}</span>
                  {o.promo && <span className="rounded-full bg-durazno px-2 py-0.5 text-[12px] font-semibold text-durazno-tinta">promo</span>}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="num block text-[16px] font-bold">${Math.round(o.precio).toLocaleString("es-AR")}</span>
                <span className="block text-[12px] font-semibold text-marca">{ya ? "✓ en el carrito" : "+ agregar"}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  if (!n) return null;
  return (
    <section>
      <button onClick={() => setAbierto(!abierto)} className="flex w-full items-center justify-between rounded-2xl bg-menta px-4 py-3 text-left">
        <span className="text-[15px] font-semibold text-menta-tinta">💡 {n} ofertas en {nombreSuper}</span>
        <span className={`text-menta-tinta transition-transform ${abierto ? "rotate-180" : ""}`}>▾</span>
      </button>
      {abierto && (
        <div className="mt-2 space-y-2">
          <p className="px-1 text-[13px] text-suave">Más baratos acá que en cualquier otro súper. Tocá para sumarlo al carrito.</p>
          {tuyas.length > 0 && (<><p className="px-1 pt-1 text-[14px] font-bold">De lo que solés comprar</p><Lista ops={tuyas} /></>)}
          {otras.length > 0 && (<><p className="px-1 pt-1 text-[14px] font-bold text-suave">Otras</p><Lista ops={otras} /></>)}
        </div>
      )}
    </section>
  );
}
