import { createClient } from "@/lib/supabase/server";
import { Encabezado, Pill, Tarjeta } from "@/components/ui";
import { SubirTicket } from "@/components/SubirTicket";
import { pesos } from "@/lib/formato";

export default async function TicketsPage() {
  const supabase = await createClient();
  const [{ data: fotos }, { data: tickets }] = await Promise.all([
    supabase.from("ticket_fotos").select("id, nota, estado, created_at").order("created_at", { ascending: false }).limit(30),
    supabase.from("tickets").select("id, fecha, total, comercio, supermercados(nombre)").order("fecha", { ascending: false }).limit(30),
  ]);

  return (
    <main>
      <Encabezado titulo="Tickets" sub="Sacale foto al salir y se carga solo en tus precios" />
      <div className="space-y-5 px-4">
        <Tarjeta className="p-4"><SubirTicket /></Tarjeta>

        {!!fotos?.length && (
          <section>
            <h2 className="mb-2 px-1 font-bold">Fotos subidas</h2>
            <ul className="divide-y divide-linea overflow-hidden rounded-2xl border border-linea bg-tarjeta">
              {fotos.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{f.nota || "Ticket"}</span>
                    <span className="text-sm text-suave">{new Date(f.created_at).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                  </span>
                  {f.estado === "cargado" ? <Pill tono="verde">cargado</Pill> : <Pill tono="naranja">por cargar</Pill>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {!!tickets?.length && (
          <section>
            <h2 className="mb-2 px-1 font-bold">Tickets cargados</h2>
            <ul className="divide-y divide-linea overflow-hidden rounded-2xl border border-linea bg-tarjeta">
              {tickets.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span>{(t.supermercados as unknown as { nombre: string } | null)?.nombre ?? t.comercio} · {t.fecha.split("-").reverse().slice(0, 2).join("/")}</span>
                  <span className="num font-semibold">{pesos(t.total)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <p className="px-1 text-xs text-suave">Las fotos quedan guardadas acá como respaldo. Para que las cargue a tus precios, mandámelas también por el chat de Claude.</p>
      </div>
    </main>
  );
}
