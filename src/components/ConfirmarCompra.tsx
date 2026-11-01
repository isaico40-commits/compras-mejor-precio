"use client";

import { useState, useTransition } from "react";
import { terminarCompra, type ItemCarrito } from "@/app/actions";

export type ParaConfirmar = { key: string; cantidad: number; item: ItemCarrito };

const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");

/**
 * Antes de marcar como comprado (y mandarlo a la caja de Setto): ¿el precio estaba bien?
 * Se puede corregir cada precio; el confirmado queda guardado como precio real de ese lugar.
 */
export function ConfirmarCompra({
  items, superId, supers, onCerrar, onListo,
}: {
  items: ParaConfirmar[];
  superId: string | null;                       // fijo (en el súper) o elegible (desde la lista)
  supers?: { id: string; nombre: string }[];
  onCerrar: () => void;
  onListo: (r: { total: number; n: number; settoError: string | null }) => void;
}) {
  const [lugar, setLugar] = useState(superId ?? "");
  const [precios, setPrecios] = useState<Record<string, string>>(
    Object.fromEntries(items.map((i) => [i.key, i.item.precio != null ? String(Math.round(i.item.precio)) : ""])),
  );
  const [pendiente, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const total = items.reduce((t, i) => t + (Number(precios[i.key]) || 0) * i.cantidad, 0);

  const confirmar = () => start(async () => {
    setError(null);
    try {
      const r = await terminarCompra(lugar, items.map((i) => ({ ...i.item, precio: Number(precios[i.key]) || null })));
      onListo({ total, n: items.length, settoError: r.settoError });
    } catch (e) {
      setError((e as Error).message);
    }
  });

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/40" onClick={onCerrar}>
      <div className="mx-auto max-h-[85dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-fondo p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-linea" />
        <p className="text-lg font-bold">¿Los precios estaban bien?</p>
        <p className="mb-3 text-sm text-suave">Corregí lo que haga falta. Se guarda como precio real y después se marca comprado{items.some((i) => i.item.origen === "setto") ? " (también en la caja de Setto)" : ""}.</p>

        {supers && (
          <label className="mb-3 block text-sm font-semibold">Dónde lo compraste
            <select value={lugar} onChange={(e) => setLugar(e.target.value)} className="mt-1 w-full rounded-xl border border-linea bg-tarjeta px-3 py-2.5 text-[15px]">
              <option value="">Elegí el lugar</option>
              {supers.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </label>
        )}

        <ul className="divide-y divide-linea overflow-hidden rounded-2xl border border-linea bg-tarjeta">
          {items.map((i) => (
            <li key={i.key} className="flex items-center gap-3 px-3 py-2.5">
              <span className="min-w-0 flex-1 text-[15px] leading-snug">
                {i.cantidad > 1 && <span className="num text-suave">{i.cantidad}× </span>}{i.item.titulo}
              </span>
              <span className="flex items-center gap-1">
                <span className="text-suave">$</span>
                <input
                  inputMode="decimal" type="number" min="0" step="1" value={precios[i.key]} placeholder="—"
                  onChange={(e) => setPrecios({ ...precios, [i.key]: e.target.value })}
                  className="num w-24 rounded-lg border border-linea bg-fondo px-2 py-1.5 text-right text-[15px] outline-none focus:border-marca"
                  aria-label={`Precio de ${i.item.titulo}`}
                />
              </span>
            </li>
          ))}
        </ul>

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-3 flex items-center justify-between gap-3">
          <button onClick={onCerrar} className="rounded-xl border border-linea bg-tarjeta px-4 py-2.5 font-semibold">Volver</button>
          <button onClick={confirmar} disabled={pendiente || (!!supers && !lugar)} className="flex-1 rounded-xl bg-marca px-4 py-2.5 font-semibold text-white disabled:opacity-60">
            {pendiente ? "Guardando…" : <>Confirmar · <span className="num">{fmt(total)}</span></>}
          </button>
        </div>
      </div>
    </div>
  );
}
