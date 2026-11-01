"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { agregarALista } from "@/app/actions";

function Boton() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="shrink-0 rounded-xl bg-marca px-4 text-[15px] font-semibold text-white active:opacity-80 disabled:opacity-60">
      {pending ? "…" : "Agregar"}
    </button>
  );
}

/** Agregar escribiendo solo el nombre. El análisis de precio corre después. */
export function AgregarItem() {
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={ref}
      action={async (fd) => {
        await agregarALista(fd);
        ref.current?.reset();
      }}
      className="flex gap-2"
    >
      <input
        name="nombre" required autoComplete="off" enterKeyHint="done"
        placeholder="Agregar: azúcar, leche, yerba…"
        className="w-full rounded-xl border border-linea bg-tarjeta px-3 py-2.5 text-[15px] outline-none focus:border-marca"
      />
      <Boton />
    </form>
  );
}
