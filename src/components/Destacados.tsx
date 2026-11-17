"use client";

import { useState } from "react";

export type Destacado = { id: string; emoji: string; label: string; tono: "menta" | "cielo" | "lila" | "durazno" | "limon"; contenido: React.ReactNode };

const PILL: Record<Destacado["tono"], string> = {
  menta: "bg-menta text-menta-tinta", cielo: "bg-cielo text-cielo-tinta", lila: "bg-lila text-lila-tinta",
  durazno: "bg-durazno text-durazno-tinta", limon: "bg-limon text-limon-tinta",
};

/** Fila de chips (bajas, descuentos, plan…). Se abre uno por vez, así la lista queda arriba y no hay paredes de texto. */
export function Destacados({ items }: { items: Destacado[] }) {
  const [abierto, setAbierto] = useState<string | null>(null);
  if (!items.length) return null;
  const actual = items.find((i) => i.id === abierto);
  return (
    <section className="mt-4">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {items.map((i) => {
          const on = i.id === abierto;
          return (
            <button key={i.id} onClick={() => setAbierto(on ? null : i.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[14px] font-semibold transition ${PILL[i.tono]} ${on ? "ring-2 ring-current" : ""}`}>
              <span className="text-[16px]">{i.emoji}</span>{i.label}
              <span className={`text-[11px] transition-transform ${on ? "rotate-180" : ""}`}>▾</span>
            </button>
          );
        })}
      </div>
      {actual && <div className="mt-2 overflow-hidden rounded-3xl bg-tarjeta shadow-sm ring-1 ring-linea">{actual.contenido}</div>}
    </section>
  );
}
