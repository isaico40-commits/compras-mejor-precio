import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { cargarPrecio, salir } from "@/app/actions";
import { pesos, filtroBusqueda } from "@/lib/formato";
import { Encabezado, Tarjeta, inputCls, btnCls, btnSecCls } from "@/components/ui";

export default async function PreciosPage({ searchParams }: { searchParams: Promise<{ q?: string; ok?: string }> }) {
  const { q: qRaw, ok } = await searchParams;
  const q = (qRaw ?? "").trim();
  const supabase = await createClient();
  const [{ data: productos }, { data: supers }, { data: ultimos }] = await Promise.all([
    q
      ? supabase.from("productos").select("id, nombre, marca").or(filtroBusqueda(q)).order("nombre").limit(50)
      : Promise.resolve({ data: [] as { id: string; nombre: string; marca: string | null }[] }),
    supabase.from("supermercados").select("id, nombre").order("nombre"),
    supabase.from("precios")
      .select("id, precio, precio_promo, fecha, productos(nombre), supermercados(nombre)")
      .neq("fuente", "precios_claros")
      .order("created_at", { ascending: false }).limit(15),
  ]);
  const hoy = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

  return (
    <main>
      <Encabezado titulo="Cargar precio" sub="Para Makro, la feria o lo que veas en góndola">
        <form action={salir}><button className="pb-1 text-sm text-suave">Salir</button></form>
      </Encabezado>
      <div className="space-y-5 px-4">
        <form className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="Buscá el producto" className={inputCls} />
          <button className={btnSecCls}>Buscar</button>
        </form>

        {q && (
          <Tarjeta className="p-4">
            <form action={cargarPrecio} className="space-y-3">
              <select name="producto_id" required className={inputCls}>
                <option value="">{productos?.length ? `Elegí (${productos.length} resultados)` : "Sin resultados"}</option>
                {productos?.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.marca ? ` · ${p.marca}` : ""}</option>)}
              </select>
              <select name="supermercado_id" required className={inputCls}>
                <option value="">Dónde</option>
                {supers?.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input name="precio" type="number" inputMode="decimal" step="0.01" min="0.01" required placeholder="Precio" className={inputCls} />
                <input name="precio_promo" type="number" inputMode="decimal" step="0.01" min="0.01" placeholder="Con promo" className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input name="promo_detalle" placeholder="Promo (2x1…)" className={inputCls} />
                <input name="fecha" type="date" defaultValue={hoy} className={inputCls} />
              </div>
              <button className={`${btnCls} w-full`}>Guardar precio</button>
            </form>
            <Link href={`/productos?q=${encodeURIComponent(q)}`} className="mt-3 block text-center text-sm font-semibold text-marca">
              ¿No está? Crear producto
            </Link>
          </Tarjeta>
        )}
        {ok && <p className="rounded-xl bg-marca-suave p-3 text-sm text-marca">Precio guardado.</p>}

        {!!ultimos?.length && (
          <section>
            <h2 className="mb-2 px-1 font-bold">Tus últimos precios</h2>
            <ul className="divide-y divide-linea overflow-hidden rounded-2xl border border-linea bg-tarjeta text-sm">
              {ultimos.map((u) => {
                const prod = u.productos as unknown as { nombre: string } | null;
                const sup = u.supermercados as unknown as { nombre: string } | null;
                return (
                  <li key={u.id} className="flex justify-between gap-3 px-4 py-3">
                    <span className="min-w-0"><span className="block truncate">{prod?.nombre}</span><span className="text-suave">{sup?.nombre} · {u.fecha}</span></span>
                    <span className="num shrink-0 font-semibold">{pesos(u.precio_promo ?? u.precio)}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
