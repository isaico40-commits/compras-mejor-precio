"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Grupo, Entrada } from "@/lib/lista";
import { Fila } from "@/components/FilaLista";
import { ConfirmarCompra, type ParaConfirmar } from "@/components/ConfirmarCompra";
import { quitarItems, lugarItems, rubroItems, type ItemLote } from "@/app/actions";
import { RUBROS, type Rubro } from "@/lib/rubros";
import { tintaTono, type Tono } from "@/components/ui";

// Color del grupo según qué es: súper, verdulería, bazar, otro comercio
const tonoGrupo = (g: Grupo): Tono | null => {
  if (g.id === "analizando" || g.id === "sin-precio") return null;
  const r = g.entradas[0]?.rubro;
  return r === "verduleria" ? "menta" : r === "bazar" ? "lila" : r === "otro" ? "durazno" : "cielo";
};
const fondo: Record<Tono, string> = { blanco: "bg-tarjeta", menta: "bg-menta", cielo: "bg-cielo", lila: "bg-lila", durazno: "bg-durazno", limon: "bg-limon" };

const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");

/** La lista con selección múltiple: tocás el círculo de varios y aplicás una acción a todos. */
export function ListaInteractiva({ grupos, supers }: { grupos: Grupo[]; supers: { id: string; nombre: string }[] }) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<"comprado" | "lugar" | "rubro" | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendiente, start] = useTransition();
  const [lugar, setLugar] = useState("");
  const [nuevo, setNuevo] = useState("");

  const todas = grupos.flatMap((g) => g.entradas);
  const elegidas = todas.filter((e) => sel.has(e.key));
  const toggle = (k: string) => { const s = new Set(sel); if (s.has(k)) s.delete(k); else s.add(k); setSel(s); };
  const lote = (es: Entrada[]): ItemLote[] => es.map((e) => ({ origen: e.origen, itemId: e.itemId, texto: e.texto }));
  const terminar = (msg: string | null) => { setSel(new Set()); setModal(null); setAviso(msg); router.refresh(); };

  // Súper sugerido para "comprado": el anotado o el recomendado más repetido
  const sugerido = (() => {
    const c = new Map<string, number>();
    for (const e of elegidas) { const id = e.lugar?.id ?? e.recomendado?.superId; if (id && !id.startsWith("rubro-")) c.set(id, (c.get(id) ?? 0) + 1); }
    return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  })();
  const paraConfirmar: ParaConfirmar[] = elegidas.map((e) => ({
    key: e.key, cantidad: e.cantidad,
    item: {
      origen: e.origen, itemId: e.itemId, titulo: e.titulo, termino: e.termino, texto: e.texto,
      productoId: e.producto?.id ?? null, precio: e.recomendado?.precio ?? null,
    },
  }));

  return (
    <>
      {aviso && <p className="mt-3 rounded-xl bg-marca-suave p-3 text-sm text-marca" onClick={() => setAviso(null)}>{aviso}</p>}

      <div className="mt-5 space-y-4">
        {grupos.map((g) => (
          <section key={g.id} className="overflow-hidden rounded-2xl border border-linea bg-tarjeta">
            <div className={`flex items-baseline justify-between px-3 py-2.5 ${(() => { const t = tonoGrupo(g); return t ? `${fondo[t]} ${tintaTono[t]}` : "bg-fondo text-suave"; })()}`}>
              <h2 className="text-lg font-bold">
                {g.nombre}
                {g.anotado && <span className="ml-2 inline-flex items-center rounded-full bg-white/70 px-2 py-0.5 align-middle text-[11px] font-semibold">anotado</span>}
              </h2>
              <span className="flex items-baseline gap-3">
                {g.total > 0 && <span className="num text-[15px] font-bold">{fmt(g.total)}</span>}
                <button
                  onClick={() => { const s = new Set(sel); const todos = g.entradas.every((e) => s.has(e.key)); g.entradas.forEach((e) => (todos ? s.delete(e.key) : s.add(e.key))); setSel(s); }}
                  className="text-sm font-semibold underline-offset-2 opacity-80"
                >
                  {g.entradas.every((e) => sel.has(e.key)) ? "Ninguno" : "Todos"}
                </button>
              </span>
            </div>
            <ul className="divide-y divide-linea">
              {g.entradas.map((e) => (
                <Fila key={e.key} e={e} grupoId={g.id} sel={sel.has(e.key)} seleccionando={sel.size > 0} onToggle={() => toggle(e.key)} />
              ))}
            </ul>
          </section>
        ))}
      </div>

      {sel.size > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-10 px-4">
          <div className="mx-auto max-w-xl rounded-2xl bg-tinta p-3 text-white shadow-lg">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span>{sel.size} seleccionado{sel.size === 1 ? "" : "s"}</span>
              <button onClick={() => setSel(new Set())} className="opacity-75">Cancelar</button>
            </div>
            <div className="grid grid-cols-4 gap-2 text-sm font-semibold">
              <button onClick={() => setModal("comprado")} className="rounded-xl bg-marca py-2.5">Comprado</button>
              <button onClick={() => { setLugar(""); setNuevo(""); setModal("lugar"); }} className="rounded-xl bg-white/15 py-2.5">Dónde</button>
              <button onClick={() => setModal("rubro")} className="rounded-xl bg-white/15 py-2.5">Rubro</button>
              <button
                disabled={pendiente}
                onClick={() => {
                  const setto = elegidas.filter((e) => e.origen === "setto").length;
                  if (!confirm(`¿Quitar ${sel.size} de la lista?${setto ? ` ${setto} también se quitan de la caja de Setto.` : ""}`)) return;
                  start(async () => { const r = await quitarItems(lote(elegidas)); terminar(r.settoError ?? "Listo, quitados."); });
                }}
                className="rounded-xl bg-white/15 py-2.5 disabled:opacity-60"
              >
                Quitar
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === "comprado" && (
        <ConfirmarCompra
          items={paraConfirmar} superId={sugerido} supers={supers}
          onCerrar={() => setModal(null)}
          onListo={(r) => terminar(r.settoError ?? `Listo: ${r.n} comprados · ${fmt(r.total)}`)}
        />
      )}

      {modal === "rubro" && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/40" onClick={() => setModal(null)}>
          <div className="mx-auto w-full max-w-xl rounded-t-3xl bg-fondo p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-linea" />
            <p className="text-lg font-bold">¿Qué son estos {sel.size}?</p>
            <p className="mb-3 text-sm text-suave">Lo que no es de súper no se compara con Precios Claros: te muestro lo último que pagaste.</p>
            <div className="grid grid-cols-2 gap-2">
              {RUBROS.map((r) => (
                <button key={r.id} disabled={pendiente}
                  onClick={() => start(async () => { await rubroItems(lote(elegidas), r.id as Rubro); terminar(`Listo: ${r.nombre}.`); })}
                  className="rounded-xl border border-linea bg-tarjeta py-3 font-semibold disabled:opacity-60">{r.nombre}</button>
              ))}
            </div>
            <button disabled={pendiente} onClick={() => start(async () => { await rubroItems(lote(elegidas), null); terminar("Listo: rubro automático."); })}
              className="mt-2 w-full py-2 text-sm font-semibold text-suave">Que lo detecte solo</button>
          </div>
        </div>
      )}

      {modal === "lugar" && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/40" onClick={() => setModal(null)}>
          <div className="mx-auto w-full max-w-xl rounded-t-3xl bg-fondo p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-linea" />
            <p className="mb-3 text-lg font-bold">¿Dónde comprás estos {sel.size}?</p>
            <select value={lugar} onChange={(e) => setLugar(e.target.value)} className="w-full rounded-xl border border-linea bg-tarjeta px-3 py-2.5 text-[15px]">
              <option value="">Donde esté más barato</option>
              {supers.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
            <input value={nuevo} onChange={(e) => setNuevo(e.target.value)} placeholder="¿No está? Escribí el lugar" className="mt-2 w-full rounded-xl border border-linea bg-tarjeta px-3 py-2.5 text-[15px]" />
            <div className="mt-3 flex gap-2">
              <button onClick={() => setModal(null)} className="rounded-xl border border-linea bg-tarjeta px-4 py-2.5 font-semibold">Volver</button>
              <button
                disabled={pendiente}
                onClick={() => start(async () => { await lugarItems(lote(elegidas), lugar || null, nuevo.trim() || null); terminar("Listo, lugar guardado."); })}
                className="flex-1 rounded-xl bg-marca px-4 py-2.5 font-semibold text-white disabled:opacity-60"
              >
                {pendiente ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
