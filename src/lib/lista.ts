import type { SupabaseClient } from "@supabase/supabase-js";
import { pendientesConAlias } from "@/lib/setto";
import { presentacion } from "@/lib/formato";

export type Opcion = {
  orden: number; producto_id: string; nombre: string; dim: string; cant_base: number;
  supermercado_id: string; supermercado: string; precio: number; por_unidad: number | null; fecha: string;
};

/** Opción guardada en el análisis (tabla sugerencias) */
type OpcionGuardada = { producto_id: string; nombre: string; super_id: string; super: string; precio: number; cant: number; pu: number | null };
type Analisis = { dim: string | null; n: number; mediana: number | null; chica: number | null; opciones: OpcionGuardada[] };

export type Entrada = {
  key: string;
  origen: "mio" | "setto";
  itemId: string;
  titulo: string;
  cantidad: number;
  cantidadTexto: string | null;
  urgente: boolean;
  termino: string;
  dim: string | null;
  producto: { id: string; nombre: string; cant_base: number | null; dim: string | null } | null;
  lugar: { id: string; nombre: string } | null;
  ultimaCompra: string | null;
  frecuencia: number | null;
  analizando: boolean;
  recomendado: { superId: string; super: string; precio: number | null; nombre: string; porUnidad: number | null; dim: string | null; cant: number | null } | null;
  consejo: string | null;
};

export type Grupo = { id: string; nombre: string; entradas: Entrada[]; total: number; anotado: boolean };

const VIGENCIA_MS = 12 * 3600_000;
const dosPalabras = (s: string | null | undefined) =>
  (s ?? "").split(" ").filter((w) => w.length > 2).slice(0, 2).join(" ");
const palabraDim = (d: string | null) => (d === "l" ? "litro" : d === "u" ? "unidad" : "kilo");

