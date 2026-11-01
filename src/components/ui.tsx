export function Encabezado({ titulo, sub, children }: { titulo: string; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-10 bg-fondo/95 px-4 pb-3 pt-5 backdrop-blur">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold leading-tight tracking-tight">{titulo}</h1>
          {sub && <p className="mt-0.5 text-sm text-suave">{sub}</p>}
        </div>
        {children}
      </div>
    </header>
  );
}

export type Tono = "blanco" | "menta" | "cielo" | "lila" | "durazno" | "limon";
const fondoTono: Record<Tono, string> = {
  blanco: "border border-linea bg-tarjeta",
  menta: "bg-menta", cielo: "bg-cielo", lila: "bg-lila", durazno: "bg-durazno", limon: "bg-limon",
};
export const tintaTono: Record<Tono, string> = {
  blanco: "text-tinta",
  menta: "text-menta-tinta", cielo: "text-cielo-tinta", lila: "text-lila-tinta", durazno: "text-durazno-tinta", limon: "text-limon-tinta",
};

/** Tarjeta. Los tonos pastel marcan qué tipo de bloque es (info, ajuste, acción). */
export function Tarjeta({ children, className = "", tono = "blanco" }: { children: React.ReactNode; className?: string; tono?: Tono }) {
  return <div className={`rounded-2xl ${fondoTono[tono]} ${className}`}>{children}</div>;
}

/** Título de un bloque: siempre el mismo tamaño, en la tinta del tono. */
export function Titulo({ children, tono = "blanco", className = "" }: { children: React.ReactNode; tono?: Tono; className?: string }) {
  return <p className={`text-[15px] font-bold ${tintaTono[tono]} ${className}`}>{children}</p>;
}

export function Pill({ children, tono = "gris" }: { children: React.ReactNode; tono?: "gris" | "verde" | "naranja" }) {
  const c = { gris: "bg-fondo text-suave", verde: "bg-menta text-menta-tinta", naranja: "bg-durazno text-durazno-tinta" }[tono];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${c}`}>{children}</span>;
}

/** Texto de ayuda / secundario: un solo tamaño en toda la app. */
export const ayudaCls = "text-sm leading-snug text-suave";
export const inputCls = "w-full rounded-xl border border-linea bg-tarjeta px-3 py-2.5 text-[15px] font-normal text-tinta outline-none focus:border-marca";
export const btnCls = "rounded-xl bg-marca px-4 py-2.5 text-[15px] font-semibold text-white active:opacity-80";
export const btnSecCls = "rounded-xl bg-menta px-4 py-2.5 text-[15px] font-semibold text-menta-tinta active:opacity-80";
/** Botón secundario sobre una tarjeta pastel: blanco con la tinta del tono. */
export const btnSobre = (t: Tono) => `rounded-xl bg-tarjeta px-4 py-2.5 text-[15px] font-semibold active:opacity-80 ${tintaTono[t]}`;
