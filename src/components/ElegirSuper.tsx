"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/** Grilla de súpers: al tocar uno se marca, se bloquean los demás y se ve que está cargando. */
export function ElegirSuper({ supers }: { supers: { id: string; nombre: string; promo: string | null }[] }) {
  const router = useRouter();
  const [elegido, setElegido] = useState<string | null>(null);
  const [cargando, start] = useTransition();
  const bloqueado = cargando || elegido !== null;

  return (
    <>
      <ul className="grid grid-cols-2 gap-2 px-4">
        {supers.map((s) => {
          const este = elegido === s.id;
          return (
            <li key={s.id}>
              <button
                disabled={bloqueado}
                onClick={() => { setElegido(s.id); start(() => router.push(`/super?s=${s.id}`)); }}
                className={`relative block w-full rounded-2xl px-4 py-4 text-left font-semibold transition ${este ? "bg-marca text-white ring-4 ring-marca/25" : "bg-cielo text-cielo-tinta"} ${bloqueado && !este ? "opacity-40" : ""} active:opacity-80`}
              >
                <span className="flex items-center justify-between gap-2">
                  {s.nombre}
                  {este && <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
                </span>
                {s.promo && <span className={`mt-1 block text-sm font-semibold ${este ? "text-white/85" : "text-marca"}`}>Hoy {s.promo}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {elegido && (
        <p className="mt-4 px-4 text-center text-[15px] font-semibold text-marca">
          Armando tu lista para {supers.find((s) => s.id === elegido)?.nombre}…
        </p>
      )}
    </>
  );
}
