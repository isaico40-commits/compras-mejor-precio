"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { pasarACasa, type ParaCasa } from "@/app/actions";

/** Aviso para pasar a tu lista lo que se cargó en Setto por error (ej: una lista pegada). */
export function PasarACasa({ items, titulo }: { items: ParaCasa[]; titulo: string }) {
  const router = useRouter();
  const [pendiente, start] = useTransition();
  const [fuera, setFuera] = useState<Set<string>>(new Set());
  const [listo, setListo] = useState<string | null>(null);
  const [cerrado, setCerrado] = useState(false);
  // "Dejar así" se recuerda para esos mismos ítems
  const clave = "setto-ok:" + items.map((i) => i.itemId).sort().join(",");
  useEffect(() => { try { if (localStorage.getItem(clave)) setCerrado(true); } catch {} }, [clave]);
  if (cerrado || !items.length) return null;
  if (listo) return <p className="mt-3 rounded-2xl bg-menta px-4 py-3 text-sm text-menta-tinta">{listo}</p>;
  const elegidos = items.filter((i) => !fuera.has(i.itemId));
  return (
    <section className="mt-3 rounded-2xl bg-lila p-4">
      <p className="text-[15px] font-bold text-lila-tinta">{titulo}</p>
      <p className="text-sm text-suave">Destildá lo que sí es de Setto. El resto pasa a tu lista y se quita de la caja.</p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {items.map((i) => {
          const on = !fuera.has(i.itemId);
          return (
            <li key={i.itemId}>
              <button
                onClick={() => { const s = new Set(fuera); if (on) s.add(i.itemId); else s.delete(i.itemId); setFuera(s); }}
                className={`rounded-full px-3 py-1 text-sm font-semibold ${on ? "bg-tarjeta text-lila-tinta" : "text-suave line-through"}`}
              >
                {i.titulo}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex gap-2">
        <button onClick={() => { try { localStorage.setItem(clave, "1"); } catch {} setCerrado(true); }} className="rounded-xl px-3 py-2.5 text-sm font-semibold text-suave">Dejar así</button>
        <button
          disabled={pendiente || !elegidos.length}
          onClick={() => start(async () => {
            const r = await pasarACasa(elegidos);
            setListo(r.settoError ? `Pasados a tu lista, pero Setto respondió: ${r.settoError}` : `Listo: ${r.n} pasados a tu lista (casa).`);
            router.refresh();
          })}
          className="flex-1 rounded-xl bg-tarjeta px-4 py-2.5 font-semibold text-lila-tinta disabled:opacity-60"
        >
          {pendiente ? "Pasando…" : `🏠 Pasar ${elegidos.length} a casa`}
        </button>
      </div>
    </section>
  );
}
