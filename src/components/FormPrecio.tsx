import { inputCls } from "@/components/ui";

export const MEDIDAS = [
  { v: "kg", label: "kg" },
  { v: "medio_kg", label: "½ kg" },
  { v: "g", label: "gramos" },
  { v: "l", label: "litros" },
  { v: "ml", label: "cc / ml" },
  { v: "u", label: "unidad" },
] as const;

/** Convierte cantidad + unidad guardadas a la medida del selector */
export function medidaDe(cantidad: number | null, unidad: string | null) {
  const u = (unidad ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (["kg", "kgm"].includes(u)) return cantidad === 0.5 ? { medida: "medio_kg", cant: 1 } : { medida: "kg", cant: cantidad ?? 1 };
  if (["g", "gr", "grs", "grm"].includes(u)) return { medida: "g", cant: cantidad ?? 1 };
  if (["l", "lt", "lts", "ltr"].includes(u)) return { medida: "l", cant: cantidad ?? 1 };
  if (["ml", "cc", "cm"].includes(u)) return { medida: "ml", cant: cantidad ?? 1 };
  return { medida: "u", cant: cantidad ?? 1 };
}

export function CamposMedida({ medida = "u", cant = 1 }: { medida?: string; cant?: number }) {
  return (
    <div>
      <p className="mb-1 text-sm font-semibold">Medida</p>
      <div className="grid grid-cols-[5.5rem_1fr] gap-2">
        <input name="cantidad" type="number" step="any" min="0.01" inputMode="decimal" defaultValue={cant} className={inputCls} aria-label="Cantidad" />
        <div className="grid grid-cols-3 gap-1.5">
          {MEDIDAS.map((m) => (
            <label key={m.v} className="cursor-pointer">
              <input type="radio" name="medida" value={m.v} defaultChecked={m.v === medida} className="peer sr-only" />
              <span className="block rounded-lg border border-linea bg-tarjeta py-2 text-center text-sm font-medium peer-checked:border-marca peer-checked:bg-marca-suave peer-checked:text-marca">
                {m.label}
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CamposPrecio({
  supers, superId, precio, promo, detalle, fecha,
}: {
  supers: { id: string; nombre: string }[]; superId?: string | null; precio?: number | null; promo?: number | null; detalle?: string | null; fecha: string;
}) {
  return (
    <>
      <label className="block text-sm font-semibold">Dónde
        <select name="supermercado_id" required defaultValue={superId ?? ""} className={`${inputCls} mt-1`}>
          <option value="">Elegí el súper</option>
          {supers.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm font-semibold">Precio
          <input name="precio" type="number" inputMode="decimal" step="0.01" min="0.01" required defaultValue={precio ?? ""} placeholder="$" className={`${inputCls} mt-1`} />
        </label>
        <label className="text-sm font-semibold">Con promo
          <input name="precio_promo" type="number" inputMode="decimal" step="0.01" min="0.01" defaultValue={promo ?? ""} placeholder="opcional" className={`${inputCls} mt-1`} />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input name="promo_detalle" defaultValue={detalle ?? ""} placeholder="Promo (2x1…)" className={inputCls} />
        <input name="fecha" type="date" defaultValue={fecha} className={inputCls} />
      </div>
    </>
  );
}
