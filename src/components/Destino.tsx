"use client";

/** Elegir a qué lista va lo que agregás: tu casa (por defecto) o la caja de Setto. */
export function Destino({ valor, onCambio }: { valor: "casa" | "setto"; onCambio: (v: "casa" | "setto") => void }) {
  const b = (v: "casa" | "setto", txt: string) => (
    <button type="button" onClick={() => onCambio(v)} aria-pressed={valor === v}
      className={`rounded-full px-3 py-1 text-sm font-semibold ${valor === v ? (v === "casa" ? "bg-menta text-menta-tinta" : "bg-lila text-lila-tinta") : "text-suave"}`}>
      {txt}
    </button>
  );
  return (
    <div className="mt-2 flex items-center gap-1 text-sm">
      <span className="mr-1 text-suave">Va a:</span>
      {b("casa", "🏠 Casa")}
      {b("setto", "Setto")}
    </div>
  );
}
