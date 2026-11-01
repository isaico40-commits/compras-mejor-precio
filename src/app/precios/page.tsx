import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { guardarPrecioNuevo, salir } from "@/app/actions";
import { pesos, presentacion, filtroBusqueda } from "@/lib/formato";
import { Encabezado, Tarjeta, inputCls, btnCls, btnSecCls } from "@/components/ui";
import { CamposMedida, CamposPrecio } from "@/components/FormPrecio";

type Prod = { id: string; nombre: string; marca: string | null; dim: string | null; cant_base: number | null };

export default async function PreciosPage({
  searchParams,
}: { searchParams: Promise<{ q?: string; ok?: string; producto?: string; nuevo?: string; s?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const hoy = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

  let mios = supabase
    .from("precios")
    .select("id, precio, precio_promo, fecha, supermercado_id, productos(nombre, dim, cant_base), supermercados(nombre)")
    .eq("cargado_por", user?.id ?? "")
    .order("fecha", { ascending: false }).order("created_at", { ascending: false }).limit(200);
  if (sp.s) mios = mios.eq("supermercado_id", sp.s);

  const [{ data: supers }, { data: resultados }, { data: elegido }, { data: cargados }] = await Promise.all([
    supabase.from("supermercados").select("id, nombre").order("nombre"),
    q
      ? supabase.from("productos").select("id, nombre, marca, dim, cant_base").or(filtroBusqueda(q)).order("nombre").limit(20)
      : Promise.resolve({ data: [] as Prod[] }),
    sp.producto
      ? supabase.from("productos").select("id, nombre, marca, dim, cant_base").eq("id", sp.producto).maybeSingle()
      : Promise.resolve({ data: null as Prod | null }),
    mios,
  ]);
  const formAbierto = !!elegido || sp.nuevo !== undefined;

  return (
    <main>
      <Encabezado titulo="Precios" sub="Los que cargaste vos (Makro, feria, góndola)">
        <form action={salir}><button className="pb-1 text-sm text-suave">Salir</button></form>
      </Encabezado>

      <div className="space-y-5 px-4">
        {sp.ok && <p className="rounded-xl bg-marca-suave p-3 text-sm font-medium text-marca">Listo, precio guardado.</p>}

        {!formAbierto && (
          <Tarjeta className="space-y-3 p-4">
            <p className="font-bold">Cargar un precio</p>
            <form className="flex gap-2">
              <input name="q" defaultValue={q} placeholder="Buscá el producto" className={inputCls} />
              <button className={btnSecCls}>Buscar</button>
            </form>
            {q && (
              <ul className="divide-y divide-linea overflow-hidden rounded-xl border border-linea">
                {(resultados as Prod[] | null)?.map((p) => (
                  <li key={p.id}>
                    <Link href={`/precios?producto=${p.id}`} className="flex justify-between gap-2 px-3 py-2.5 text-sm active:bg-fondo">
                      <span>{p.nombre}</span>
                      <span className="shrink-0 text-suave">{presentacion(p.cant_base, p.dim)}</span>
                    </Link>
                  </li>
                ))}
                {!resultados?.length && <li className="px-3 py-2.5 text-sm text-suave">No está en el catálogo.</li>}
              </ul>
            )}
            <Link href={`/precios?nuevo=${encodeURIComponent(q)}`} className={`${btnCls} block text-center`}>
              {q ? `Crear “${q}”` : "Producto nuevo"}
            </Link>
          </Tarjeta>
        )}

        {formAbierto && (
          <Tarjeta className="p-4">
            <form action={guardarPrecioNuevo} className="space-y-3">
              {elegido ? (
                <>
                  <input type="hidden" name="producto_id" value={elegido.id} />
                  <p className="font-bold">{elegido.nombre}</p>
                  {presentacion(elegido.cant_base, elegido.dim) && <p className="text-sm text-suave">{presentacion(elegido.cant_base, elegido.dim)}</p>}
                </>
              ) : (
                <>
                  <label className="block text-sm font-semibold">Producto
                    <input name="nombre" required defaultValue={sp.nuevo ?? ""} placeholder="Ej: Dulce de leche repostero" className={`${inputCls} mt-1`} />
                  </label>
                  <input name="marca" placeholder="Marca (opcional)" className={inputCls} />
                  <CamposMedida medida="kg" cant={1} />
                </>
              )}
              <CamposPrecio supers={supers ?? []} fecha={hoy} />
              <div className="flex gap-2">
                <Link href="/precios" className={`${btnSecCls} flex-1 text-center`}>Cancelar</Link>
                <button className={`${btnCls} flex-[2]`}>Guardar precio</button>
              </div>
            </form>
          </Tarjeta>
        )}

        <section>
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="font-bold">Precios cargados</h2>
            <form>
              <select name="s" defaultValue={sp.s ?? ""} className="rounded-lg border border-linea bg-tarjeta px-2 py-1 text-sm" aria-label="Filtrar por súper">
                <option value="">Todos</option>
                {supers?.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
              <button className="ml-1 text-sm font-semibold text-marca">Filtrar</button>
            </form>
          </div>
          <ul className="divide-y divide-linea overflow-hidden rounded-2xl border border-linea bg-tarjeta">
            {cargados?.map((c) => {
              const prod = c.productos as unknown as { nombre: string; dim: string | null; cant_base: number | null } | null;
              const sup = c.supermercados as unknown as { nombre: string } | null;
              return (
                <li key={c.id}>
                  <Link href={`/precios/${c.id}`} className="flex items-center justify-between gap-3 px-4 py-3 active:bg-fondo">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{prod?.nombre}</span>
                      <span className="text-sm text-suave">
                        {sup?.nombre}{presentacion(prod?.cant_base, prod?.dim) && ` · ${presentacion(prod?.cant_base, prod?.dim)}`} · {c.fecha.split("-").reverse().slice(0, 2).join("/")}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="num font-semibold">{pesos(c.precio_promo ?? c.precio)}</span>
                      <svg viewBox="0 0 24 24" className="h-4 w-4 text-suave" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 6 6 6-6 6" /></svg>
                    </span>
                  </Link>
                </li>
              );
            })}
            {!cargados?.length && <li className="px-4 py-6 text-center text-sm text-suave">Todavía no cargaste precios.</li>}
          </ul>
          <p className="mt-2 px-1 text-xs text-suave">Los precios de los súpers grandes se actualizan solos todos los días desde Precios Claros.</p>
        </section>
      </div>
    </main>
  );
}
