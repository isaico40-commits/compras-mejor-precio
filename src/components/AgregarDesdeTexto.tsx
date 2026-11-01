"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { agregarVarios } from "@/app/actions";
import { parsearItems } from "@/lib/parsear";
import { Microfono } from "@/components/Microfono";

/** Pantalla para lo que llega compartido (Samsung Notes, WhatsApp…), por voz o por un link de rutina. */
export function AgregarDesdeTexto({ inicial, auto, voz }: { inicial: string[]; auto: boolean; voz: boolean }) {
  const [items, setItems] = useState<{ t: string; on: boolean }[]>(inicial.map((t) => ({ t, on: true })));
  const [hecho, setHecho] = useState<string[] | null>(null);
  const [pendiente, start] = useTransition();

  const agregar = (lista: string[]) => start(async () => {
    if (!lista.length) return;
    await agregarVarios(lista);
    setHecho(lista);
  });

  useEffect(() => {
    if (auto && inicial.length) agregar(inicial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sumarDictado = (t: string) => {
    const nuevos = parsearItems(t).filter((n) => !items.some((i) => i.t.toLowerCase() === n.toLowerCase()));
    if (voz && !items.length) { agregar(nuevos); return; }   // dictado directo: se agrega sin más pasos
    setItems([...items, ...nuevos.map((x) => ({ t: x, on: true }))]);
  };

  if (hecho) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-4xl">✅</p>
        <p className="text-lg font-bold">Agregado a la lista</p>
        <p className="text-suave">{hecho.join(", ")}</p>
        <div className="flex gap-2">
          <button onClick={() => { setHecho(null); setItems([]); }} className="flex-1 rounded-xl border border-linea bg-tarjeta py-3 font-semibold">Dictar más</button>
          <Link href="/" className="flex-1 rounded-xl bg-marca py-3 font-semibold text-white">Ver la lista</Link>
        </div>
      </div>
    );
  }

  const elegidos = items.filter((i) => i.on).map((i) => i.t);
  return (
    <div className="space-y-5">
      <Microfono onTexto={sumarDictado} auto={voz} grande />
      {items.length > 0 && (
        <>
          <ul className="divide-y divide-linea overflow-hidden rounded-2xl border border-linea bg-tarjeta">
            {items.map((i, k) => (
              <li key={k} className="flex items-center gap-3 px-3 py-2">
                <input type="checkbox" checked={i.on} onChange={() => setItems(items.map((x, j) => (j === k ? { ...x, on: !x.on } : x)))} className="h-5 w-5 accent-[var(--color-marca)]" />
                <input value={i.t} onChange={(e) => setItems(items.map((x, j) => (j === k ? { ...x, t: e.target.value } : x)))} className="w-full bg-transparent py-1 text-[15px] outline-none" />
              </li>
            ))}
          </ul>
          <button onClick={() => agregar(elegidos)} disabled={pendiente || !elegidos.length} className="w-full rounded-xl bg-marca py-3 font-semibold text-white disabled:opacity-60">
            {pendiente ? "Agregando…" : `Agregar ${elegidos.length} a la lista`}
          </button>
        </>
      )}
    </div>
  );
}
