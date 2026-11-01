import type { SupabaseClient } from "@supabase/supabase-js";
import { pendientesConAlias } from "@/lib/setto";

export type Opcion = {
  orden: number; producto_id: string; nombre: string; dim: string; cant_base: number;
  supermercado_id: string; supermercado: string; precio: number; por_unidad: number | null; fecha: string;
};

export type Entrada = {
  key: string;
  origen: "mio" | "setto";
  itemId: string;              // lista_items.id o caja_compras.id
  titulo: string;
  cantidad: number;
  cantidadTexto: string | null;
  urgente: boolean;
  termino: string;
  dim: string | null;
  producto: { id: string; nombre: string; cant_base: number | null } | null;   // producto fijado
  lugar: { id: string; nombre: string } | null;                                 // dónde lo anotaste
  textoSetto?: string;
  ultimaCompra: string | null;
  frecuencia: number | null;
  // calculado
  opciones: Opcion[];
  fijo: { precio: number; super: string; superId: string; porUnidad: number | null } | null;
  recomendado: { superId: string; super: string; precio: number | null; nombre: string; porUnidad: number | null; dim: string | null; cant: number | null } | null;
  consejo: string | null;
};

export type Grupo = { id: string; nombre: string; entradas: Entrada[]; total: number; anotado: boolean };

const dosPalabras = (s: string | null | undefined) =>
  (s ?? "").split(" ").filter((w) => w.length > 2).slice(0, 2).join(" ");

export async function listaPorDefecto(supabase: SupabaseClient) {
  const { data } = await supabase.from("listas").select("id").order("created_at").limit(1).maybeSingle();
  if (data) return data.id as string;
  const { data: nueva } = await supabase.from("listas").insert({ nombre: "Mi lista" }).select("id").single();
  return nueva?.id as string;
}

