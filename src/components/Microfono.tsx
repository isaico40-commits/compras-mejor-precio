"use client";

import { useEffect, useRef, useState } from "react";

type Reconocimiento = {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null;
  start: () => void; stop: () => void;
};

/** Dictado por voz con el reconocimiento del propio celu (Chrome / Samsung Internet). Sin servicios pagos. */
export function Microfono({ onTexto, auto = false, grande = false }: { onTexto: (t: string) => void; auto?: boolean; grande?: boolean }) {
  const [soportado, setSoportado] = useState(true);
  const [escuchando, setEscuchando] = useState(false);
  const [parcial, setParcial] = useState("");
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Reconocimiento | null>(null);
  const cb = useRef(onTexto);
  cb.current = onTexto;

  const empezar = () => {
    const w = window as unknown as { SpeechRecognition?: new () => Reconocimiento; webkitSpeechRecognition?: new () => Reconocimiento };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) { setSoportado(false); return; }
    const r = new SR();
    r.lang = "es-AR"; r.interimResults = true; r.continuous = false;
    let final = "";
    r.onresult = (e) => {
      let tmp = "";
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) final += res[0].transcript + " "; else tmp += res[0].transcript;
      }
      setParcial((final + tmp).trim());
    };
    r.onerror = (e) => setError(e.error === "not-allowed" ? "Dale permiso al micrófono en el navegador." : e.error === "no-speech" ? "No te escuché, probá de nuevo." : null);
    r.onend = () => { setEscuchando(false); if (final.trim()) cb.current(final.trim()); setParcial(""); };
    setError(null);
    rec.current = r;
    r.start();
    setEscuchando(true);
  };

  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    if (!w.SpeechRecognition && !w.webkitSpeechRecognition) setSoportado(false);
    else if (auto) empezar();
    return () => rec.current?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!soportado) return grande ? <p className="text-center text-sm text-suave">Este navegador no permite dictar. Abrí la app desde Chrome.</p> : null;

  return (
    <div className={grande ? "flex flex-col items-center gap-3" : "contents"}>
      <button
        type="button"
        onClick={() => (escuchando ? rec.current?.stop() : empezar())}
        aria-label={escuchando ? "Dejar de escuchar" : "Dictar"}
        className={`${grande ? "h-24 w-24" : "w-12 shrink-0"} flex items-center justify-center rounded-${grande ? "full" : "xl"} ${escuchando ? "animate-pulse bg-alerta text-white" : grande ? "bg-marca text-white" : "border border-linea bg-tarjeta text-marca"}`}
      >
        <svg viewBox="0 0 24 24" className={grande ? "h-10 w-10" : "h-5 w-5"} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
      </button>
      {grande && <p className="min-h-6 text-center text-suave">{escuchando ? (parcial || "Te escucho… decí: azúcar, leche y yerba") : "Tocá y dictá"}</p>}
      {!grande && escuchando && parcial && <span className="sr-only">{parcial}</span>}
      {error && <p className="text-center text-sm text-alerta">{error}</p>}
    </div>
  );
}
