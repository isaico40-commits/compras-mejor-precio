"use client";

import { useState, useTransition } from "react";
import { borrarLugar } from "@/app/actions";

export function BorrarLugar({ id, nombre }: { id: string; nombre: string }) {
  const [pendiente, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState(false);
  if (hecho) return <span className="text-sm text-suave">Borrado</span>;
  return (
    <span className="text-right">
      <button
        disabled={pendiente}
        onClick={() => {
          if (!confirm(`¿Borrar "${nombre}"? Deja de aparecer en todas las listas.`)) return;
          start(async () => { const r = await borrarLugar(id); if (r.error) setError(r.error); else setHecho(true); });
        }}
        className="rounded-lg bg-durazno px-3 py-1.5 text-sm font-semibold text-durazno-tinta disabled:opacity-60"
      >
        {pendiente ? "Borrando…" : "Borrar"}
      </button>
      {error && <span className="mt-1 block max-w-48 text-sm text-durazno-tinta">{error}</span>}
    </span>
  );
}
