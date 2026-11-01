import type { SupabaseClient } from "@supabase/supabase-js";
import { pendientesConAlias } from "@/lib/setto";
import { presentacion } from "@/lib/formato";
import { detectarRubro, esRubro, RUBROS, type Rubro } from "@/lib/rubros";
import { leerDescuentos, mejorDescuento, hoyAR, textoDescuento, type Descuento } from "@/lib/descuentos";

export type Opcion = {
  orden: number; producto_id: string; nombre: string; dim: string; cant_base: number;
  supermercado_id: string; supermercado: string; precio: number; por_unidad: number | null; fecha: string;
};

/** Opción guardada en el análisis (tabla sugerencias) */
type OpcionGuardada = { producto_id: string; nombre: string; super_id: string; super: string; precio: number; cant: number; pu: number | null };
type Analisis = { dim: string | null; n: number; mediana: number | null; chica: number | null; opciones: OpcionGuardada[]; por_super?: Record<string, { precio: number; pu: number | null }>; v?: number };

export type Entrada = {
  key: string;
  texto?: string;   // clave del alias (ítems de Setto)
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
  rubro: Rubro;
  rubroAuto: boolean;   // detectado por el nombre (no elegido)
  ultimoPago: { precio: number | null; fecha: string; lugar: string | null } | null;
};

/** Cuánto sale todo en un solo súper vs. dividir la compra en dos. */
export type PlanViaje = {
  items: number;
  solo: { super: string; total: number; cubre: number; promo: string | null };
  par: { a: string; b: string; total: number; ahorro: number; enA: string[]; enB: string[]; promoA: string | null; promoB: string | null } | null;
};

export type Grupo = { id: string; nombre: string; entradas: Entrada[]; total: number; anotado: boolean };

/** Misma clave que guarda el historial de compras ("Azúcar  común" -> "azucar comun") */
export const claveCompra = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const VIGENCIA_MS = 12 * 3600_000;
const dosPalabras = (s: string | null | undefined) =>
  (s ?? "").split(" ").filter((w) => w.length > 2).slice(0, 2).join(" ");
const palabraDim = (d: string | null) => (d === "l" ? "litro" : d === "u" ? "unidad" : "kilo");

