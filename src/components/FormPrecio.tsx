import { inputCls } from "@/components/ui";

export const MEDIDAS = [
  { v: "g", label: "g", texto: "gramos (g)" },
  { v: "kg", label: "kg", texto: "kilos (kg)" },
  { v: "medio_kg", label: "½ kg", texto: "medio kilo" },
  { v: "ml", label: "ml", texto: "mililitros (ml / cc)" },
  { v: "l", label: "l", texto: "litros (l)" },
  { v: "u", label: "unid.", texto: "unidades" },
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

/** Tamaño: número + unidad en un desplegable (para comparar por kilo o litro). */
export function CamposMedida({ medida = "", cant }: { medida?: string; cant?: number | null }) {
  return (
    <div>
      <p className="text-sm font-semibold text-suave">Tamaño <span className="font-normal">(para comparar por kilo o litro)</span></p>
      <div className="mt-1 grid grid-cols-2 gap-2">
        <input name="cantidad" type="number" step="any" min="0.01" inputMode="decimal" defaultValue={cant ?? ""} placeholder="Ej: 500" aria-label="Tamaño" className={`${inputCls} num`} />
        <select name="medida" defaultValue={medida} aria-label="Unidad" className={inputCls}>
          <option value="">Unidad…</option>
          {MEDIDAS.map((m) => <option key={m.v} value={m.v}>{m.texto}</option>)}
        </select>
      </div>
    </div>
  );
}

/** Precio grande + dónde; promo y fecha quedan plegados. */
export function CamposPrecio({
  supers, superId, precio, promo, detalle, fecha,
}: {
  supers: { id: string; nombre: string }[]; superId?: string | null; precio?: number | null; promo?: number | null; detalle?: string | null; fecha: string;
}) {
  return (
    <>
      <div className="grid grid-cols-[1fr_1.3fr] gap-2">
        <label className="text-sm font-semibold text-suave">Precio
          <input name="precio" type="number" inputMode="decimal" step="0.01" min="0.01" required defaultValue={precio ?? ""} placeholder="$" className={`${inputCls} num mt-1 text-[18px] font-bold`} />
        </label>
        <label className="text-sm font-semibold text-suave">Dónde
          <select name="supermercado_id" defaultValue={superId ?? ""} className={`${inputCls} mt-1`}>
            <option value="">Elegí</option>
            {supers.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </label>
      </div>
      <details>
        <summary className="cursor-pointer text-sm font-semibold text-marca">¿No está el lugar?</summary>
        <div className="mt-2"><NuevoLugar /></div>
      </details>
      <details open={!!(promo || detalle)}>
        <summary className="cursor-pointer text-sm font-semibold text-marca">Promo u otra fecha</summary>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <input name="precio_promo" type="number" inputMode="decimal" step="0.01" min="0.01" defaultValue={promo ?? ""} placeholder="$ con promo" className={`${inputCls} num`} />
          <input name="promo_detalle" defaultValue={detalle ?? ""} placeholder="Promo (2x1…)" className={inputCls} />
          <input name="fecha" type="date" defaultValue={fecha} className={`${inputCls} col-span-2`} />
        </div>
      </details>
    </>
  );
}

/** Campo para escribir un lugar que no está en la lista (papelera, almacén, etc.). Si se completa, manda sobre el selector. */
export function NuevoLugar() {
  return (
    <label className="block text-sm text-suave">¿No está en la lista? Escribí el nombre del comercio
      <input
        name="nuevo_lugar" placeholder="Ej: Verdulería Don Pepe" autoComplete="off"
        pattern="[^0-9$].*[A-Za-zÁÉÍÓÚáéíóúÑñ]{3,}.*" title="Escribí el nombre del lugar, no un precio ni una cantidad"
        className={`${inputCls} mt-1`}
      />
      <a href="/lugares" className="mt-1 inline-block font-semibold text-marca">¿Cargaste un lugar por error? Borralo acá</a>
    </label>
  );
}
