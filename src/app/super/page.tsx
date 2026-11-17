import Link from "next/link";
import { ElegirSuper } from "@/components/ElegirSuper";
import { createClient } from "@/lib/supabase/server";
import { armarLista, type Entrada } from "@/lib/lista";
import { pesos, porUnidad, presentacion, normalizar } from "@/lib/formato";
import { Suspense } from "react";
import { categoriaDe } from "@/lib/categorias";
import { ModoSuper, type FilaLista } from "@/components/ModoSuper";
import { leerDescuentos, mejorDescuento, hoyAR, textoDescuento, DIAS } from "@/lib/descuentos";
import { Encabezado } from "@/components/ui";
import { OfertasSuper, type OfertaSuper } from "@/components/OfertasSuper";

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
    supabase.from("supermercados").select("id, nombre").eq("oculto", false).order("nombre"),
    leerDescuentos(supabase).catch(() => []),
  ]);
  const { dia } = hoyAR();

  if (!superId) {
    return (
      <main>
        <Encabezado titulo="¿Dónde estás?" sub="Te muestro qué conviene comprar acá" />
        <ElegirSuper supers={(supers ?? []).map((s) => {
          const d = mejorDescuento(descuentos, s.id, dia);
          return { id: s.id, nombre: s.nombre, promo: d ? `−${d.porcentaje}% ${d.medio}` : null };
        })} />
      </main>
    );
  }

  const nombreSuper = supers?.find((s) => s.id === superId)?.nombre ?? "";
  const promoHoy = mejorDescuento(descuentos, superId, dia);
  const otrosDias = descuentos.filter((d) => d.supermercado_id === superId && !d.dias.includes(dia));
  const { entradas: todas } = await armarLista(supabase);

  // Verdulería / bazar / otros: solo aparecen si los anotaste para este lugar
  const entradas = todas.filter((e) => e.rubro === "super" || e.lugar?.id === superId);

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

  return (
    <main>
      <Encabezado titulo={nombreSuper} sub={promoHoy?.detalle ?? undefined}>
        <Link href="/super" className="pb-1 text-sm font-semibold text-marca">Cambiar</Link>
      </Encabezado>
      <div className="space-y-4 pb-44 pt-1">
        {!promoHoy && otrosDias.length > 0 && (
          <p className="mx-4 rounded-2xl bg-limon px-4 py-2.5 text-sm text-limon-tinta">
            💡 Descuento acá: {otrosDias.map((d) => `${d.dias.map((x) => DIAS[x]).join(", ")} ${textoDescuento(d)}`).join(" · ")}
          </p>
        )}
        <ModoSuper
          superId={superId}
          nombreSuper={nombreSuper}
          promo={promoHoy ? { porcentaje: promoHoy.porcentaje, tope: promoHoy.tope, minimo: promoHoy.minimo, medio: promoHoy.medio } : null}
          filas={filas.map(aFila)}
          abajo={
            <Suspense fallback={<p className="px-1 text-sm text-suave">Buscando ofertas de {nombreSuper}…</p>}>
              <Oportunidades superId={superId} nombreSuper={nombreSuper} terminos={entradas.map((e) => e.termino)} />
            </Suspense>
          }
        />
        {!entradas.length && <p className="px-4 pt-2 text-center text-suave">Tu lista está vacía. Igual podés escanear lo que vas llevando.</p>}
      </div>
    </main>
  );

  function aFila({ e, precio, nombre, pu, dim, cant, pid, conviene }: Fila): FilaLista {
    const pres = presentacion(cant, dim);
    const detalle = nombre ? [nombre !== e.titulo ? nombre : null, pres || null, porUnidad(pu, dim) || null].filter(Boolean).join(" · ") : null;
    const r = e.recomendado;
    // Cuánto pagás de más acá: por kg/l/u contra el mejor lugar
    const deMas = !conviene && r?.porUnidad != null && pu != null && cant
      ? Math.max(0, (pu - Number(r.porUnidad)) * Number(cant) * e.cantidad) : 0;
    return {
      key: e.key, origen: e.origen, itemId: e.itemId, titulo: e.titulo, termino: e.termino, productoId: pid,
      precio, cantidad: e.cantidad, urgente: e.urgente, detalle: detalle || null, anotado: e.lugar?.id === superId, conviene,
      otroLado: !conviene && r
        ? `${r.super}: ${pesos(r.precio)}${r.porUnidad != null ? ` · ${porUnidad(r.porUnidad, r.dim)}` : ""}${precio == null ? " · acá no hay precio" : ""}`
        : null,
      deMas: Math.round(deMas),
      cat: categoriaDe(e.titulo, e.rubro, e.categoria).id,
    };
  }
}

/** Ofertas del súper: se cargan después, para que la lista aparezca enseguida. */
async function Oportunidades({ superId, nombreSuper, terminos: terms }: { superId: string; nombreSuper: string; terminos: string[] }) {
  const supabase = await createClient();
  const [{ data: opsRaw }, { data: historial }] = await Promise.all([
    supabase.rpc("oportunidades_en_super", { p_super: superId }),
    supabase.from("sugerencias").select("termino").limit(300),
  ]);
  const oportunidades = ((opsRaw as Oportunidad[] | null) ?? []);
  const terminos = [...new Set([...terms, ...(historial ?? []).map((h) => h.termino as string)])]
    .map(patron).filter((p): p is RegExp[] => !!p);
  const esTuyo = (o: Oportunidad) => { const b = normalizar(o.base ?? o.nombre); return terminos.some((ps) => ps.every((r) => r.test(b))); };
  const opsTuyas = oportunidades.filter(esTuyo).slice(0, 15);
  const opsOtras = oportunidades.filter((o) => !opsTuyas.includes(o)).slice(0, 20);
  if (!opsTuyas.length && !opsOtras.length) return null;
  const a = (o: Oportunidad): OfertaSuper => ({ producto_id: o.producto_id, nombre: o.nombre, precio: Number(o.precio), siguiente: Number(o.siguiente), super_sig: o.super_sig, ahorro: o.ahorro, promo: o.promo, pres: presentacion(o.cant, o.dim) || null });
  return <OfertasSuper nombreSuper={nombreSuper} tuyas={opsTuyas.map(a)} otras={opsOtras.map(a)} />;
}
