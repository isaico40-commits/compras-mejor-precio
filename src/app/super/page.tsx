import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { armarLista, type Entrada } from "@/lib/lista";
import { pesos, porUnidad, presentacion } from "@/lib/formato";
import { marcarComprado } from "@/app/actions";
import { Encabezado, Pill } from "@/components/ui";

type Aca = { orden: number; producto_id: string; nombre: string; dim: string; cant_base: number; precio: number; por_unidad: number | null };

export default async function SuperPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const superId = (await searchParams).s;
  const supabase = await createClient();
  const { data: supers } = await supabase.from("supermercados").select("id, nombre").order("nombre");

  if (!superId) {
    return (
      <main>
        <Encabezado titulo="¿Dónde estás?" sub="Te muestro qué conviene comprar acá" />
        <ul className="grid grid-cols-2 gap-2 px-4">
          {supers?.map((s) => (
            <li key={s.id}>
              <Link href={`/super?s=${s.id}`} className="block rounded-2xl border border-linea bg-tarjeta px-4 py-4 font-semibold active:bg-marca-suave">
                {s.nombre}
              </Link>
            </li>
          ))}
        </ul>
      </main>
    );
  }

  const nombreSuper = supers?.find((s) => s.id === superId)?.nombre ?? "";
  const { entradas } = await armarLista(supabase);

  // Precio acá: producto fijado -> ese producto; si no -> la opción más barata por kg/l/u de este súper
  const fijados = entradas.filter((e) => e.producto);
  const libres = entradas.map((e, i) => ({ e, i })).filter(({ e }) => !e.producto);
  const [{ data: fijAca }, { data: libAca }] = await Promise.all([
    fijados.length ? supabase.rpc("comparar_productos", { p_productos: fijados.map((e) => e.producto!.id), p_super_id: superId }) : Promise.resolve({ data: [] }),
    libres.length
      ? supabase.rpc("opciones_lote_en_super", { p_terminos: libres.map(({ e }) => e.termino), p_dims: libres.map(({ e }) => e.dim), p_super_id: superId })
      : Promise.resolve({ data: [] }),
  ]);
  const fijMap = new Map(((fijAca as { producto_id: string; precio_aca: number | null }[] | null) ?? []).map((f) => [f.producto_id, f.precio_aca]));
  const libMap = new Map(((libAca as Aca[] | null) ?? []).map((a) => [libres[a.orden - 1].e.key, a]));

  type Fila = { e: Entrada; precio: number | null; nombre: string | null; pu: number | null; dim: string | null; cant: number | null; conviene: boolean };
  const filas: Fila[] = entradas.map((e) => {
    let precio: number | null = null, nombre: string | null = null, pu: number | null = null, dim: string | null = null, cant: number | null = null;
    if (e.producto) {
      const p = fijMap.get(e.producto.id);
      precio = p != null ? Number(p) : null; nombre = e.producto.nombre;
      dim = e.recomendado?.dim ?? null; cant = e.recomendado?.cant ?? null;
      pu = precio != null && cant ? precio / Number(cant) : null;
    } else {
      const a = libMap.get(e.key);
      if (a) { precio = Number(a.precio); nombre = a.nombre; pu = a.por_unidad != null ? Number(a.por_unidad) : null; dim = a.dim; cant = Number(a.cant_base); }
    }
    const mejor = e.recomendado?.porUnidad ?? null;
    const conviene = e.lugar?.id === superId || (pu != null && (mejor == null || pu <= Number(mejor) * 1.03)) || (precio != null && e.recomendado?.superId === superId);
    return { e, precio, nombre, pu, dim, cant, conviene };
  });
  const aca = filas.filter((f) => f.conviene);
  const otro = filas.filter((f) => !f.conviene);
  const total = aca.reduce((t, f) => t + (f.precio ?? 0) * f.e.cantidad, 0);

  return (
    <main>
      <Encabezado titulo={nombreSuper} sub={<>Comprá acá {aca.length} cosas · <span className="num">{pesos(total)}</span></>}>
        <Link href="/super" className="pb-1 text-sm font-semibold text-marca">Cambiar</Link>
      </Encabezado>
      <div className="space-y-6 px-4">
        <Bloque titulo="Comprá acá" filas={aca} tono="verde" superId={superId} />
        {!!otro.length && <Bloque titulo="Mejor en otro lado" filas={otro} tono="naranja" superId={superId} />}
        {!entradas.length && <p className="pt-10 text-center text-suave">Tu lista está vacía.</p>}
      </div>
    </main>
  );

  function Bloque({ titulo, filas, tono, superId }: { titulo: string; filas: Fila[]; tono: "verde" | "naranja"; superId: string }) {
    return (
      <section>
        <h2 className={`mb-2 px-1 text-lg font-bold ${tono === "verde" ? "text-marca" : "text-alerta"}`}>{titulo}</h2>
        <ul className="divide-y divide-linea overflow-hidden rounded-2xl border border-linea bg-tarjeta">
          {filas.map(({ e, precio, nombre, pu, dim, cant }) => (
            <li key={e.key} className="flex items-start gap-3 px-3 py-3">
              {e.origen === "mio" ? (
                <form action={marcarComprado} className="pt-0.5">
                  <input type="hidden" name="id" value={e.itemId} />
                  <button aria-label="Comprado" className="h-7 w-7 rounded-full border-2 border-linea active:border-marca active:bg-marca-suave" />
                </form>
              ) : (
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-fondo text-[10px] font-bold text-suave">S</span>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-2">
                  <p className="font-semibold leading-snug">
                    {e.urgente && <span className="text-alerta">● </span>}
                    {e.cantidad > 1 && <span className="num text-suave">{e.cantidad}× </span>}{e.titulo}
                  </p>
                  <span className="num shrink-0 font-semibold">{precio != null ? pesos(precio) : "—"}</span>
                </div>
                {nombre && (
                  <p className="truncate text-sm text-suave">
                    {nombre !== e.titulo && <>{nombre} · </>}{presentacion(cant, dim) && <>{presentacion(cant, dim)} · </>}
                    <span className="num">{porUnidad(pu, dim)}</span>
                  </p>
                )}
                {e.lugar?.id === superId && <Pill tono="verde">anotado para acá</Pill>}
                {tono === "naranja" && e.recomendado && (
                  <p className="text-sm text-alerta">
                    {e.recomendado.super}: <span className="num">{pesos(e.recomendado.precio)}</span> · {porUnidad(e.recomendado.porUnidad, e.recomendado.dim)}
                    {precio == null && " · acá no hay precio"}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    );
  }
}
