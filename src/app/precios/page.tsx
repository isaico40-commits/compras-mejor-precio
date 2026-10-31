import { createClient } from "@/lib/supabase/server";
import { cargarPrecio } from "@/app/actions";
import { pesos } from "@/lib/formato";

export default async function PreciosPage() {
  const supabase = await createClient();
  const [{ data: productos }, { data: supers }, { data: ultimos }] = await Promise.all([
    supabase.from("productos").select("id, nombre, marca").order("nombre"),
    supabase.from("supermercados").select("id, nombre").order("nombre"),
    supabase.from("precios")
      .select("id, precio, precio_promo, promo_detalle, fecha, productos(nombre), supermercados(nombre)")
      .order("created_at", { ascending: false }).limit(30),
  ]);
  const hoy = new Date().toISOString().slice(0, 10);

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Cargar precio</h1>
      <form action={cargarPrecio} className="grid grid-cols-2 gap-2 rounded border bg-white p-4">
        <select name="producto_id" required className="col-span-2 rounded border p-2">
          <option value="">Producto</option>
          {productos?.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.marca ? ` · ${p.marca}` : ""}</option>)}
        </select>
        <select name="supermercado_id" required className="col-span-2 rounded border p-2">
          <option value="">Súper</option>
          {supers?.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        <input name="precio" type="number" step="0.01" min="0.01" required placeholder="Precio de lista" className="rounded border p-2" />
        <input name="precio_promo" type="number" step="0.01" min="0.01" placeholder="Precio con promo" className="rounded border p-2" />
        <input name="promo_detalle" placeholder="Promo (ej: 2x1, 30% jueves)" className="rounded border p-2" />
        <input name="fecha" type="date" defaultValue={hoy} className="rounded border p-2" />
        <button className="col-span-2 rounded bg-emerald-600 p-2 font-semibold text-white">Guardar precio</button>
      </form>

      <h2 className="text-lg font-semibold">Últimos cargados</h2>
      <ul className="divide-y rounded border bg-white text-sm">
        {ultimos?.map((u) => {
          const prod = u.productos as unknown as { nombre: string } | null;
          const sup = u.supermercados as unknown as { nombre: string } | null;
          return (
            <li key={u.id} className="flex justify-between p-3">
              <span>{prod?.nombre} · {sup?.nombre}</span>
              <span>
                {u.precio_promo ? <><s className="text-neutral-400">{pesos(u.precio)}</s> {pesos(u.precio_promo)}</> : pesos(u.precio)}
                <span className="text-neutral-500"> · {u.fecha}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
