import { createClient } from "@/lib/supabase/server";
import { armarLista } from "@/lib/lista";
import { sugerirRecompra } from "@/lib/recompra";
import { hoyAR } from "@/lib/descuentos";
import { InicioVista } from "@/components/InicioVista";

export default async function Home() {
  const supabase = await createClient();
  const { grupos, porCategoria, entradas, settoError, porAnalizar, plan, descuentos, alertas, volumen } = await armarLista(supabase);
  const { dia } = hoyAR();
  const promosHoy = descuentos.filter((d) => d.dias.includes(dia));
  const [recompra, { data: supers }] = await Promise.all([
    sugerirRecompra(supabase, entradas.map((e) => e.termino)).catch(() => []),
    supabase.from("supermercados").select("id, nombre").eq("oculto", false).order("nombre"),
  ]);
  // Lo cargado en Setto en las últimas 24 h (ej: la lista pegada antes de que existiera "Casa")
  const desde = Date.now() - 24 * 3600_000;
  const recientesSetto = entradas.filter((e) => e.origen === "setto" && e.creado && new Date(e.creado).getTime() > desde)
    .map((e) => ({ itemId: e.itemId, texto: e.texto ?? "", titulo: e.titulo }));
  const total = grupos.reduce((a, g) => a + g.total, 0);
  const lugares = grupos.filter((g) => g.id !== "sin-precio" && g.id !== "analizando").length;

  return (
    <InicioVista
      porCategoria={porCategoria} entradas={entradas} settoError={settoError ?? null} porAnalizar={porAnalizar} plan={plan}
      alertas={alertas} volumen={volumen} promosHoy={promosHoy} dia={dia} recompra={recompra} supers={supers ?? []}
      recientesSetto={recientesSetto} total={total} lugares={lugares}
    />
  );
}
