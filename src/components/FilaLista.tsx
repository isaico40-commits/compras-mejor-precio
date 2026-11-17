"use client";

import Link from "next/link";
import type { Entrada } from "@/lib/lista";
import { pesos } from "@/lib/formato";
import { categoriaDe } from "@/lib/categorias";
import { Icono } from "@/components/IconoProducto";

const chip = "mt-0.5 inline-flex max-w-full items-center truncate rounded-full px-2 py-0.5 text-[12px] font-semibold";

/**
 * Una fila de la lista: ícono, nombre, un chip y un precio. El detalle (presentación, $/kg, consejos) está a un toque.
 * Tocar el ícono = seleccionar.
 */
export function Fila({ e, sel, seleccionando, onToggle, onAjustar }: {
  e: Entrada; grupoId?: string; sel: boolean; seleccionando: boolean; onToggle: () => void; onAjustar?: () => void;
}) {
  const r = e.recomendado;
  const propio = e.rubro !== "super";
  // Anotado para un lugar, pero es más barato en otro súper
  const enOtroLado = !!(r && e.lugar && r.superId !== e.lugar.id);
  const cat = categoriaDe(e.titulo, e.rubro, e.categoria).id;
  const precio = propio ? (e.ultimoPago?.precio ?? r?.precio ?? null) : r?.precio != null ? r.precio * e.cantidad : null;

  const etiqueta = enOtroLado
    ? <span className={`${chip} bg-durazno text-durazno-tinta`}>Más barato en {r!.super}</span>
    : e.analizando ? <span className={`${chip} animate-pulse bg-fondo text-suave`}>buscando precio…</span>
    : e.lugar ? <span className={`${chip} bg-durazno text-durazno-tinta`}>{e.lugar.nombre}</span>
    : r?.super && !propio ? <span className={`${chip} bg-cielo text-cielo-tinta`}>{r.super}</span>
    : propio && e.ultimoPago?.lugar ? <span className={`${chip} bg-fondo text-suave`}>{e.ultimoPago.lugar}</span>
    : null;

  return (
    <li className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${sel ? "bg-marca-suave/60" : ""}`}>
      <button onClick={onToggle} aria-label={sel ? "Quitar de la selección" : "Seleccionar"} className="active:scale-95">
        <Icono nombre={e.titulo} cat={cat} setto={e.origen === "setto"}
          marca={sel ? "sel" : enOtroLado ? "caro" : e.urgente ? "urgente" : e.cantidad} />
      </button>
      <Link href={`/item/${e.origen}/${e.itemId}`} onClick={(ev) => { if (seleccionando) { ev.preventDefault(); onToggle(); } }}
        className="flex min-w-0 flex-1 items-center gap-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-semibold">
            {e.titulo}
            {e.cantidadTexto && <span className="font-normal text-suave"> · {e.cantidadTexto}</span>}
          </span>
          {etiqueta}
        </span>
        <span className={`num shrink-0 text-[16px] font-bold ${propio || precio == null ? "text-suave" : ""}`}>
          {precio != null ? pesos(precio) : "—"}
        </span>
      </Link>
      {onAjustar && !seleccionando && (
        <button onClick={onAjustar} aria-label="Cambiar categoría o precio" className="-mr-1 shrink-0 rounded-full p-1.5 text-suave/70 active:bg-fondo">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>
        </button>
      )}
    </li>
  );
}
