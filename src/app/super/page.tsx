import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { armarLista, type Entrada } from "@/lib/lista";
import { pesos, porUnidad, presentacion, normalizar } from "@/lib/formato";
import { Changuito, type FilaSuper } from "@/components/Changuito";
import { leerDescuentos, mejorDescuento, hoyAR, textoDescuento, DIAS } from "@/lib/descuentos";
import { Encabezado, Pill } from "@/components/ui";

type Oportunidad = {
  producto_id: string; nombre: string; base: string | null; dim: string | null; cant: number | null;
  precio: number; promo: boolean; siguiente: number; super_sig: string; n: number; ahorro: number;
};

/** "leches enteras" -> regex que encuentra "leche entera" (palabras sueltas, singular o plural) */
function patron(termino: string) {
  const ws = normalizar(termino).replace(/[^a-z0-9 ]/g, " ").split(" ").filter((w) => w.length > 2)
    .map((w) => (w.length > 4 && w.endsWith("es") ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w));
  return ws.length ? ws.map((w) => new RegExp(`\\b${w}`)) : null;
}

type Aca = { orden: number; producto_id: string; nombre: string; dim: string; cant_base: number; precio: number; por_unidad: number | null };

export default async function SuperPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const superId = (await searchParams).s;
  const supabase = await createClient();
  const [{ data: supers }, descuentos] = await Promise.all([
    supabase.from("supermercados").select("id, nombre").order("nombre"),
    leerDescuentos(supabase).catch(() => []),
  ]);
  const { dia } = hoyAR();

  if (!superId) {
    return (
      <main>
        <Encabezado titulo="¿Dónde estás?" sub="Te muestro qué conviene comprar acá" />
        <ul className="grid grid-cols-2 gap-2 px-4">
          {supers?.map((s) => (
            <li key={s.id}>
              <Link href={`/super?s=${s.id}`} className="block rounded-2xl bg-cielo px-4 py-4 font-semibold text-cielo-tinta active:opacity-80">
                {s.nombre}
                {(() => { const d = mejorDescuento(descuentos, s.id, dia); return d ? <span className="mt-1 block text-sm font-semibold text-marca">Hoy −{d.porcentaje}% {d.medio}</span> : null; })()}
              </Link>
            </li>
          ))}
        </ul>
      </main>
    );
  }

  const nombreSuper = supers?.find((s) => s.id === superId)?.nombre ?? "";
  const promoHoy = mejorDescuento(descuentos, superId, dia);
  const otrosDias = descuentos.filter((d) => d.supermercado_id === superId && !d.dias.includes(dia));
  const [{ entradas: todas }, { data: opsRaw }, { data: historial }] = await Promise.all([
    armarLista(supabase),
    supabase.rpc("oportunidades_en_super", { p_super: superId }),
    supabase.from("sugerencias").select("termino").limit(300),
  ]);

  // Verdulería / bazar / otros: solo aparecen si los anotaste para este lugar
  const entradas = todas.filter((e) => e.rubro === "super" || e.lugar?.id === superId);

  // Oportunidades: lo que acá está más barato que en todos los demás súpers.
  // Primero lo que solés comprar (tu lista + lo que buscaste antes), después el resto.
  const oportunidades = ((opsRaw as Oportunidad[] | null) ?? []);
  const terminos = [...new Set([...entradas.map((e) => e.termino), ...(historial ?? []).map((h) => h.termino as string)])]
    .map(patron).filter((p): p is RegExp[] => !!p);
  const esTuyo = (o: Oportunidad) => { const b = normalizar(o.base ?? o.nombre); return terminos.some((ps) => ps.every((r) => r.test(b))); };
  const opsTuyas = oportunidades.filter(esTuyo).slice(0, 15);
  const opsOtras = oportunidades.filter((o) => !opsTuyas.includes(o)).slice(0, 20);

  // Precio acá: producto fijado -> ese producto; si no -> la opción más barata por kg/l/u de este súper
  const fijados = entradas.filter((e) => e.producto);
  const libres = entradas.map((e, i) => ({ e, i })).filter(({ e }) => !e.producto);
  const [{ data: fijAca }, { data: libAca }] = await Promise.all([
    fijados.length ? supabase.rpc("comparar_productos", { p_productos: fijados.map((e) => e.producto!.id), p_super_id: superId }) : Promise.resolve({ data: [] }),
    libres.length
      ? supabase.rpc("opciones_lote_en_super2", { p_terminos: libres.map(({ e }) => e.termino), p_dims: libres.map(({ e }) => e.dim), p_super_id: superId })
      : Promise.resolve({ data: [] }),
  ]);
  const fijMap = new Map(((fijAca as { producto_id: string; precio_aca: number | null }[] | null) ?? []).map((f) => [f.producto_id, f.precio_aca]));
  const libMap = new Map(((libAca as Aca[] | null) ?? []).map((a) => [libres[a.orden - 1].e.key, a]));

  type Fila = { e: Entrada; precio: number | null; nombre: string | null; pu: number | null; dim: string | null; cant: number | null; conviene: boolean; pid: string | null };
  const filas: Fila[] = entradas.map((e) => {
    let precio: number | null = null, nombre: string | null = null, pu: number | null = null, dim: string | null = null, cant: number | null = null, pid: string | null = e.producto?.id ?? null;
    if (e.producto) {
      const p = fijMap.get(e.producto.id);
      precio = p != null ? Number(p) : null; nombre = e.producto.nombre;
      dim = e.recomendado?.dim ?? null; cant = e.recomendado?.cant ?? null;
      pu = precio != null && cant ? precio / Number(cant) : null;
    } else {
      const a = libMap.get(e.key);
      if (a) { precio = Number(a.precio); nombre = a.nombre; pid = a.producto_id; pu = a.por_unidad != null ? Number(a.por_unidad) : null; dim = a.dim; cant = Number(a.cant_base); }
    }
    const mejor = e.recomendado?.porUnidad ?? null;
    const conviene = e.lugar?.id === superId || (pu != null && (mejor == null || pu <= Number(mejor) * 1.03)) || (precio != null && e.recomendado?.superId === superId);
    return { e, precio, nombre, pu, dim, cant, conviene, pid };
  });
  const aca = filas.filter((f) => f.conviene);
  const otro = filas.filter((f) => !f.conviene);
  const total = aca.reduce((t, f) => t + (f.precio ?? 0) * f.e.cantidad, 0);

  return (
    <main>
      <Encabezado titulo={nombreSuper} sub={<>Comprá acá {aca.length} cosas · <span className="num">{pesos(total)}</span></>}>
        <Link href="/super" className="pb-1 text-sm font-semibold text-marca">Cambiar</Link>
      </Encabezado>
      <div className="space-y-6 px-4 pb-20">
        {promoHoy ? (
          <p className="rounded-2xl bg-limon px-4 py-3 text-sm text-limon-tinta">
            <b>Hoy: {textoDescuento(promoHoy)}</b>{promoHoy.detalle && <span className="block text-sm">{promoHoy.detalle}</span>}
          </p>
        ) : otrosDias.length > 0 && (
          <p className="rounded-2xl bg-durazno px-4 py-3 text-sm text-durazno-tinta">
            Hoy no hay descuento acá. {otrosDias.map((d) => `${d.dias.map((x) => DIAS[x]).join(", ")}: ${textoDescuento(d)}`).join(" · ")}
          </p>
        )}
        <Changuito superId={superId} promo={promoHoy ? { porcentaje: promoHoy.porcentaje, tope: promoHoy.tope, minimo: promoHoy.minimo, medio: promoHoy.medio } : null} bloques={[
          { titulo: "Comprá acá", tono: "verde", filas: aca.map((f) => aFila(f, false)) },
          { titulo: "Mejor en otro lado", tono: "naranja", filas: otro.map((f) => aFila(f, true)) },
        ]} />
        {!entradas.length && <p className="pt-10 text-center text-suave">Tu lista está vacía.</p>}
        {(opsTuyas.length > 0 || opsOtras.length > 0) && (
          <section>
            <h2 className="px-1 text-lg font-bold">Oportunidades acá</h2>
            <p className="mb-2 px-1 text-sm text-suave">Más baratos en {nombreSuper} que en cualquier otro súper.</p>
            {opsTuyas.length > 0 && (
              <>
                <p className="mb-1.5 mt-3 px-1 text-[15px] font-bold text-lila-tinta">De lo que solés comprar</p>
                <ListaOps ops={opsTuyas} />
              </>
            )}
            {opsOtras.length > 0 && (
              <details className="mt-3" open={!opsTuyas.length}>
                <summary className="cursor-pointer px-1 py-1 text-sm font-semibold text-marca">Otras ofertas ({opsOtras.length})</summary>
                <div className="mt-1.5"><ListaOps ops={opsOtras} /></div>
              </details>
            )}
          </section>
        )}
      </div>
    </main>
  );

  function ListaOps({ ops }: { ops: Oportunidad[] }) {
    return (
      <ul className="divide-y divide-linea overflow-hidden rounded-2xl border border-linea bg-tarjeta">
        {ops.map((o) => (
          <li key={o.producto_id} className="flex items-start gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[15px] leading-snug">{o.nombre}</p>
              <p className="text-sm text-suave">
                {o.super_sig}: <span className="num">{pesos(o.siguiente)}</span>
                {presentacion(o.cant, o.dim) && <> · {presentacion(o.cant, o.dim)}</>}
                {o.promo && <span className="ml-1"><Pill tono="naranja">promo</Pill></span>}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="num font-semibold">{pesos(o.precio)}</p>
              <Pill tono="verde">−{o.ahorro}%</Pill>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  function aFila({ e, precio, nombre, pu, dim, cant, pid }: Fila, otroLado: boolean): FilaSuper {
    const pres = presentacion(cant, dim);
    const detalle = nombre ? [nombre !== e.titulo ? nombre : null, pres || null, porUnidad(pu, dim) || null].filter(Boolean).join(" · ") : null;
    return {
      key: e.key, origen: e.origen, itemId: e.itemId, titulo: e.titulo, termino: e.termino, productoId: pid,
      precio: precio != null ? precio * e.cantidad : null, precioTxt: precio != null ? pesos(precio) : "—",
      cantidad: e.cantidad, urgente: e.urgente, detalle: detalle || null, anotado: e.lugar?.id === superId,
      otroLado: otroLado && e.recomendado
        ? `${e.recomendado.super}: ${pesos(e.recomendado.precio)} · ${porUnidad(e.recomendado.porUnidad, e.recomendado.dim)}${precio == null ? " · acá no hay precio" : ""}`
        : null,
    };
  }
}
