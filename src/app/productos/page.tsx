import { createClient } from "@/lib/supabase/server";
import { crearProducto } from "@/app/actions";
import { filtroBusqueda } from "@/lib/formato";

export default async function ProductosPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").trim();
  const supabase = await createClient();
  let consulta = supabase.from("productos").select("*").order("nombre").limit(50);
  if (q) consulta = consulta.or(filtroBusqueda(q));
  const { data: productos } = await consulta;

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Productos</h1>
      <form action={crearProducto} className="grid grid-cols-2 gap-2 rounded border bg-white p-4">
        <input name="nombre" required placeholder="Nombre (ej: Leche entera)" className="col-span-2 rounded border p-2" />
        <input name="marca" placeholder="Marca" className="rounded border p-2" />
        <input name="categoria" placeholder="Categoría" className="rounded border p-2" />
        <input name="cantidad" type="number" step="any" placeholder="Tamaño (ej: 1)" className="rounded border p-2" />
        <select name="unidad" className="rounded border p-2">
          <option value="">Unidad</option>
          <option>kg</option><option>g</option><option>l</option><option>ml</option><option>u</option>
        </select>
        <input name="ean" placeholder="Código de barras (opcional)" className="col-span-2 rounded border p-2" />
        <button className="col-span-2 rounded bg-emerald-600 p-2 font-semibold text-white">Agregar producto</button>
      </form>
      <form className="flex gap-2">
        <input name="q" defaultValue={q} placeholder="Buscar producto, marca o código de barras" className="flex-1 rounded border p-2" />
        <button className="rounded border px-4 font-semibold">Buscar</button>
      </form>
      <ul className="divide-y rounded border bg-white text-sm">
        {productos?.map((p) => (
          <li key={p.id} className="p-3">
            {p.nombre} {p.marca && <span className="text-neutral-500">· {p.marca}</span>}
            {p.cantidad && <span className="text-neutral-500"> · {p.cantidad}{p.unidad}</span>}
          </li>
        ))}
      </ul>
    </main>
  );
}
