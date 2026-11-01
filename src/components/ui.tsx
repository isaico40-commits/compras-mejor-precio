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

export function Tarjeta({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-linea bg-tarjeta ${className}`}>{children}</div>;
}

export function Pill({ children, tono = "gris" }: { children: React.ReactNode; tono?: "gris" | "verde" | "naranja" }) {
  const c = { gris: "bg-fondo text-suave", verde: "bg-marca-suave text-marca", naranja: "bg-alerta-suave text-alerta" }[tono];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${c}`}>{children}</span>;
}

export const inputCls = "w-full rounded-xl border border-linea bg-tarjeta px-3 py-2.5 text-[15px] outline-none focus:border-marca";
export const btnCls = "rounded-xl bg-marca px-4 py-2.5 text-[15px] font-semibold text-white active:opacity-80";
export const btnSecCls = "rounded-xl border border-linea bg-tarjeta px-4 py-2.5 text-[15px] font-semibold active:bg-fondo";
