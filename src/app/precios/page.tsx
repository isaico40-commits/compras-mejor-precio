import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { guardarPrecioNuevo, salir, insumoSetto } from "@/app/actions";
import { pesos, presentacion, filtroBusqueda, porUnidad } from "@/lib/formato";
import { Encabezado, inputCls, btnCls, btnSecCls } from "@/components/ui";
import { Icono } from "@/components/IconoProducto";
import { categoriaDe } from "@/lib/categorias";
import { CamposMedida, CamposPrecio } from "@/components/FormPrecio";
import { armarLista } from "@/lib/lista";

type Prod = { id: string; nombre: string; marca: string | null; dim: string | null; cant_base: number | null };

export default async function PreciosPage({
  searchParams,
}: { searchParams: Promise<{ q?: string; ok?: string; producto?: string; nuevo?: string; s?: string; item?: string; texto?: string; ver?: string; setto?: string }> }) {
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

  const verCargados = sp.ver === "cargados";
  const verSetto = sp.ver === "setto";
  const paraSetto = verSetto || sp.setto === "1";
  const extra = paraSetto ? "&setto=1" : "";
  const [{ data: supers }, { data: resultados }, { data: elegido }, { data: cargados }, lista] = await Promise.all([
    supabase.from("supermercados").select("id, nombre").eq("oculto", false).order("nombre"),
    q
      ? supabase.from("productos").select("id, nombre, marca, dim, cant_base").or(filtroBusqueda(q)).order("nombre").limit(20)
      : Promise.resolve({ data: [] as Prod[] }),
    sp.producto
      ? supabase.from("productos").select("id, nombre, marca, dim, cant_base").eq("id", sp.producto).maybeSingle()
      : Promise.resolve({ data: null as Prod | null }),
    verCargados ? mios : Promise.resolve({ data: [] }),
    !verCargados && !verSetto ? armarLista(supabase).catch(() => null) : Promise.resolve(null),
  ]);
  type Costo = { producto_id: string; nombre: string; precio: number | null; super: string | null; fecha: string | null; dim: string | null; cant_base: number | null; por_unidad: number | null; desde: string };
  const costos = verSetto ? (((await supabase.rpc("costos_setto")).data as Costo[] | null) ?? []) : [];
  const deItem = sp.item || paraSetto ? (
    <>
      {paraSetto && <input type="hidden" name="setto" value="1" />}
      {sp.item && <input type="hidden" name="item" value={sp.item} />}
      {sp.texto && <input type="hidden" name="texto" value={sp.texto} />}
    </>
  ) : null;
  const formAbierto = !!elegido || sp.nuevo !== undefined;

  const fecha = (f: string) => f.split("-").reverse().slice(0, 2).join("/");
  const chip = "inline-flex max-w-full items-center truncate rounded-full px-2 py-0.5 text-[12px] font-semibold";
  const filas = "divide-y divide-linea overflow-hidden rounded-3xl bg-tarjeta shadow-sm ring-1 ring-linea";

  return (
    <main>
      <Encabezado titulo="Precios" sub="Cargá y corregí lo que pagás">
        <form action={salir}><button className="pb-1 text-sm text-suave">Salir</button></form>
      </Encabezado>

      <div className="space-y-5 px-4 pb-28">
        {sp.ok && <p className="rounded-2xl bg-menta px-4 py-3 text-[15px] font-semibold text-menta-tinta">✓ Precio guardado.</p>}

        {/* Cargar un precio: buscar o crear */}
        {!formAbierto && (
          <section className="space-y-3 rounded-3xl bg-tarjeta p-4 shadow-sm ring-1 ring-linea">
            <p className="text-[17px] font-bold">{paraSetto ? "☕ Agregar insumo de Setto" : "Cargar un precio"}</p>
            <form className="flex gap-2">
              {paraSetto && <input type="hidden" name="setto" value="1" />}
              <input name="q" defaultValue={q} placeholder="🔍 Buscá el producto" className={inputCls} />
              <button className={btnSecCls}>Buscar</button>
            </form>
            {q && (
              <ul className="divide-y divide-linea overflow-hidden rounded-2xl ring-1 ring-linea">
                {(resultados as Prod[] | null)?.map((p) => (
                  <li key={p.id}>
                    <Link href={`/precios?producto=${p.id}${extra}`} className="flex items-center gap-3 px-3 py-2.5 active:bg-fondo">
                      <Icono nombre={p.nombre} />
                      <span className="min-w-0 flex-1 text-[15px] font-medium leading-snug">{p.nombre}</span>
                      {presentacion(p.cant_base, p.dim) && <span className={`${chip} shrink-0 bg-fondo text-suave`}>{presentacion(p.cant_base, p.dim)}</span>}
                    </Link>
                  </li>
                ))}
                {!resultados?.length && <li className="px-3 py-3 text-sm text-suave">No está en el catálogo. Crealo abajo.</li>}
              </ul>
            )}
            <Link href={`/precios?nuevo=${encodeURIComponent(q)}${extra}`} className={`${btnCls} block text-center`}>
              {q ? `+ Crear “${q}”` : "+ Producto nuevo"}
            </Link>
          </section>
        )}

        {formAbierto && (
          <section className="overflow-hidden rounded-3xl bg-tarjeta shadow-sm ring-1 ring-linea">
            <form action={guardarPrecioNuevo} className="space-y-3 p-4">
              {deItem}
              {elegido ? (
                <div className="flex items-center gap-3">
                  <input type="hidden" name="producto_id" value={elegido.id} />
                  <Icono nombre={elegido.nombre} />
                  <span className="min-w-0">
                    <span className="block text-[17px] font-bold leading-snug">{elegido.nombre}</span>
                    {presentacion(elegido.cant_base, elegido.dim) && <span className={`${chip} mt-0.5 bg-fondo text-suave`}>{presentacion(elegido.cant_base, elegido.dim)}</span>}
                  </span>
                </div>
              ) : (
                <>
                  <p className="text-[17px] font-bold">Producto nuevo</p>
                  <label className="block text-sm font-semibold text-suave">Marca / producto
                    <input name="nombre" required defaultValue={sp.nuevo ?? ""} placeholder="Ej: Dulce de leche La Serenísima" className={`${inputCls} mt-1`} />
                  </label>
                  <CamposMedida />
                </>
              )}
              <CamposPrecio supers={supers ?? []} fecha={hoy} />
              {sp.item && <p className="text-[13px] text-suave">Queda fijo en tu lista con este precio y este lugar.</p>}
              {paraSetto && <p className="text-[13px] text-suave">☕ Queda como insumo de Setto, con este lugar.</p>}
              <div className="flex gap-2 pt-1">
                <Link href={paraSetto ? "/precios?ver=setto" : "/precios"} className={`${btnSecCls} flex-1 text-center`}>Cancelar</Link>
                <button className={`${btnCls} flex-[2]`}>Guardar precio</button>
              </div>
            </form>
          </section>
        )}

        <div className="grid grid-cols-3 gap-1 rounded-2xl bg-linea/60 p-1 text-[13px] font-semibold">
          <Link href="/precios" className={`rounded-xl py-2 text-center ${!verCargados && !verSetto ? "bg-tarjeta shadow-sm" : "text-suave"}`}>📋 Tu lista</Link>
          <Link href="/precios?ver=setto" className={`rounded-xl py-2 text-center ${verSetto ? "bg-tarjeta shadow-sm" : "text-suave"}`}>☕ Setto</Link>
          <Link href="/precios?ver=cargados" className={`rounded-xl py-2 text-center ${verCargados ? "bg-tarjeta shadow-sm" : "text-suave"}`}>✍️ Cargados</Link>
        </div>

        {verSetto && (
          <section>
            <p className="mb-2 px-1 text-[13px] text-suave">Lo que compra Setto, con su costo actual por kilo, litro o unidad. Tocá uno para cargar un precio nuevo.</p>
            <ul className={filas}>
              {costos.map((c) => (
                <li key={c.producto_id} className="flex items-center">
                  <Link href={`/precios?producto=${c.producto_id}&setto=1`} className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 active:bg-fondo">
                    <Icono nombre={c.nombre} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold">{c.nombre}</span>
                      <span className="mt-0.5 flex flex-wrap gap-1">
                        {c.super && <span className={`${chip} bg-cielo text-cielo-tinta`}>{c.super}</span>}
                        {c.fecha && <span className={`${chip} bg-fondo text-suave`}>{fecha(c.fecha)}</span>}
                        {presentacion(c.cant_base, c.dim) && <span className={`${chip} bg-fondo text-suave`}>{presentacion(c.cant_base, c.dim)}</span>}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      {c.precio != null
                        ? <><span className="num block text-[16px] font-bold">{pesos(Number(c.precio))}</span>
                            {c.por_unidad != null && c.dim !== "u" && <span className="num block text-[12px] font-semibold text-marca">{porUnidad(Number(c.por_unidad), c.dim)}</span>}
                            {c.por_unidad != null && c.dim === "u" && Number(c.cant_base) > 1 && <span className="num block text-[12px] font-semibold text-marca">{pesos(Number(c.por_unidad))} c/u</span>}</>
                        : <span className={`${chip} bg-marca text-white`}>+ Precio</span>}
                    </span>
                  </Link>
                  {c.desde === "insumo" && (
                    <form action={insumoSetto} className="pr-2">
                      <input type="hidden" name="producto_id" value={c.producto_id} />
                      <input type="hidden" name="quitar" value="1" />
                      <button aria-label={`Quitar ${c.nombre} de Setto`} className="h-8 w-8 rounded-full text-suave active:bg-fondo">✕</button>
                    </form>
                  )}
                </li>
              ))}
              {!costos.length && <li className="px-4 py-8 text-center text-sm text-suave">Todavía no hay insumos. Agregalos abajo.</li>}
            </ul>
            <Link href="/precios?setto=1" className={`${btnCls} mt-3 block text-center`}>+ Agregar insumo de Setto</Link>
            <p className="mt-2 px-1 text-[12px] text-suave">Lo que pasaste a la caja de Setto con producto elegido también aparece acá.</p>
          </section>
        )}

        {!verCargados && !verSetto && (
          <section>
            <p className="mb-2 px-1 text-[13px] text-suave">Tocá uno para ver dónde conviene o cargar tu precio.</p>
            <ul className={filas}>
              {lista?.entradas.map((e) => {
                const r = e.recomendado;
                const conPrecio = r?.precio != null && (!e.lugar || e.lugar.id === r.superId);
                return (
                  <li key={e.key}>
                    <Link href={`/item/${e.origen}/${e.itemId}`} className="flex items-center gap-3 px-3 py-2.5 active:bg-fondo">
                      <Icono nombre={e.titulo} cat={categoriaDe(e.titulo, e.rubro, e.categoria).id} setto={e.origen === "setto"} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[16px] font-semibold">{e.titulo}</span>
                        {e.lugar ? <span className={`${chip} mt-0.5 bg-durazno text-durazno-tinta`}>{e.lugar.nombre}</span>
                          : r ? <span className={`${chip} mt-0.5 bg-cielo text-cielo-tinta`}>{r.super}</span>
                          : e.analizando ? <span className={`${chip} mt-0.5 bg-fondo text-suave`}>buscando…</span> : null}
                      </span>
                      {conPrecio
                        ? <span className="num shrink-0 text-[16px] font-bold">{pesos(r!.precio)}</span>
                        : <span className={`${chip} shrink-0 bg-marca text-white`}>+ Cargar</span>}
                    </Link>
                  </li>
                );
              })}
              {!lista?.entradas.length && <li className="px-4 py-8 text-center text-sm text-suave">Tu lista está vacía.</li>}
            </ul>
          </section>
        )}

        {verCargados && (
          <section>
            <div className="-mx-4 mb-2 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
              <Link href="/precios?ver=cargados" className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] font-semibold ${!sp.s ? "bg-tinta text-white" : "bg-tarjeta text-suave ring-1 ring-linea"}`}>Todos</Link>
              {supers?.map((x) => (
                <Link key={x.id} href={`/precios?ver=cargados&s=${x.id}`} className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] font-semibold ${sp.s === x.id ? "bg-tinta text-white" : "bg-tarjeta text-suave ring-1 ring-linea"}`}>{x.nombre}</Link>
              ))}
            </div>
            <ul className={filas}>
              {cargados?.map((c) => {
                const prod = c.productos as unknown as { nombre: string; dim: string | null; cant_base: number | null } | null;
                const sup = c.supermercados as unknown as { nombre: string } | null;
                return (
                  <li key={c.id}>
                    <Link href={`/precios/${c.id}`} className="flex items-center gap-3 px-3 py-2.5 active:bg-fondo">
                      <Icono nombre={prod?.nombre ?? ""} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold">{prod?.nombre}</span>
                        <span className="mt-0.5 flex flex-wrap gap-1">
                          {sup?.nombre && <span className={`${chip} bg-cielo text-cielo-tinta`}>{sup.nombre}</span>}
                          <span className={`${chip} bg-fondo text-suave`}>{fecha(c.fecha)}</span>
                        </span>
                      </span>
                      <span className="num shrink-0 text-[16px] font-bold">{pesos(c.precio_promo ?? c.precio)}</span>
                    </Link>
                  </li>
                );
              })}
              {!cargados?.length && <li className="px-4 py-8 text-center text-sm text-suave">Todavía no cargaste precios{sp.s ? " en este lugar" : ""}.</li>}
            </ul>
            <p className="mt-2 px-1 text-[13px] text-suave">Los súpers grandes se actualizan solos todos los días.</p>
          </section>
        )}
      </div>
    </main>
  );
}
