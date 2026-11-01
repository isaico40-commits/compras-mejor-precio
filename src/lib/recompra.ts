import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizar } from "@/lib/formato";

export type Recompra = { clave: string; nombre: string; cadaDias: number; haceDias: number };

/** Lo que solés comprar cada X días y ya te estaría faltando (según tickets y compras tildadas). */
export async function sugerirRecompra(supabase: SupabaseClient, enLista: string[]): Promise<Recompra[]> {
  const desde = new Date(Date.now() - 365 * 86400_000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from("compras_historial").select("clave, nombre, fecha").gte("fecha", desde).order("fecha", { ascending: false }).limit(2000);
  const grupos = new Map<string, { nombre: string; fechas: Set<string> }>();
  for (const r of data ?? []) {
    const g = grupos.get(r.clave) ?? { nombre: r.nombre, fechas: new Set<string>() };
    g.fechas.add(r.fecha);
    grupos.set(r.clave, g);
  }
  const hoy = Date.now() - 3 * 3600_000;
  const pendientes = enLista.map(normalizar);
  const out: Recompra[] = [];
  for (const [clave, g] of grupos) {
    const fechas = [...g.fechas].sort();
    if (fechas.length < 2) continue;
    const dias = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 86400_000;
    const cada = Math.round(dias(fechas[0], fechas[fechas.length - 1]) / (fechas.length - 1));
    if (cada < 2) continue;
    const hace = Math.floor((hoy - new Date(fechas[fechas.length - 1]).getTime()) / 86400_000);
    if (hace < cada - 1) continue;
    if (pendientes.some((p) => p === clave || p.includes(clave) || clave.includes(p))) continue;
    out.push({ clave, nombre: g.nombre, cadaDias: cada, haceDias: hace });
  }
  return out.sort((a, b) => b.haceDias / b.cadaDias - a.haceDias / a.cadaDias).slice(0, 8);
}