/** Junta la lista propia (lo que toca comprar) y los pendientes de Setto, y calcula dónde conviene cada cosa. */
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

  const entradas: Entrada[] = [];
  for (const i of items ?? []) {
    if (!opts.incluirComprados && !toca(i.ultima_compra, i.frecuencia_dias)) continue;
    const p = i.productos as unknown as { id: string; nombre: string; nombre_base: string; dim: string; cant_base: number } | null;
    const l = i.supermercados as unknown as { id: string; nombre: string } | null;
    entradas.push({
      key: `mio-${i.id}`, origen: "mio", itemId: i.id,
      titulo: i.nombre ?? p?.nombre ?? "Producto",
      cantidad: Number(i.cantidad ?? 1), cantidadTexto: null, urgente: false,
      termino: i.termino || i.nombre || dosPalabras(p?.nombre_base),
      dim: p?.dim ?? null,
      producto: p ? { id: p.id, nombre: p.nombre, cant_base: p.cant_base } : null,
      lugar: l, ultimaCompra: i.ultima_compra, frecuencia: i.frecuencia_dias,
      opciones: [], fijo: null, recomendado: null, consejo: null,
    });
  }
  for (const s of settoRes.data ?? []) {
    entradas.push({
      key: `setto-${s.id}`, origen: "setto", itemId: s.id,
      titulo: s.alias?.nombreItem || s.item, cantidad: 1, cantidadTexto: s.cantidad, urgente: !!s.urgente,
      termino: s.alias?.termino || (s.alias?.nombreItem ? s.alias.nombreItem.toLowerCase() : s.alias?.nombre ? dosPalabras(s.alias.nombre.toLowerCase()) : s.busqueda),
      dim: s.alias?.dim ?? null,
      producto: s.alias?.producto_id ? { id: s.alias.producto_id, nombre: s.alias.nombre ?? "", cant_base: null } : null,
      lugar: s.lugar, textoSetto: s.texto, ultimaCompra: null, frecuencia: null,
      opciones: [], fijo: null, recomendado: null, consejo: null,
    });
  }

  // Opciones por término (todas las marcas y presentaciones) y mejor precio del producto fijado
  const [{ data: ops }, { data: fijos }] = await Promise.all([
    entradas.length
      ? supabase.rpc("opciones_lote", { p_terminos: entradas.map((e) => e.termino), p_dims: entradas.map((e) => e.dim), p_limite: 4 })
      : Promise.resolve({ data: [] }),
    (() => {
      const ids = [...new Set(entradas.map((e) => e.producto?.id).filter((x): x is string => !!x))];
      return ids.length ? supabase.rpc("comparar_productos", { p_productos: ids, p_super_id: null }) : Promise.resolve({ data: [] });
    })(),
  ]);
  const { data: prodsFijos } = await supabase
    .from("productos").select("id, cant_base, dim")
    .in("id", entradas.map((e) => e.producto?.id).filter((x): x is string => !!x));
  const cantFijo = new Map((prodsFijos ?? []).map((p) => [p.id, p]));
  const { data: supers } = await supabase.from("supermercados").select("id, nombre");
  const superPorNombre = new Map((supers ?? []).map((s) => [s.nombre, s.id]));

  for (const o of (ops as Opcion[] | null) ?? []) entradas[o.orden - 1]?.opciones.push(o);
  const fijoPorId = new Map(
    ((fijos as { producto_id: string; mejor_precio: number | null; mejor_super: string | null }[] | null) ?? []).map((f) => [f.producto_id, f]),
  );

  for (const e of entradas) {
    const mejor = e.opciones[0];
    if (e.producto) {
      const f = fijoPorId.get(e.producto.id);
      const meta = cantFijo.get(e.producto.id);
      if (f?.mejor_precio != null && f.mejor_super) {
        const pu = meta?.cant_base ? Number(f.mejor_precio) / Number(meta.cant_base) : null;
        e.fijo = { precio: Number(f.mejor_precio), super: f.mejor_super, superId: superPorNombre.get(f.mejor_super) ?? f.mejor_super, porUnidad: pu };
        e.recomendado = { superId: e.fijo.superId, super: f.mejor_super, precio: e.fijo.precio, nombre: e.producto.nombre, porUnidad: pu, dim: meta?.dim ?? null, cant: meta?.cant_base ?? null };
        if (mejor?.por_unidad && pu && Number(mejor.por_unidad) < pu * 0.95 && mejor.producto_id !== e.producto.id) {
          const ahorro = Math.round((1 - Number(mejor.por_unidad) / pu) * 100);
          e.consejo = `${mejor.nombre} en ${mejor.supermercado} sale ${ahorro}% menos por ${mejor.dim === "u" ? "unidad" : mejor.dim === "l" ? "litro" : "kilo"}`;
        }
      }
    }
    if (!e.recomendado && mejor) {
      e.recomendado = {
        superId: mejor.supermercado_id, super: mejor.supermercado, precio: Number(mejor.precio), nombre: mejor.nombre,
        porUnidad: mejor.por_unidad, dim: mejor.dim, cant: Number(mejor.cant_base),
      };
      const chicas = e.opciones.filter((o) => Number(o.cant_base) < Number(mejor.cant_base) && o.por_unidad);
      if (mejor.dim !== "u" && chicas.length && mejor.por_unidad) {
        const chica = chicas[0];
        const ahorro = Math.round((1 - Number(mejor.por_unidad) / Number(chica.por_unidad)) * 100);
        if (ahorro >= 5) e.consejo = `Conviene la presentación grande: ${ahorro}% menos por ${mejor.dim === "l" ? "litro" : "kilo"} que la chica`;
      }
    }
  }

  // Agrupar: lo anotado para un lugar va ahí; si no, al súper más barato
  const grupos = new Map<string, Grupo>();
  for (const e of entradas) {
    let id: string, nombre: string, anotado = false;
    if (e.lugar) { id = e.lugar.id; nombre = e.lugar.nombre; anotado = true; }
    else if (e.recomendado) { id = e.recomendado.superId; nombre = e.recomendado.super; }
    else { id = "sin-precio"; nombre = "Sin precio todavía"; }
    const g = grupos.get(id) ?? { id, nombre, entradas: [], total: 0, anotado };
    g.entradas.push(e);
    if (!e.lugar || e.lugar.id === e.recomendado?.superId) g.total += (e.recomendado?.precio ?? 0) * e.cantidad;
    grupos.set(id, g);
  }
  const orden = [...grupos.values()].sort((a, b) =>
    a.id === "sin-precio" ? 1 : b.id === "sin-precio" ? -1 : b.entradas.length - a.entradas.length,
  );
  for (const g of orden) g.entradas.sort((a, b) => Number(b.urgente) - Number(a.urgente) || a.titulo.localeCompare(b.titulo));
  return { grupos: orden, entradas, settoError: settoRes.error };
}
