"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { categoriaItems, fuenteItems, type ItemAjuste } from "@/app/actions";
import { CATEGORIAS } from "@/lib/categorias";

/** Hoja para cambiar al toque la categoría y de dónde sale el precio, sin entrar a editar. */
export function AjusteRapido({ items, titulo, categoria, fuente, editarHref, onCerrar }: {
  items: ItemAjuste[]; titulo: string; categoria: string; fuente: "super" | "propio";
  editarHref?: string; onCerrar: () => void;
}) {
  const router = useRouter();
  const [pendiente, start] = useTransition();
  const [cat, setCat] = useState(categoria);
  const [fue, setFue] = useState(fuente);

  const elegirCat = (id: string) => start(async () => {
    setCat(id);
    await categoriaItems(items, id);
    // Verdulería / bazar / otro comercio pasan a precio propio solos
    if (["verduleria", "bazar", "otro_comercio"].includes(id)) setFue("propio");
    else if (fue === "propio") await fuenteItems(items.map((i) => ({ ...i, categoria: id })), "propio");
    router.refresh();
  });
  const elegirFuente = (f: "super" | "propio") => start(async () => {
    setFue(f);
    await fuenteItems(items.map((i) => ({ ...i, categoria: cat })), f);
    router.refresh();
  });

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/40" onClick={onCerrar}>
      <div className="mx-auto max-h-[85dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-fondo p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-linea" />
        <p className="text-lg font-bold leading-snug">{titulo}</p>

        <p className="mt-3 text-[15px] font-bold text-cielo-tinta">Precio de</p>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {([["super", "🛒 Súpers", "Precios Claros, todos los días"], ["propio", "✍️ Propio", "Lo que pagaste o cargaste"]] as const).map(([v, t, d]) => (
            <button key={v} disabled={pendiente} onClick={() => elegirFuente(v)}
              className={`rounded-xl px-3 py-2.5 text-left disabled:opacity-60 ${fue === v ? "bg-cielo text-cielo-tinta ring-2 ring-cielo-tinta/40" : "border border-linea bg-tarjeta"}`}>
              <span className="block text-[15px] font-semibold">{t}</span>
              <span className="block text-sm text-suave">{d}</span>
            </button>
          ))}
        </div>

        <p className="mt-4 text-[15px] font-bold text-lila-tinta">Categoría</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {CATEGORIAS.map((c) => (
            <button key={c.id} disabled={pendiente} onClick={() => elegirCat(c.id)}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold disabled:opacity-60 ${cat === c.id ? "bg-lila text-lila-tinta ring-2 ring-lila-tinta/40" : "border border-linea bg-tarjeta"}`}>
              {c.nombre}
            </button>
          ))}
        </div>

        <div className="mt-4 flex gap-2">
          {editarHref && <Link href={editarHref} className="rounded-xl border border-linea bg-tarjeta px-4 py-2.5 font-semibold">Más ajustes</Link>}
          <button onClick={onCerrar} className="flex-1 rounded-xl bg-marca px-4 py-2.5 font-semibold text-white">{pendiente ? "Guardando…" : "Listo"}</button>
        </div>
      </div>
    </div>
  );
}
