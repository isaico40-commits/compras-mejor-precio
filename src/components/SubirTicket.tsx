"use client";

import { useRef, useState, useTransition } from "react";
import { subirTicket } from "@/app/actions";

/** Achica la foto en el celu (máx. 1600 px, JPEG) para que suba rápido aunque haya poca señal. */
async function comprimir(file: File): Promise<string> {
  const img = await createImageBitmap(file);
  const escala = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * escala); c.height = Math.round(img.height * escala);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  const url = c.toDataURL("image/jpeg", 0.75);
  return url.slice(url.indexOf(",") + 1);
}

export function SubirTicket() {
  const input = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const [nota, setNota] = useState("");
  const [estado, setEstado] = useState<string | null>(null);
  const [pendiente, start] = useTransition();

  const elegir = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    if (!files.length) return;
    start(async () => {
      try {
        for (const [i, f] of files.entries()) {
          setEstado(`Subiendo ${i + 1} de ${files.length}…`);
          await subirTicket(await comprimir(f), "image/jpeg", nota);
        }
        setEstado(files.length > 1 ? `Listo, subí ${files.length} fotos.` : "Listo, ticket subido.");
        setNota("");
      } catch (err) {
        setEstado(`No se pudo subir: ${(err as Error).message}`);
      }
      if (input.current) input.current.value = "";
      if (galeria.current) galeria.current.value = "";
    });
  };

  return (
    <div className="space-y-3">
      <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota (opcional): Makro, compra del local…"
        className="w-full rounded-xl border border-linea bg-tarjeta px-3 py-2.5 text-[15px] outline-none focus:border-marca" />
      <label className={`block w-full cursor-pointer rounded-xl bg-marca px-4 py-3 text-center font-semibold text-white active:opacity-80 ${pendiente ? "opacity-60" : ""}`}>
        {pendiente ? "Subiendo…" : "Sacar foto del ticket"}
        <input ref={input} type="file" accept="image/*" capture="environment" onChange={elegir} disabled={pendiente} className="sr-only" />
      </label>
      <label className={`block w-full cursor-pointer rounded-xl border border-linea bg-tarjeta px-4 py-3 text-center font-semibold active:bg-fondo ${pendiente ? "opacity-60" : ""}`}>
        Elegir desde la galería
        <input ref={galeria} type="file" accept="image/*" multiple onChange={elegir} disabled={pendiente} className="sr-only" />
      </label>
      {estado && <p className="text-center text-sm text-suave">{estado}</p>}
    </div>
  );
}
