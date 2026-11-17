"use client";

import { useState, useTransition } from "react";
import { guardarCategoria } from "@/app/actions";
import { CATEGORIAS } from "@/lib/categorias";
import { EMOJI } from "@/components/IconoProducto";

/** Chip de categoría arriba de la ficha: elegís y se guarda solo. */
export function CategoriaRapida({ id, origen, texto, elegida, auto }: { id: string; origen: string; texto: string; elegida: string | null; auto: string }) {
  const [valor, setValor] = useState(elegida ?? "");
  const [guardando, start] = useTransition();
  const actual = valor || auto;
  return (
    <label className="relative inline-flex items-center gap-1.5 rounded-full bg-lila px-3 py-1.5 text-[13px] font-semibold text-lila-tinta">
      <span>{EMOJI[actual] ?? "🛒"}</span>
      <span>{CATEGORIAS.find((c) => c.id === actual)?.nombre ?? "Otros"}{!valor && " (auto)"}</span>
      <span className={guardando ? "animate-pulse" : ""}>{guardando ? "…" : "▾"}</span>
      <select
        aria-label="Categoría" value={valor} disabled={guardando}
        onChange={(e) => {
          const v = e.target.value; setValor(v);
          const fd = new FormData();
          fd.set("id", id); fd.set("origen", origen); fd.set("texto", texto); fd.set("categoria", v);
          start(() => guardarCategoria(fd));
        }}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        <option value="">Automática</option>
        {CATEGORIAS.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
      </select>
    </label>
  );
}
