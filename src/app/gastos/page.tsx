import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Encabezado, Tarjeta, Titulo, ayudaCls } from "@/components/ui";
import { pesos } from "@/lib/formato";
import { CATEGORIAS, categoriaDe } from "@/lib/categorias";
import { detectarRubro } from "@/lib/rubros";

export const dynamic = "force-dynamic";

type Fila = {
  fecha: string; nombre: string; producto: string | null; monto: number | null; cantidad: number | null; unitario: number | null;
  caro: number | null; lugar: string | null; origen: string; ticket_id: string | null; ticket_total: number | null;
};

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const nombreMes = (m: string) => { const [a, n] = m.split("-"); return `${MESES[Number(n) - 1]} ${a}`; };
const barra: Record<string, string> = { menta: "bg-menta-tinta", cielo: "bg-cielo-tinta", lila: "bg-lila-tinta", durazno: "bg-durazno-tinta", limon: "bg-limon-tinta" };

/** Cuánto gastás por mes y por categoría (tickets + lo que marcás comprado), y cuánto ahorraste. */
export default async function GastosPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const hoy = new Date(Date.now() - 3 * 3600_000);
  const desde = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - 11, 1)).toISOString().slice(0, 10);
  const { data, error } = await supabase.rpc("gastos_detalle", { p_desde: desde });
  const filas = ((data as Fila[] | null) ?? []).map((f) => ({ ...f, monto: Number(f.monto ?? 0), cantidad: Number(f.cantidad ?? 1) }));

  const meses = [...new Set(filas.map((f) => f.fecha.slice(0, 7)))].sort().reverse();
  const mes = sp.mes && meses.includes(sp.mes) ? sp.mes : meses[0];
  const delMes = filas.filter((f) => f.fecha.startsWith(mes ?? "-"));

  // Total pagado: lo que dice cada ticket (ya con descuentos de caja) + lo marcado comprado fuera de tickets
  const tickets = new Map<string, { total: number | null; items: number; lugar: string | null; fecha: string }>();
  let fueraTicket = 0;
  for (const f of delMes) {
    if (f.ticket_id) {
      const t = tickets.get(f.ticket_id) ?? { total: f.ticket_total != null ? Number(f.ticket_total) : null, items: 0, lugar: f.lugar, fecha: f.fecha };
      t.items += f.monto; tickets.set(f.ticket_id, t);
    } else fueraTicket += f.monto;
  }
  const pagadoTickets = [...tickets.values()].reduce((a, t) => a + (t.total ?? t.items), 0);
  const itemsTickets = [...tickets.values()].reduce((a, t) => a + t.items, 0);
  const descuentoCaja = Math.max(0, itemsTickets - pagadoTickets);
  const pagado = pagadoTickets + fueraTicket;

  // Por categoría (sobre el precio de lista de cada ítem)
  const porCat = new Map<string, { total: number; items: Fila[] }>();
  for (const f of delMes) {
    const nombre = f.producto ?? f.nombre;
    const c = categoriaDe(nombre, detectarRubro(nombre));
    const g = porCat.get(c.id) ?? { total: 0, items: [] };
    g.total += f.monto; g.items.push(f); porCat.set(c.id, g);
  }
  const sumaCats = [...porCat.values()].reduce((a, g) => a + g.total, 0) || 1;
  const cats = CATEGORIAS.filter((c) => porCat.has(c.id)).map((c) => ({ c, ...porCat.get(c.id)! })).sort((a, b) => b.total - a.total);

  // Ahorro: contra el súper más caro con precio de ese producto cerca de esa fecha
  const comparables = delMes.filter((f) => f.caro != null && f.unitario != null);
  const ahorro = comparables.reduce((a, f) => a + Math.max(0, (Number(f.caro) - Number(f.unitario)) * f.cantidad), 0);

  // Evolución: total por mes (últimos 6)
  const totalMes = (m: string) => {
    const fs = filas.filter((f) => f.fecha.startsWith(m));
    const ts = new Map<string, number>(); let otro = 0;
    for (const f of fs) if (f.ticket_id) ts.set(f.ticket_id, f.ticket_total != null ? Number(f.ticket_total) : (ts.get(f.ticket_id) ?? 0) + f.monto); else otro += f.monto;
    return [...ts.values()].reduce((a, b) => a + b, 0) + otro;
  };
  const ultimos = meses.slice(0, 6).map((m) => ({ m, total: totalMes(m) }));
  const maxMes = Math.max(1, ...ultimos.map((u) => u.total));

  return (
    <main>
      <Encabezado titulo="Gastos" sub={mes ? `${nombreMes(mes)} · ${pesos(pagado)}` : "Todavía no hay compras"}>
        <Link href="/" className="pb-1 text-sm font-semibold text-marca">Listo</Link>
      </Encabezado>
      <div className="space-y-4 px-4 pb-28">
        {error && <p className="rounded-xl bg-alerta-suave p-3 text-sm text-alerta">No pude leer los gastos: {error.message}</p>}
        {!mes && !error && (
          <Tarjeta className="p-4">
            <p className="text-[15px]">Cuando cargues tickets o toques “Terminar compra” en el súper, acá vas a ver cuánto gastás por mes y por categoría.</p>
          </Tarjeta>
        )}

        {meses.length > 1 && (
          <nav className="-mx-4 flex gap-2 overflow-x-auto px-4">
            {meses.map((m) => (
              <Link key={m} href={`/gastos?mes=${m}`} className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold ${m === mes ? "bg-tinta text-white" : "bg-tarjeta text-suave ring-1 ring-linea"}`}>
                {nombreMes(m)}
              </Link>
            ))}
          </nav>
        )}

        {mes && (
          <Tarjeta tono="menta" className="p-4">
            <Titulo tono="menta">Pagaste en {nombreMes(mes)}</Titulo>
            <p className="num mt-1 text-[28px] font-bold leading-none">{pesos(pagado)}</p>
            <p className={`${ayudaCls} mt-2`}>
              {tickets.size} ticket{tickets.size === 1 ? "" : "s"}{fueraTicket > 0 ? ` + ${pesos(fueraTicket)} marcado como comprado` : ""}
              {descuentoCaja > 0 ? ` · descuentos en caja ${pesos(descuentoCaja)}` : ""}
            </p>
            <p className="mt-3 rounded-xl bg-tarjeta px-3 py-2 text-sm">
              {comparables.length
                ? <>Ahorraste <b className="num">{pesos(ahorro)}</b> contra el súper más caro ({comparables.length} productos con precio para comparar).</>
                : <>Todavía no puedo calcular el ahorro: estas compras no tienen precios de súpers de esa fecha para comparar.</>}
            </p>
          </Tarjeta>
        )}

        {cats.length > 0 && (
          <section>
            <h2 className="mb-2 px-1 text-[15px] font-bold">Por categoría</h2>
            <ul className="divide-y divide-linea overflow-hidden rounded-2xl border border-linea bg-tarjeta">
              {cats.map(({ c, total, items }) => (
                <li key={c.id}>
                  <details className="group px-4 py-3">
                    <summary className="cursor-pointer list-none">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="text-[15px] font-semibold">{c.nombre}</span>
                        <span className="num font-semibold">{pesos(total)}</span>
                      </span>
                      <span className="mt-1.5 flex items-center gap-2">
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-fondo">
                          <span className={`block h-full rounded-full ${barra[c.tono]}`} style={{ width: `${Math.max(2, (total / sumaCats) * 100)}%` }} />
                        </span>
                        <span className="num w-10 text-right text-sm text-suave">{Math.round((total / sumaCats) * 100)}%</span>
                      </span>
                    </summary>
                    <ul className="mt-2 space-y-1 text-sm">
                      {items.sort((a, b) => Number(b.monto) - Number(a.monto)).map((f, i) => (
                        <li key={i} className="flex justify-between gap-3">
                          <span className="min-w-0 truncate">{f.producto ?? f.nombre}<span className="text-suave"> · {f.lugar ?? "—"} · {f.fecha.split("-").reverse().slice(0, 2).join("/")}</span></span>
                          <span className="num shrink-0">{pesos(f.monto)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              ))}
            </ul>
            <p className={`${ayudaCls} mt-2 px-1`}>Las categorías suman el precio de cada producto, antes de los descuentos en caja.</p>
          </section>
        )}

        {ultimos.length > 1 && (
          <section>
            <h2 className="mb-2 px-1 text-[15px] font-bold">Últimos meses</h2>
            <ul className="space-y-2 rounded-2xl border border-linea bg-tarjeta p-4">
              {ultimos.map((u) => (
                <li key={u.m} className="flex items-center gap-3 text-sm">
                  <span className="w-20 shrink-0 capitalize">{nombreMes(u.m).split(" ")[0]}</span>
                  <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-fondo">
                    <span className="block h-full rounded-full bg-cielo-tinta" style={{ width: `${(u.total / maxMes) * 100}%` }} />
                  </span>
                  <span className="num w-24 shrink-0 text-right font-semibold">{pesos(u.total)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
