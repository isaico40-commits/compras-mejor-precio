"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { agregarALista, agregarVarios } from "@/app/actions";
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
  const [aviso, setAviso] = useState<string | null>(null);
  const [, start] = useTransition();
  const router = useRouter();
  const [destino, setDestino] = useState<"casa" | "setto">("casa");

  const agregarTexto = (t: string) => start(async () => {
    const items = parsearLista(t);
    if (!items.length) return;
    await agregarVarios(items, destino);
    setAviso(`Agregado${destino === "setto" ? " a Setto" : ""}: ${items.map((i) => i.nombre).join(", ")}`);
    setTimeout(() => setAviso(null), 4000);
  });

  return (
    <>
      <form
        ref={ref}
        action={async (fd) => {
          const t = String(fd.get("nombre") ?? "");
          if (parsearItems(t).length > 1) agregarTexto(t);
          else await agregarALista(fd);
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
      {aviso && <p className="mt-2 rounded-xl bg-marca-suave px-3 py-2 text-sm text-marca">{aviso}</p>}
    </>
  );
}
