"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { agregarVarios, type ResultadoAgregar } from "@/app/actions";
import { AjusteRapido } from "@/components/AjusteRapido";
import { Microfono } from "@/components/Microfono";
import { parsearItems, parsearLista } from "@/lib/parsear";
import { Destino } from "@/components/Destino";

function Boton() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="shrink-0 rounded-xl bg-marca px-4 text-[15px] font-semibold text-white active:opacity-80 disabled:opacity-60">
      {pending ? "…" : "Agregar"}
    </button>
  );
}

/** Agregar escribiendo o dictando. Si escribís o decís varias cosas ("azúcar, leche y yerba") se agregan todas. */
export function AgregarItem() {
  const ref = useRef<HTMLFormElement>(null);
  const [resultados, setResultados] = useState<ResultadoAgregar[] | null>(null);
  const [ajustando, setAjustando] = useState<ResultadoAgregar | null>(null);
  const [, start] = useTransition();
  const router = useRouter();
  const [destino, setDestino] = useState<"casa" | "setto">("casa");

  const agregarTexto = (t: string) => start(async () => {
    const items = parsearLista(t);
    if (!items.length) return;
    const r = await agregarVarios(items, destino);
    setResultados(r.resultados);
  });

  return (
    <>
      <form
        ref={ref}
        action={async (fd) => {
          const t = String(fd.get("nombre") ?? "");
          if (parsearItems(t).length) agregarTexto(t);
          ref.current?.reset();
        }}
        className="flex gap-2"
      >
        <input type="hidden" name="destino" value={destino} />
        <input
          name="nombre" required autoComplete="off" enterKeyHint="done"
          placeholder="Agregar: azúcar, leche, yerba…"
          onPaste={(ev) => {
            // Una lista pegada (una cosa por renglón, con títulos tipo "Verdulería") se revisa antes de agregar
            const t = ev.clipboardData.getData("text");
            if (/\r?\n/.test(t.trim())) { ev.preventDefault(); router.push(`/agregar?text=${encodeURIComponent(t)}${destino === "setto" ? "&destino=setto" : ""}`); }
          }}
          className="w-full rounded-xl border border-linea bg-tarjeta px-3 py-2.5 text-[15px] outline-none focus:border-marca"
        />
        <Microfono onTexto={agregarTexto} />
        <Boton />
      </form>
      <Destino valor={destino} onCambio={setDestino} />
      {resultados && resultados.length > 0 && (
        <div className="mt-2 rounded-2xl bg-menta p-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[15px] font-bold text-menta-tinta">
              {resultados.every((r) => r.estado === "ya_estaba") ? "Ya estaba en la lista" : "Agregado"}
            </span>
            <button onClick={() => setResultados(null)} className="text-sm font-semibold text-suave">Cerrar</button>
          </div>
          <ul className="space-y-1.5">
            {resultados.map((r) => (
              <li key={r.nombre} className="flex items-center gap-2 text-[15px]">
                <span className="min-w-0 flex-1 truncate">
                  <b>{r.nombre}</b>
                  {r.estado === "ya_estaba" && <span className="text-sm text-durazno-tinta"> · ya estaba{r.donde === "setto" ? " en Setto" : ""}, no lo dupliqué</span>}
                  {r.estado === "reactivado" && <span className="text-sm text-suave"> · lo volví a poner</span>}
                  {r.estado === "nuevo" && r.donde === "setto" && <span className="text-sm text-suave"> · en Setto</span>}
                </span>
                {r.itemId && (
                  <button onClick={() => setAjustando(r)} className="shrink-0 rounded-full bg-tarjeta px-2.5 py-1 text-sm font-semibold text-lila-tinta">
                    {r.categoriaNombre} · {r.fuente === "super" ? "🛒" : "✍️"} ›
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {ajustando?.itemId && (
        <AjusteRapido
          items={[{ origen: ajustando.origen, itemId: ajustando.itemId, texto: ajustando.texto, categoria: ajustando.categoria }]}
          titulo={ajustando.nombre} categoria={ajustando.categoria} fuente={ajustando.fuente}
          editarHref={`/item/${ajustando.origen}/${ajustando.itemId}`}
          onCerrar={() => setAjustando(null)}
        />
      )}
    </>
  );
}
