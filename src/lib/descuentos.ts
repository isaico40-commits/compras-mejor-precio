import type { SupabaseClient } from "@supabase/supabase-js";

export type Descuento = {
  id: string; supermercado_id: string; super: string; dias: number[]; medio: string; porcentaje: number;
  tope: number | null; tope_periodo: string | null; minimo: number | null; detalle: string | null;
  fuente: string | null; verificado: string | null; hasta: string | null;
};

export const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
export const MEDIOS = ["Mercado Pago", "MODO", "BBVA", "Santander", "Brubank", "Otro"];

/** Fecha y día de la semana en Argentina */
export function hoyAR() {
  const d = new Date(Date.now() - 3 * 3600_000);
  return { fecha: d.toISOString().slice(0, 10), dia: d.getUTCDay() };
}

export async function leerDescuentos(supabase: SupabaseClient): Promise<Descuento[]> {
  const { fecha } = hoyAR();
  const { data } = await supabase
    .from("descuentos")
    .select("id, supermercado_id, dias, medio, porcentaje, tope, tope_periodo, minimo, detalle, fuente, verificado, hasta, supermercados(nombre)")
    .or(`hasta.is.null,hasta.gte.${fecha}`)
    .order("porcentaje", { ascending: false });
  return (data ?? []).map((d) => ({
    ...d,
    porcentaje: Number(d.porcentaje),
    tope: d.tope != null ? Number(d.tope) : null,
    minimo: d.minimo != null ? Number(d.minimo) : null,
    super: (d.supermercados as unknown as { nombre: string } | null)?.nombre ?? "",
  })) as Descuento[];
}

/** El mejor descuento de un súper para un día */
export function mejorDescuento(lista: Descuento[], superId: string, dia: number) {
  return lista.filter((d) => d.supermercado_id === superId && d.dias.includes(dia)).sort((a, b) => b.porcentaje - a.porcentaje)[0] ?? null;
}

/** Cuánto te ahorra un descuento sobre un total (respeta tope y mínimo si se conocen) */
export function ahorroCon(d: Descuento | null, total: number) {
  if (!d || total <= 0) return 0;
  if (d.minimo && total < d.minimo) return 0;
  const a = (total * d.porcentaje) / 100;
  return d.tope ? Math.min(a, d.tope) : a;
}

export function textoDescuento(d: Descuento) {
  const tope = d.tope ? ` · tope $${Math.round(d.tope).toLocaleString("es-AR")}${d.tope_periodo ? ` por ${d.tope_periodo}` : ""}` : "";
  return `${d.porcentaje}% con ${d.medio}${tope}`;
}
