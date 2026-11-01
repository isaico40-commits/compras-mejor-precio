import { crearProducto } from "@/app/actions";
import { Encabezado, Tarjeta, inputCls, btnCls } from "@/components/ui";

export default async function ProductosPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").trim();
  return (
    <main>
      <Encabezado titulo="Nuevo producto" sub="Para lo que no está en los súpers (Makro, feria, mayoristas)" />
      <div className="px-4">
        <Tarjeta className="p-4">
          <form action={crearProducto} className="space-y-3">
            <input name="nombre" required defaultValue={q} placeholder="Nombre (ej: Azúcar común x 10 kg)" className={inputCls} />
            <input name="marca" placeholder="Marca" className={inputCls} />
            <div className="grid grid-cols-2 gap-2">
              <input name="cantidad" type="number" step="any" inputMode="decimal" placeholder="Tamaño (ej: 10)" className={inputCls} />
              <select name="unidad" className={inputCls}>
                <option value="">Unidad</option>
                <option value="kg">kg</option><option value="gr">g</option><option value="lt">litros</option><option value="ml">ml</option><option value="un">unidades</option>
              </select>
            </div>
            <input name="ean" inputMode="numeric" placeholder="Código de barras (opcional)" className={inputCls} />
            <button className={`${btnCls} w-full`}>Crear y cargar precio</button>
          </form>
        </Tarjeta>
      </div>
    </main>
  );
}
