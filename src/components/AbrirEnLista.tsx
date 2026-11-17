"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const LIBRES = ["/", "/login", "/auth", "/agregar"];   // a donde se puede llegar directo (compartir, login)
const PAUSA_MS = 60 * 60_000;

/**
 * La app siempre arranca en la Lista: al abrirla (instalada) y al volver después de una hora.
 * Los atajos del ícono (?atajo=1), lo compartido (/agregar) y el súper con carrito abierto no se tocan.
 */
export function AbrirEnLista() {
  const router = useRouter();

  useEffect(() => {
    const instalada = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    if (!instalada) return;
    const libre = (p: string) => LIBRES.some((l) => (l === "/" ? p === "/" : p.startsWith(l))) || location.search.includes("atajo=1");
    try {
      if (!sessionStorage.getItem("abierta")) {
        sessionStorage.setItem("abierta", "1");
        if (!libre(location.pathname)) router.replace("/");
      }
    } catch {}
    let oculta = 0;
    const cambio = () => {
      if (document.visibilityState === "hidden") { oculta = Date.now(); return; }
      const p = location.pathname;
      if (oculta && Date.now() - oculta > PAUSA_MS && !libre(p) && !p.startsWith("/super")) router.replace("/");
      oculta = 0;
    };
    document.addEventListener("visibilitychange", cambio);
    return () => document.removeEventListener("visibilitychange", cambio);
  }, [router]);

  return null;
}
