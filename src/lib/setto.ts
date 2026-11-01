import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizar } from "@/lib/formato";

export type PendienteSetto = {
  id: string; item: string; cantidad: string | null; donde: string | null;
  urgente: boolean | null; nota: string | null; created_at: string;
};

export type PendienteConProducto = PendienteSetto & {
  texto: string;                       // clave del alias
  busqueda: string;                    // texto limpio para buscar en el catálogo
  alias: { producto_id: string | null; nombre: string | null; dim: string | null; termino: string | null } | undefined;
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

/** Lee los pendientes de la lista de compras de la caja de Setto (solo lectura). */
export async function leerPendientesSetto(supabase: SupabaseClient): Promise<PendienteSetto[] | null> {
  const { data: integ } = await supabase.from("integraciones").select("setto_url, setto_key, setto_token").maybeSingle();
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

export async function pendientesConAlias(supabase: SupabaseClient): Promise<PendienteConProducto[] | null> {
  const pendientes = await leerPendientesSetto(supabase);
  if (!pendientes) return null;
  const { data: alias } = await supabase.from("alias_productos").select("texto, producto_id, termino, productos(nombre, dim)");
  const { data: lugares } = await supabase.from("supermercados").select("id, nombre");
  const porNombre = (lugares ?? []).map((l) => ({ ...l, n: normalizar(l.nombre) }));
  const buscarLugar = (p: PendienteSetto) => {
    const donde = normalizar(p.donde);
    if (donde) return porNombre.find((l) => l.n === donde || l.n.startsWith(donde) || donde.startsWith(l.n)) ?? null;
    const texto = normalizar(p.item);
    return porNombre.find((l) => l.n.length > 3 && new RegExp(`\\b${l.n}\\b`).test(texto)) ?? null;
  };
  const mapa = new Map(
    (alias ?? []).map((a) => {
      const prod = a.productos as unknown as { nombre: string; dim: string | null } | null;
      return [a.texto, { producto_id: a.producto_id, nombre: prod?.nombre ?? null, dim: prod?.dim ?? null, termino: a.termino }];
    }),
  );
  return pendientes.map((p) => ({ ...p, texto: claveAlias(p.item), busqueda: limpiarItem(p.item), alias: mapa.get(claveAlias(p.item)),
    lugar: (() => { const l = buscarLugar(p); return l ? { id: l.id, nombre: l.nombre } : null; })() }));
}
