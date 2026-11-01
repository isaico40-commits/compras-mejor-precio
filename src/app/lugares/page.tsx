import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Encabezado } from "@/components/ui";
import { BorrarLugar } from "@/components/BorrarLugar";

export const dynamic = "force-dynamic";

/** Lugares cargados: los que tienen precios de Precios Claros no se pueden borrar. */
export default async function LugaresPage() {
  const supabase = await createClient();
  const { data: lugares } = await supabase.from("supermercados").select("id, nombre").eq("oculto", false).order("nombre");
  return (
    <main>
      <Encabezado titulo="Lugares" sub="Borrá los que cargaste por error">
        <Link href="/" className="pb-1 text-sm font-semibold text-marca">Listo</Link>
      </Encabezado>
      <div className="space-y-3 px-4 pb-24">
        <ul className="divide-y divide-linea overflow-hidden rounded-2xl border border-linea bg-tarjeta">
          {lugares?.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[15px] font-semibold">{l.nombre}</span>
              <BorrarLugar id={l.id} nombre={l.nombre} />
            </li>
          ))}
        </ul>
        <p className="px-1 text-sm text-suave">Los súpers con precios o descuentos cargados no se pueden borrar: si lo intentás, te aviso.</p>
      </div>
    </main>
  );
}
