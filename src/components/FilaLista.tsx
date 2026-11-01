"use client";

import Link from "next/link";
import type { Entrada } from "@/lib/lista";
import { pesos, porUnidad, presentacion } from "@/lib/formato";

const fecha = (f: string) => { const [, m, d] = f.split("-"); return `${Number(d)}/${Number(m)}`; };

export function Fila({ e, grupoId, sel, seleccionando, onToggle }: {
  e: Entrada; grupoId: string; sel: boolean; seleccionando: boolean; onToggle: () => void;
}) {
  const r = e.recomendado;
  const enOtroLado = r && e.lugar && r.superId !== grupoId;
  return (
    <li className={`flex items-start gap-3 px-3 py-3 ${sel ? "bg-marca-suave/60" : ""}`}>
      <button onClick={onToggle} aria-label={sel ? "Quitar de la selección" : "Seleccionar"} className="pt-0.5">
        <span className={`flex h-7 w-7 items-center justify-center rounded-full border-2 ${sel ? "border-marca bg-marca text-white" : "border-linea"}`}>
          {sel ? <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3"><path d="m5 12 5 5 9-10" /></svg>
            : e.origen === "setto" ? <span className="text-[10px] font-bold text-suave">S</span> : null}
        </span>
      </button>
      <Link href={`/item/${e.origen}/${e.itemId}`} onClick={(ev) => { if (seleccionando) { ev.preventDefault(); onToggle(); } }} className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold leading-snug">
            {e.urgente && <span className="text-alerta">● </span>}
            {e.cantidad > 1 && <span className="num text-suave">{e.cantidad}× </span>}
            {e.titulo}
            {e.cantidadTexto && <span className="font-normal text-suave"> · {e.cantidadTexto}</span>}
          </p>
          {r?.precio != null && !enOtroLado && (
            <span className="shrink-0 text-right">
              <span className="num block font-semibold">{pesos(r.precio * e.cantidad)}</span>
              <span className="num block text-xs text-suave">
                {e.cantidad > 1 ? `${e.cantidad} × ${pesos(r.precio)}` : porUnidad(r.porUnidad, r.dim)}
              </span>
            </span>
          )}
        </div>
        {e.rubro !== "super" ? (
          <p className="mt-0.5 line-clamp-1 text-sm text-suave">
            {e.ultimoPago
              ? <>Última vez <span className="num">{e.ultimoPago.precio != null ? pesos(e.ultimoPago.precio) : "sin precio"}</span> · {fecha(e.ultimoPago.fecha)}{e.ultimoPago.lugar ? ` · ${e.ultimoPago.lugar}` : ""}</>
              : r ? "Precio que cargaste" : "Sin precio: se guarda cuando lo marcás comprado"}
          </p>
        ) : r ? (
          <p className="mt-0.5 line-clamp-1 text-sm text-suave">
            {r.nombre !== e.titulo ? r.nombre : ""}
            {presentacion(r.cant, r.dim) && <> · {presentacion(r.cant, r.dim)}</>}
            {(enOtroLado || e.cantidad > 1) && r.porUnidad != null && <> · <span className="num">{porUnidad(r.porUnidad, r.dim)}</span></>}
          </p>
        ) : (
          <p className="mt-0.5 text-sm text-suave">
            {e.analizando ? "Analizando precios…" : e.lugar ? "Sin precio cargado" : "No encontré precios. Tocá para ajustar"}
          </p>
        )}
        {enOtroLado && r && (
          <p className="mt-1 text-sm text-alerta">Más barato en {r.super}: <span className="num">{pesos(r.precio)}</span></p>
        )}
        {e.consejo && <p className="mt-1 text-sm text-marca">💡 {e.consejo}</p>}
      </Link>
    </li>
  );
}
