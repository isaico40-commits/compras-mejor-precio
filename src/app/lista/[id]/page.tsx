import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { pesos, filtroBusqueda } from "@/lib/formato";
import { agregarItem, quitarItem } from "@/app/actions";

type Mejor = {
  producto_id: string; producto: string; cantidad: number;
  supermercado_id: string; supermercado: string;
  precio_unitario: number; subtotal: number; fecha: string;
};
type TotalSuper = {
  supermercado_id: string; supermercado: string;
  total: number | null; items_con_precio: number; items_totales: number;
};

export default async function ListaPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string }> }) {
  const { id } = await params;
  const q = ((await searchParams).q ?? "").trim();
  const supabase = await createClient();

  const [{ data: lista }, { data: items }, { data: productos }, { data: mejores }, { data: totales }] = await Promise.all([
    supabase.from("listas").select("id, nombre").eq("id", id).maybeSingle(),
    supabase.from("lista_items").select("id, cantidad, frecuencia_dias, productos(id, nombre, marca, cantidad, unidad)").eq("lista_id", id).order("created_at"),
    q
      ? supabase.from("productos").select("id, nombre, marca, cantidad, unidad").or(filtroBusqueda(q)).order("nombre").limit(30)
      : Promise.resolve({ data: [] as { id: string; nombre: string; marca: string | null; cantidad: number | null; unidad: string | null }[] }),
    supabase.rpc("mejor_precio_por_item", { p_lista_id: id }),
    supabase.rpc("total_lista_por_super", { p_lista_id: id }),
  ]);
  if (!lista) notFound();

  const mejorPorProducto = new Map((mejores as Mejor[] | null)?.map((m) => [m.producto_id, m]));

  // Plan "repartido": cada producto en el súper más barato
  const porSuper = new Map<string, { nombre: string; items: Mejor[]; total: number }>();
  for (const m of (mejores as Mejor[] | null) ?? []) {
    const g = porSuper.get(m.supermercado_id) ?? { nombre: m.supermercado, items: [], total: 0 };
    g.items.push(m);
    g.total += Number(m.subtotal);
    porSuper.set(m.supermercado_id, g);
  }
  const totalRepartido = [...porSuper.values()].reduce((a, g) => a + g.total, 0);
  const completos = ((totales as TotalSuper[] | null) ?? []).filter((t) => t.items_con_precio === t.items_totales && t.total != null);
  const mejorUnSolo = completos.sort((a, b) => Number(a.total) - Number(b.total))[0];

  const desc = (p: { nombre: string; marca: string | null; cantidad: number | null; unidad: string | null }) =>
    [p.nombre, p.marca, p.cantidad && `${p.cantidad}${p.unidad ?? ""}`].filter(Boolean).join(" · ");

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-6">
      <h1 className="text-2xl font-bold">{lista.nombre}</h1>

      {/* Resumen */}
      {!!items?.length && (
        <section className="grid gap-3 sm:grid-cols-2">
          <div className="rounded border bg-white p-4">
            <p className="text-sm text-neutral-500">Comprando cada cosa donde está más barata</p>
            <p className="text-2xl font-bold">{pesos(totalRepartido)}</p>
            <p className="text-sm">{porSuper.size} súper{porSuper.size === 1 ? "" : "s"}</p>
          </div>
          <div className="rounded border bg-white p-4">
            <p className="text-sm text-neutral-500">Todo en un solo súper</p>
            {mejorUnSolo ? (
              <>
                <p className="text-2xl font-bold">{pesos(mejorUnSolo.total)}</p>
                <p className="text-sm">
                  {mejorUnSolo.supermercado} · pagás {pesos(Number(mejorUnSolo.total) - totalRepartido)} más que repartiendo
                </p>
              </>
            ) : (
              <p className="text-sm">Falta cargar precios para comparar la lista completa en un mismo súper.</p>
            )}
          </div>
        </section>
      )}

      {/* Plan de compra */}
      {porSuper.size > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Dónde comprar cada cosa</h2>
          {[...porSuper.entries()].map(([sid, g]) => (
            <div key={sid} className="rounded border bg-white p-4">
              <div className="mb-2 flex justify-between font-semibold">
                <span>{g.nombre}</span><span>{pesos(g.total)}</span>
              </div>
              <ul className="text-sm">
                {g.items.map((m) => (
                  <li key={m.producto_id} className="flex justify-between">
                    <span>{m.cantidad} × {m.producto}</span>
                    <span className="text-neutral-500">{pesos(m.precio_unitario)} c/u · {m.fecha}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {/* Comparativa por súper */}
      {!!totales?.length && !!items?.length && (
        <section>
          <h2 className="mb-2 text-lg font-semibold">Lista completa por súper</h2>
          <table className="w-full rounded border bg-white text-sm">
            <tbody>
              {(totales as TotalSuper[]).map((t) => (
                <tr key={t.supermercado_id} className="border-t">
                  <td className="p-2">{t.supermercado}</td>
                  <td className="p-2 text-right">{pesos(t.total)}</td>
                  <td className="p-2 text-right text-neutral-500">{t.items_con_precio}/{t.items_totales} con precio</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Items */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Productos de la lista</h2>
        <ul className="divide-y rounded border bg-white text-sm">
          {items?.map((i) => {
            const p = i.productos as unknown as { id: string; nombre: string; marca: string | null; cantidad: number | null; unidad: string | null };
            const m = mejorPorProducto.get(p.id);
            return (
              <li key={i.id} className="flex items-center justify-between gap-2 p-3">
                <div>
                  <p>{i.cantidad} × {desc(p)}</p>
                  <p className="text-neutral-500">
                    {m ? `Más barato: ${m.supermercado} ${pesos(m.precio_unitario)}` : "Sin precios cargados"}
                    {i.frecuencia_dias ? ` · cada ${i.frecuencia_dias} días` : ""}
                  </p>
                </div>
                <form action={quitarItem}>
                  <input type="hidden" name="id" value={i.id} />
                  <input type="hidden" name="lista_id" value={id} />
                  <button className="text-red-600">Quitar</button>
                </form>
              </li>
            );
          })}
          {!items?.length && <li className="p-3 text-neutral-500">Agregá los productos que comprás seguido.</li>}
        </ul>

        <form className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="Buscar producto, marca o código de barras" className="flex-1 rounded border p-2" />
          <button className="rounded border px-4 font-semibold">Buscar</button>
        </form>
        {q && (
          <ul className="divide-y rounded border bg-white text-sm">
            {productos?.map((p) => (
              <li key={p.id}>
                <form action={agregarItem} className="flex flex-wrap items-center gap-2 p-2">
                  <input type="hidden" name="lista_id" value={id} />
                  <input type="hidden" name="producto_id" value={p.id} />
                  <span className="min-w-48 flex-1">{desc(p)}</span>
                  <input name="cantidad" type="number" step="any" min="0.01" defaultValue={1} className="w-16 rounded border p-1" title="Cantidad" />
                  <input name="frecuencia_dias" type="number" min="1" placeholder="Cada X días" className="w-28 rounded border p-1" />
                  <button className="rounded bg-emerald-600 px-3 py-1 font-semibold text-white">Agregar</button>
                </form>
              </li>
            ))}
            {!productos?.length && <li className="p-3 text-neutral-500">No encontré “{q}”. Podés crearlo en Productos.</li>}
          </ul>
        )}
      </section>
    </main>
  );
}
