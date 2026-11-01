import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizar } from "@/lib/formato";

export type PendienteSetto = {
  id: string; item: string; cantidad: string | null; donde: string | null;
  urgente: boolean | null; nota: string | null; created_at: string;
};

export type PendienteConProducto = PendienteSetto & {
  texto: string;                       // clave del alias
  busqueda: string;                    // texto limpio para buscar en el catálogo
  alias: { producto_id: string | null; nombre: string | null; dim: string | null; cant: number | null; termino: string | null; nombreItem: string | null; lugarId?: string | null; rubro?: string | null } | undefined;
  lugar: { id: string; nombre: string } | null;   // donde (o lugar mencionado en el texto) -> súper/lugar de la app
};

/** "Leches - makro" -> "leche"; "Cremas. Feria" -> "crema" */
export function limpiarItem(item: string) {
  let t = item.toLowerCase().split(/\s[-–]\s|\.\s|\(|,/)[0].trim();
  t = t.replace(/\s+/g, " ");
  return t
    .split(" ")
    .map((w) => (w.length > 4 && w.endsWith("es") ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w))
    .join(" ");
}

export const claveAlias = (item: string) => item.trim().toLowerCase().replace(/\s+/g, " ");

type Integracion = { setto_url: string | null; setto_key: string | null; setto_token: string | null };

async function fetchSetto(integ: Integracion | null): Promise<PendienteSetto[] | null> {
  if (!integ?.setto_url || !integ.setto_key || !integ.setto_token) return null;
  const res = await fetch(`${integ.setto_url}/rest/v1/rpc/compras_pendientes`, {
    method: "POST",
    // Las claves nuevas (sb_publishable_...) van solo en "apikey"; las JWT viejas también como Bearer.
    headers: {
      apikey: integ.setto_key,
      "Content-Type": "application/json",
      ...(integ.setto_key.startsWith("sb_") ? {} : { Authorization: `Bearer ${integ.setto_key}` }),
    },
    body: JSON.stringify({ p_token: integ.setto_token }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`No pude leer la lista de Setto (${res.status})`);
  return res.json();
}

/** Lee los pendientes de la lista de compras de la caja de Setto (solo lectura). */
export async function leerPendientesSetto(supabase: SupabaseClient): Promise<PendienteSetto[] | null> {
  const { data } = await supabase.from("integraciones").select("setto_url, setto_key, setto_token").maybeSingle();
  return fetchSetto(data);
}

export async function pendientesConAlias(supabase: SupabaseClient): Promise<PendienteConProducto[] | null> {
  // Todo en paralelo: integración, alias y lugares
  const [{ data: integ }, { data: alias }, { data: lugares }] = await Promise.all([
    supabase.from("integraciones").select("setto_url, setto_key, setto_token").maybeSingle(),
    supabase.from("alias_productos").select("texto, producto_id, termino, nombre, lugar_id, rubro, productos(nombre, dim, cant_base)"),
    supabase.from("supermercados").select("id, nombre").eq("oculto", false),
  ]);
  const pendientes = await fetchSetto(integ);
  if (!pendientes) return null;
  const porNombre = (lugares ?? []).map((l) => ({ ...l, n: normalizar(l.nombre) }));
  const buscarLugar = (p: PendienteSetto) => {
    const donde = normalizar(p.donde);
    if (donde) return porNombre.find((l) => l.n === donde || l.n.startsWith(donde) || donde.startsWith(l.n)) ?? null;
    const texto = normalizar(p.item);
    return porNombre.find((l) => l.n.length > 3 && new RegExp(`\\b${l.n}\\b`).test(texto)) ?? null;
  };
  const mapa = new Map(
    (alias ?? []).map((a) => {
      const prod = a.productos as unknown as { nombre: string; dim: string | null; cant_base: number | null } | null;
      return [a.texto, { producto_id: a.producto_id, nombre: prod?.nombre ?? null, dim: prod?.dim ?? null, cant: prod?.cant_base ?? null, termino: a.termino, nombreItem: a.nombre, lugarId: a.lugar_id as string | null, rubro: a.rubro as string | null }];
    }),
  );
  return pendientes.map((p) => {
    const alias = mapa.get(claveAlias(p.item));
    // El lugar elegido en esta app manda; si no, el "donde" de la caja
    const l = (alias?.lugarId && porNombre.find((x) => x.id === alias.lugarId)) || buscarLugar(p);
    return {
      ...p,
      texto: claveAlias(p.item),
      busqueda: limpiarItem(p.item),
      alias,
      lugar: l ? { id: l.id, nombre: l.nombre } : null,
    };
  });
}

/** Llama una función de escritura de Setto (autorizadas por Isaias el 2026-11-01). Devuelve null si no hay integración. */
async function rpcSetto<T>(supabase: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T | null> {
  const { data: integ } = await supabase.from("integraciones").select("setto_url, setto_key, setto_token").maybeSingle();
  if (!integ?.setto_url || !integ.setto_key || !integ.setto_token) return null;
  const res = await fetch(`${integ.setto_url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: integ.setto_key,
      "Content-Type": "application/json",
      ...(integ.setto_key.startsWith("sb_") ? {} : { Authorization: `Bearer ${integ.setto_key}` }),
    },
    body: JSON.stringify({ p_token: integ.setto_token, ...args }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Setto respondió ${res.status}`);
  return res.json() as Promise<T>;
}

/** Comprado o quitado en la caja de Setto */
export async function actualizarEnSetto(supabase: SupabaseClient, ids: string[], estado: "comprado" | "quitada") {
  if (!ids.length) return 0;
  return Number((await rpcSetto<number>(supabase, "actualizar_compras", { p_ids: ids, p_estado: estado })) ?? 0);
}
export const marcarEnSetto = (supabase: SupabaseClient, ids: string[]) => actualizarEnSetto(supabase, ids, "comprado");

/** Agrega a la caja de Setto (si ya hay uno pendiente con el mismo nombre, no duplica). null = no hay integración. */
export async function agregarEnSetto(supabase: SupabaseClient, item: string, cantidad: string | null = null) {
  return rpcSetto<string>(supabase, "agregar_compra", { p_item: item, p_cantidad: cantidad });
}