/** Junta tu lista y los pendientes de Setto, y usa el análisis de precios ya guardado. */
export async function armarLista(supabase: SupabaseClient, opts: { incluirComprados?: boolean } = {}) {
  const [{ data: items }, settoRes] = await Promise.all([
    supabase
      .from("lista_items")
      .select("id, nombre, termino, cantidad, frecuencia_dias, ultima_compra, lugar_id, rubro, supermercados(id, nombre), productos(id, nombre, nombre_base, dim, cant_base)")
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

  const base = { analizando: false, recomendado: null, consejo: null, ultimoPago: null };
  const rubroDe = (elegido: unknown, nombre: string) =>
    esRubro(elegido) ? { rubro: elegido, rubroAuto: false } : { rubro: detectarRubro(nombre), rubroAuto: true };
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
      ...rubroDe(i.rubro, i.nombre ?? p?.nombre ?? ""),
    });
  }
  for (const s of settoRes.data ?? []) {
    const a = s.alias;
    entradas.push({
      ...base, key: `setto-${s.id}`, texto: s.texto, origen: "setto", itemId: s.id,
      titulo: a?.nombreItem || s.item, cantidad: 1, cantidadTexto: s.cantidad, urgente: !!s.urgente,
      termino: a?.termino || a?.nombreItem?.toLowerCase() || (a?.nombre ? dosPalabras(a.nombre.toLowerCase()) : s.busqueda),
      dim: a?.dim ?? null,
      producto: a?.producto_id ? { id: a.producto_id, nombre: a.nombre ?? "", cant_base: a.cant, dim: a.dim } : null,
      lugar: s.lugar, ultimaCompra: null, frecuencia: null,
      ...rubroDe(a?.rubro, a?.nombreItem || s.item),
    });
  }

  // Análisis guardados (1 consulta) + mejor precio de los productos fijados (si hay)
  const idsFijos = [...new Set(entradas.map((e) => e.producto?.id).filter((x): x is string => !!x))];
  const hace30 = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const fuera = entradas.filter((e) => e.rubro !== "super");
  const claves = [...new Set(fuera.map((e) => claveCompra(e.termino || e.titulo)))];
  const [{ data: guardados }, { data: fijos }, { data: supers }, { data: fijosPorSuper }, descuentos, { data: habituales }, { data: pagos }] = await Promise.all([
    entradas.length
      ? supabase.rpc("leer_sugerencias", { p_terminos: entradas.map((e) => e.termino), p_dims: entradas.map((e) => e.dim) })
      : Promise.resolve({ data: [] }),
    idsFijos.length ? supabase.rpc("comparar_productos", { p_productos: idsFijos, p_super_id: null }) : Promise.resolve({ data: [] }),
    supabase.from("supermercados").select("id, nombre"),
    idsFijos.length
      ? supabase.from("precios").select("producto_id, supermercado_id, precio, precio_promo").in("producto_id", idsFijos)
          .gte("fecha", hace30).order("fecha", { ascending: false }).order("created_at", { ascending: false }).limit(3000)
      : Promise.resolve({ data: [] }),
    leerDescuentos(supabase).catch(() => [] as Descuento[]),
    fuera.length ? supabase.from("rubros_habituales").select("rubro, lugar_id, supermercados(id, nombre)") : Promise.resolve({ data: [] }),
    claves.length
      ? supabase.from("compras_historial").select("clave, precio, fecha, supermercados(nombre)").in("clave", claves).order("fecha", { ascending: false }).limit(500)
      : Promise.resolve({ data: [] }),
  ]);
  const habitual = new Map(((habituales as { rubro: string; supermercados: unknown }[] | null) ?? [])
    .map((h) => [h.rubro, h.supermercados as { id: string; nombre: string } | null] as const));
  const ultimoPago = new Map<string, Entrada["ultimoPago"]>();
  for (const p of (pagos as { clave: string; precio: number | null; fecha: string; supermercados: unknown }[] | null) ?? []) {
    if (ultimoPago.has(p.clave)) continue;
    ultimoPago.set(p.clave, { precio: p.precio != null ? Number(p.precio) : null, fecha: p.fecha, lugar: (p.supermercados as { nombre: string } | null)?.nombre ?? null });
  }
  // Último precio de cada producto fijado en cada súper
  const fijoSuper = new Map<string, Map<string, number>>();
  for (const r of (fijosPorSuper as { producto_id: string; supermercado_id: string; precio: number; precio_promo: number | null }[] | null) ?? []) {
    const m = fijoSuper.get(r.producto_id) ?? new Map<string, number>();
    if (!m.has(r.supermercado_id)) m.set(r.supermercado_id, Number(r.precio_promo ?? r.precio));
    fijoSuper.set(r.producto_id, m);
  }
  const analisis = new Map(
    ((guardados as { orden: number; resultado: Analisis; calculado_at: string }[] | null) ?? []).map((g) => [g.orden - 1, g]),
  );
  const fijoPorId = new Map(
    ((fijos as { producto_id: string; mejor_precio: number | null; mejor_super: string | null }[] | null) ?? []).map((f) => [f.producto_id, f]),
  );

  const porAnalizar: { termino: string; dim: string | null }[] = [];
  entradas.forEach((e, idx) => {
    // Verdulería, bazar, otros: no se compara con los súpers. Último precio que pagaste (o el que cargaste para ese lugar).
    if (e.rubro !== "super") {
      if (!e.lugar) { const h = habitual.get(e.rubro); if (h) e.lugar = h; }
      e.ultimoPago = ultimoPago.get(claveCompra(e.termino || e.titulo)) ?? null;
      const cargado = e.producto && e.lugar ? fijoSuper.get(e.producto.id)?.get(e.lugar.id) : undefined;
      const precio = cargado ?? e.ultimoPago?.precio ?? null;
      if (precio != null) {
        e.recomendado = { superId: e.lugar?.id ?? `rubro-${e.rubro}`, super: e.lugar?.nombre ?? "", precio, nombre: e.titulo, porUnidad: null, dim: null, cant: null };
      }
      return;
    }
    const g = analisis.get(idx);
    if (!g || !g.resultado?.por_super || g.resultado?.v !== 2 || Date.now() - new Date(g.calculado_at).getTime() > VIGENCIA_MS) {
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
  const superPorNombre = new Map((supers ?? []).map((s) => [s.nombre, s.id]));
  const grupos = new Map<string, Grupo>();
  for (const e of entradas) {
    if (e.recomendado && !e.recomendado.superId) e.recomendado.superId = superPorNombre.get(e.recomendado.super) ?? e.recomendado.super;
    let id: string, nombre: string, anotado = false;
    if (e.lugar) { id = e.lugar.id; nombre = e.lugar.nombre; anotado = true; }
    else if (e.rubro !== "super") { id = `rubro-${e.rubro}`; nombre = RUBROS.find((r) => r.id === e.rubro)!.grupo; }
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

  // Plan del viaje: precio de cada ítem (sin lugar anotado) en cada súper
  const nombreSuper = new Map((supers ?? []).map((x) => [x.id as string, x.nombre as string]));
  const precios = entradas.filter((e) => !e.lugar && e.rubro === "super").map((e) => {
    const idx = entradas.indexOf(e);
    const m = new Map<string, number>();
    if (e.producto) fijoSuper.get(e.producto.id)?.forEach((p, sid) => m.set(sid, p * e.cantidad));
    else {
      // Comparar por kilo/litro/unidad, llevado al tamaño de la opción recomendada (no paquete chico vs grande)
      const an = analisis.get(idx)?.resultado;
      const ref = Number(an?.opciones?.[0]?.cant ?? 1) || 1;
      for (const [sid, v] of Object.entries(an?.por_super ?? {})) m.set(sid, (v.pu != null ? Number(v.pu) * ref : Number(v.precio)) * e.cantidad);
    }
    return { titulo: e.titulo, m };
  }).filter((x) => x.m.size > 0);
  // Descuento de hoy por súper (banco / billetera): se descuenta del precio para comparar
  const { dia } = hoyAR();
  const promoHoy = new Map<string, Descuento>();
  for (const sid of nombreSuper.keys()) { const d = mejorDescuento(descuentos, sid, dia); if (d) promoHoy.set(sid, d); }
  for (const p of precios) for (const [sid, v] of p.m) { const d = promoHoy.get(sid); if (d) p.m.set(sid, v * (1 - d.porcentaje / 100)); }
  const plan = planDelViaje(precios, nombreSuper, promoHoy);

  return { grupos: orden, entradas, settoError: settoRes.error, porAnalizar, plan, descuentos };
}

function planDelViaje(items: { titulo: string; m: Map<string, number> }[], nombres: Map<string, string>, promos: Map<string, Descuento>): PlanViaje | null {
  const promo = (id: string) => { const d = promos.get(id); return d ? textoDescuento(d) : null; };
  if (items.length < 2) return null;
  const ids = [...new Set(items.flatMap((i) => [...i.m.keys()]))];
  // Un solo súper: el que tiene más cosas y, a igualdad, el más barato
  let solo: { id: string; total: number; cubre: number } | null = null;
  for (const id of ids) {
    let total = 0, cubre = 0;
    for (const i of items) { const p = i.m.get(id); if (p != null) { total += p; cubre++; } }
    if (!solo || cubre > solo.cubre || (cubre === solo.cubre && total < solo.total)) solo = { id, total, cubre };
  }
  if (!solo) return null;
  const base = items.filter((i) => i.m.has(solo!.id));
  // Dos súpers: sobre las mismas cosas, el par que más ahorra
  let par: PlanViaje["par"] = null;
  for (let x = 0; x < ids.length; x++) for (let y = x + 1; y < ids.length; y++) {
    const a = ids[x], b = ids[y];
    let total = 0; const enA: string[] = [], enB: string[] = [];
    let ok = true;
    for (const i of base) {
      const pa = i.m.get(a), pb = i.m.get(b);
      if (pa == null && pb == null) { ok = false; break; }
      if (pb == null || (pa != null && pa <= pb)) { total += pa!; enA.push(i.titulo); } else { total += pb; enB.push(i.titulo); }
    }
    if (!ok || !enA.length || !enB.length) continue;
    const ahorro = solo.total - total;
    if (!par || ahorro > par.ahorro) par = { a: nombres.get(a) ?? a, b: nombres.get(b) ?? b, total, ahorro, enA, enB, promoA: promo(a), promoB: promo(b) };
  }
  // Solo vale la pena si ahorrás al menos $1.500 o 5%
  if (par && (par.ahorro < 1500 && par.ahorro < solo.total * 0.05)) par = null;
  return { items: items.length, solo: { super: nombres.get(solo.id) ?? solo.id, total: solo.total, cubre: solo.cubre, promo: promo(solo.id) }, par };
}
