"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { analizarPendientes } from "@/app/actions";

/** Dispara el análisis de precios en segundo plano y refresca la lista cuando termina. */
export function AutoAnalizar({ terminos, dims, mostrar }: { terminos: string[]; dims: (string | null)[]; mostrar: boolean }) {
  const router = useRouter();
  const clave = JSON.stringify([terminos, dims]);
  const hecho = useRef<string | null>(null);
  useEffect(() => {
    if (!terminos.length || hecho.current === clave) return;
    hecho.current = clave;
    analizarPendientes(terminos, dims)
      .then(() => router.refresh())
      .catch(() => {});
  }, [clave, terminos, dims, router]);
  if (!mostrar) return null;
  return (
    <p className="mt-3 flex items-center gap-2 text-sm text-suave">
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-linea border-t-marca" />
      Buscando el mejor precio…
    </p>
  );
}
