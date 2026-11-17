import { CATEGORIAS, categoriaDe } from "@/lib/categorias";

/** Ícono por categoría: el mismo en la lista, en el súper y en el carrito. */
export const EMOJI: Record<string, string> = {
  verduleria: "🥬", lacteos: "🥛", almacen: "🥫", dietetica: "🌰", bebidas: "🥤", carniceria: "🥩", fiambres: "🥓", panaderia: "🥖",
  congelados: "🧊", descartables: "📦", limpieza: "🧽", higiene: "🧴", bazar: "🍽️", mascotas: "🐾", otro_comercio: "🏪", otros: "🛒",
};
export const FONDO: Record<string, string> = { menta: "bg-menta", cielo: "bg-cielo", lila: "bg-lila", durazno: "bg-durazno", limon: "bg-limon" };

export const iconoDe = (nombre: string, cat?: string | null) => {
  const c = cat ? CATEGORIAS.find((x) => x.id === cat) : categoriaDe(nombre, "super");
  return { emoji: EMOJI[c?.id ?? "otros"] ?? "🛒", bg: FONDO[c?.tono ?? "limon"] };
};

export type Marca = "ok" | "caro" | "urgente" | "sel" | number;

/** Cuadradito con el emoji de la categoría y una marca chica: ✓ bien, ! caro, punto rojo urgente, ×N cantidad. */
export function Icono({ nombre, cat, marca, setto }: { nombre: string; cat?: string | null; marca?: Marca; setto?: boolean }) {
  const i = iconoDe(nombre, cat);
  if (marca === "sel") {
    return (
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-marca text-white">
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="3"><path d="m5 12 5 5 9-10" /></svg>
      </span>
    );
  }
  return (
    <span className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-[22px] ${i.bg}`}>
      {i.emoji}
      {marca === "ok" && <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-marca text-[11px] text-white ring-2 ring-tarjeta">✓</span>}
      {marca === "caro" && <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#e8833a] text-[12px] font-bold text-white ring-2 ring-tarjeta">!</span>}
      {marca === "urgente" && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-alerta ring-2 ring-tarjeta" />}
      {typeof marca === "number" && marca > 1 && <span className="num absolute -right-1.5 -top-1.5 rounded-full bg-tinta px-1.5 text-[11px] font-bold leading-5 text-white ring-2 ring-tarjeta">×{marca}</span>}
      {setto && <span className="absolute -bottom-1 -left-1 flex h-5 w-5 items-center justify-center rounded-full bg-tinta text-[10px] font-bold text-white ring-2 ring-tarjeta">S</span>}
    </span>
  );
}