/** Junta tu lista y los pendientes de Setto, y usa el análisis de precios ya guardado. */
export async function armarLista(supabase: SupabaseClient, opts: { incluirComprados?: boolean } = {}) {
  const [{ data: items }, settoRes] = await Promise.all([
    supabase
      .from("lista_items")
      .select("id, nombre, termino, cantidad, frecuencia_dias, ultima_compra, lugar_id, supermercados(id, nombre), productos(id, nombre, nombre_base, dim, cant_base)")
      .order("created_at"),
    pendientesConAlias(supabase).then((r) => ({ data: r, error: null as string | null })).catch((e: Error) => ({ data: null, error: e.message })),
  ]);

  const hoy = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const toca = (u: string | null, f: number | null) => {
    if (!u) return true;
    if (!f) return false;
    const prox = new Date(u); prox.setDate(prox.getDate() + f);
    return prox.toISOString().slice(0, 10) <= hoy;
  };

  const base = { analizando: false, recomendado: null, consejo: null };
  const entradas: Entrada[] = [];
  for (const i of items ?? []) {
    if (!opts.incluirComprados && !toca(i.ultima_compra, i.frecuencia_dias)) continue;
    const p = i.productos as unknown as { id: string; nombre: string; nombre_base: string; dim: string; cant_base: number } | null;
    const l = i.supermercados as unknown as { id: string; nombre: string } | null;
    entradas.push({
      ...base, key: `mio-${i.id}`, origen: "mio", itemId: i.id,
      titulo: i.nombre ?? p?.nombre ?? "Producto",
      cantidad: Number(i.cantidad ?? 1), cantidadTexto: null, urgente: false,
      termino: i.termino || i.nombre || dosPalabras(p?.nombre_base),
      dim: p?.dim ?? null,
      producto: p ? { id: p.id, nombre: p.nombre, cant_base: p.cant_base, dim: p.dim } : null,
      lugar: l, ultimaCompra: i.ultima_compra, frecuencia: i.frecuencia_dias,
    });
  }
  for (const s of settoRes.data ?? []) {
    const a = s.alias;
    entradas.push({
      ...base, key: `setto-${s.id}`, origen: "setto", itemId: s.id,
      titulo: a?.nombreItem || s.item, cantidad: 1, cantidadTexto: s.cantidad, urgente: !!s.urgente,
      termino: a?.termino || a?.nombreItem?.toLowerCase() || (a?.nombre ? dosPalabras(a.nombre.toLowerCase()) : s.busqueda),
      dim: a?.dim ?? null,
      producto: a?.producto_id ? { id: a.producto_id, nombre: a.nombre ?? "", cant_base: a.cant, dim: a.dim } : null,
      lugar: s.lugar, ultimaCompra: null, frecuencia: null,
    });
  }

  // Análisis guardados (1 consulta) + mejor precio de los productos fijados (si hay)
  const idsFijos = [...new Set(entradas.map((e) => e.producto?.id).filter((x): x is string => !!x))];
  const [{ data: guardados }, { data: fijos }] = await Promise.all([
    entradas.length
      ? supabase.rpc("leer_sugerencias", { p_terminos: entradas.map((e) => e.termino), p_dims: entradas.map((e) => e.dim) })
      : Promise.resolve({ data: [] }),
    idsFijos.length ? supabase.rpc("comparar_productos", { p_productos: idsFijos, p_super_id: null }) : Promise.resolve({ data: [] }),
  ]);
  const analisis = new Map(
    ((guardados as { orden: number; resultado: Analisis; calculado_at: string }[] | null) ?? []).map((g) => [g.orden - 1, g]),
  );
  const fijoPorId = new Map(
    ((fijos as { producto_id: string; mejor_precio: number | null; mejor_super: string | null }[] | null) ?? []).map((f) => [f.producto_id, f]),
  );

  const porAnalizar: { termino: string; dim: string | null }[] = [];
  entradas.forEach((e, idx) => {
    const g = analisis.get(idx);
    if (!g || Date.now() - new Date(g.calculado_at).getTime() > VIGENCIA_MS) {
      porAnalizar.push({ termino: e.termino, dim: e.dim });
      if (!g) e.analizando = true;
    }
    const an = g?.resultado;
    const mejor = an?.opciones?.[0];

    if (e.producto) {
      const f = fijoPorId.get(e.producto.id);
      if (f?.mejor_precio != null && f.mejor_super) {
        const pu = e.producto.cant_base ? Number(f.mejor_precio) / Number(e.producto.cant_base) : null;
        e.recomendado = { superId: "", super: f.mejor_super, precio: Number(f.mejor_precio), nombre: e.producto.nombre, porUnidad: pu, dim: e.producto.dim, cant: e.producto.cant_base };
        if (mejor?.pu && pu && Number(mejor.pu) < pu * 0.95 && mejor.producto_id !== e.producto.id) {
          const ahorro = Math.round((1 - Number(mejor.pu) / pu) * 100);
          e.consejo = `En ${mejor.super}, ${mejor.nombre}: ${ahorro}% menos por ${palabraDim(an?.dim ?? null)}`;
        }
      }
    }
    if (!e.recomendado && mejor) {
      e.recomendado = { superId: mejor.super_id, super: mejor.super, precio: Number(mejor.precio), nombre: mejor.nombre, porUnidad: mejor.pu, dim: an?.dim ?? null, cant: Number(mejor.cant) };
    }
    if (!e.consejo && mejor?.pu && an?.mediana && an.n >= 3) {
      const ahorro = Math.round((1 - Number(mejor.pu) / Number(an.mediana)) * 100);
      const grande = an.chica != null && Number(mejor.cant) >= Number(an.chica) * 2;
      if (ahorro >= 8) {
        e.consejo = `En ${mejor.super}${grande ? `, ${presentacion(mejor.cant, an.dim)}` : ""}: ${ahorro}% más barato que el promedio por ${palabraDim(an.dim)}`;
      }
    }
  });

  // Agrupar: lo anotado para un lugar va ahí; si no, al súper más barato
  const { data: supers } = idsFijos.length ? await supabase.from("supermercados").select("id, nombre") : { data: [] };
  const superPorNombre = new Map((supers ?? []).map((s) => [s.nombre, s.id]));
  const grupos = new Map<string, Grupo>();
  for (const e of entradas) {
    if (e.recomendado && !e.recomendado.superId) e.recomendado.superId = superPorNombre.get(e.recomendado.super) ?? e.recomendado.super;
    let id: string, nombre: string, anotado = false;
    if (e.lugar) { id = e.lugar.id; nombre = e.lugar.nombre; anotado = true; }
    else if (e.recomendado) { id = e.recomendado.superId; nombre = e.recomendado.super; }
    else if (e.analizando) { id = "analizando"; nombre = "Buscando el mejor precio…"; }
    else { id = "sin-precio"; nombre = "Sin precio todavía"; }
    const g = grupos.get(id) ?? { id, nombre, entradas: [], total: 0, anotado };
    g.entradas.push(e);
    if (!e.lugar || e.lugar.id === e.recomendado?.superId) g.total += (e.recomendado?.precio ?? 0) * e.cantidad;
    grupos.set(id, g);
  }
  const peso = (g: Grupo) => (g.id === "analizando" ? -2 : g.id === "sin-precio" ? -1 : g.entradas.length);
  const orden = [...grupos.values()].sort((a, b) => (a.id === "analizando" ? -1 : b.id === "analizando" ? 1 : peso(b) - peso(a)));
  for (const g of orden) g.entradas.sort((a, b) => Number(b.urgente) - Number(a.urgente) || a.titulo.localeCompare(b.titulo));
  return { grupos: orden, entradas, settoError: settoRes.error, porAnalizar };
}
