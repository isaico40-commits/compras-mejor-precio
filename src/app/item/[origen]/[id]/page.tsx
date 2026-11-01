import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { pendientesConAlias, limpiarItem } from "@/lib/setto";
import { pesos, porUnidad, presentacion } from "@/lib/formato";
import { guardarItem, borrarItem, guardarSetto } from "@/app/actions";
import { Encabezado, Pill, Tarjeta, inputCls, btnCls, btnSecCls } from "@/components/ui";
import type { Opcion } from "@/lib/lista";
import { NuevoLugar } from "@/components/FormPrecio";

export default async function ItemPage({ params }: { params: Promise<{ origen: string; id: string }> }) {
  const { origen, id } = await params;
  const supabase = await createClient();
  const esMio = origen === "mio";

  let titulo = "", termino = "", dim: string | null = null, productoId: string | null = null, productoNombre: string | null = null;
  let cantidad = 1, frecuencia: number | null = null, lugarId: string | null = null, texto = "", donde: string | null = null, lugarSetto: string | null = null;

  if (esMio) {
    const { data: i } = await supabase
      .from("lista_items")
      .select("id, nombre, termino, cantidad, frecuencia_dias, lugar_id, productos(id, nombre, nombre_base, dim)")
      .eq("id", id).maybeSingle();
    if (!i) notFound();
    const p = i.productos as unknown as { id: string; nombre: string; nombre_base: string; dim: string } | null;
    titulo = i.nombre ?? p?.nombre ?? "";
    termino = i.termino || i.nombre || (p?.nombre_base ?? "").split(" ").filter((w) => w.length > 2).slice(0, 2).join(" ");
    dim = p?.dim ?? null; productoId = p?.id ?? null; productoNombre = p?.nombre ?? null;
    cantidad = Number(i.cantidad); frecuencia = i.frecuencia_dias; lugarId = i.lugar_id;
  } else {
    const pend = await pendientesConAlias(supabase);
    const s = pend?.find((x) => x.id === id);
    if (!s) notFound();
    titulo = s.alias?.nombreItem || s.item; texto = s.texto; donde = s.lugar?.nombre ?? s.donde; lugarSetto = s.lugar?.id ?? null;
    termino = s.alias?.termino || (s.alias?.nombreItem?.toLowerCase() ?? "") || s.busqueda || limpiarItem(s.item);
    dim = s.alias?.dim ?? null; productoId = s.alias?.producto_id ?? null; productoNombre = s.alias?.nombre ?? null;
  }

  const [{ data: ops }, { data: lugares }] = await Promise.all([
    supabase.rpc("opciones_termino", { p_termino: termino, p_dim: dim, p_limite: 10 }),
    supabase.from("supermercados").select("id, nombre").order("nombre"),
  ]);
  const opciones = (ops as Opcion[] | null) ?? [];
  const guardar = esMio ? guardarItem : guardarSetto;
  const ocultos = (
    <>
      <input type="hidden" name="id" value={id} />
      {!esMio && <input type="hidden" name="texto" value={texto} />}
    </>
  );

  return (
    <main>
      <Encabezado titulo={titulo} sub={esMio ? "De tu lista" : `De la caja de Setto${donde ? ` · ${donde}` : ""}`}>
        <Link href="/" className="pb-1 text-sm font-semibold text-marca">Listo</Link>
      </Encabezado>

      <div className="space-y-5 px-4">
        <Tarjeta className="p-4">
          <form action={guardar} className="space-y-2">
            {ocultos}
            <label className="block text-sm font-semibold">Nombre</label>
            <div className="flex gap-2">
              <input name="nombre" defaultValue={titulo} className={inputCls} />
              <button className={btnSecCls}>Guardar</button>
            </div>
            {!esMio && <p className="text-xs text-suave">Solo cambia acá. En la caja de Setto sigue como lo escribiste.</p>}
          </form>
        </Tarjeta>

        <Tarjeta className="p-4">
          <form action={guardar} className="space-y-2">
            {ocultos}
            <label className="block text-sm font-semibold">Buscar como</label>
            <div className="flex gap-2">
              <input name="termino" defaultValue={termino} className={inputCls} />
              <button className={btnSecCls}>Buscar</button>
            </div>
            <p className="text-xs text-suave">Usá palabras genéricas: “azucar comun”, “leche entera”, “crema de leche”.</p>
          </form>
        </Tarjeta>

        <Link
          href={`/precios?nuevo=${encodeURIComponent(titulo)}&item=${origen}:${id}${texto ? `&texto=${encodeURIComponent(texto)}` : ""}`}
          className="flex items-center justify-between rounded-2xl border border-linea bg-tarjeta px-4 py-3 active:bg-fondo"
        >
          <span>
            <span className="block font-semibold">Cargar mi precio</span>
            <span className="text-sm text-suave">Si lo comprás en un lugar que no está (papelera, almacén…)</span>
          </span>
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-suave" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 6 6 6-6 6" /></svg>
        </Link>

        <section>
          <h2 className="mb-2 px-1 font-bold">Opciones más baratas por {dim === "l" ? "litro" : dim === "u" ? "unidad" : "kilo"}</h2>
          {productoId && (
            <div className="mb-2 flex items-center justify-between rounded-2xl bg-marca-suave px-4 py-3 text-sm">
              <span>Fijado: <b>{productoNombre}</b></span>
              <form action={guardar}>
                {ocultos}
                <input type="hidden" name="producto_id" value="" />
                <button className="font-semibold text-marca">Cualquier marca</button>
              </form>
            </div>
          )}
          <ul className="divide-y divide-linea overflow-hidden rounded-2xl border border-linea bg-tarjeta">
            {opciones.map((o, i) => (
              <li key={o.producto_id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] leading-snug">{o.nombre}</p>
                  <p className="text-sm text-suave">
                    {o.supermercado}{presentacion(o.cant_base, o.dim) && ` · ${presentacion(o.cant_base, o.dim)}`}
                    {i === 0 && <span className="ml-1"><Pill tono="verde">más barato</Pill></span>}
                  </p>
                </div>
                <div className="text-right">
                  <p className="num font-semibold">{pesos(o.precio)}</p>
                  <p className="num text-xs text-suave">{porUnidad(o.por_unidad, o.dim)}</p>
                </div>
                {o.producto_id !== productoId && (
                  <form action={guardar}>
                    {ocultos}
                    <input type="hidden" name="producto_id" value={o.producto_id} />
                    <button className="rounded-lg border border-linea px-2 py-1 text-xs font-semibold">Fijar</button>
                  </form>
                )}
              </li>
            ))}
            {!opciones.length && <li className="px-4 py-6 text-center text-sm text-suave">No encontré “{termino}” en los súpers. Probá con otra palabra.</li>}
          </ul>
        </section>

        {esMio && (
          <Tarjeta className="p-4">
            <form action={guardarItem} className="space-y-3">
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="volver" value="1" />
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm font-semibold">Cantidad
                  <input name="cantidad" type="number" step="any" min="0.01" defaultValue={cantidad} className={`${inputCls} mt-1`} />
                </label>
                <label className="text-sm font-semibold">Cada cuántos días
                  <input name="frecuencia_dias" type="number" min="1" defaultValue={frecuencia ?? ""} placeholder="—" className={`${inputCls} mt-1`} />
                </label>
              </div>
              <label className="block text-sm font-semibold">Dónde lo comprás
                <select name="lugar_id" defaultValue={lugarId ?? ""} className={`${inputCls} mt-1`}>
                  <option value="">Donde esté más barato</option>
                  {lugares?.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                </select>
              </label>
              <NuevoLugar />
              <button className={`${btnCls} w-full`}>Guardar</button>
            </form>
            <form action={borrarItem} className="mt-3">
              <input type="hidden" name="id" value={id} />
              <button className="w-full py-2 text-sm font-semibold text-red-600">Quitar de la lista</button>
            </form>
          </Tarjeta>
        )}
        {!esMio && (
          <Tarjeta className="p-4">
            <form action={guardarSetto} className="space-y-3">
              {ocultos}
              <input type="hidden" name="volver" value="1" />
              <label className="block text-sm font-semibold">Dónde lo comprás
                <select name="lugar_id" defaultValue={lugarSetto ?? ""} className={`${inputCls} mt-1`}>
                  <option value="">Donde esté más barato</option>
                  {lugares?.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                </select>
              </label>
              <NuevoLugar />
              <button className={`${btnCls} w-full`}>Guardar</button>
            </form>
          </Tarjeta>
        )}
        {!esMio && <p className="px-1 text-sm text-suave">Para tachar este ítem marcalo como comprado en la caja de Setto.</p>}
      </div>
    </main>
  );
}
