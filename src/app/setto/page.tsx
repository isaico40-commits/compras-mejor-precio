import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { pendientesConAlias } from "@/lib/setto";
import { vincularAlias, desvincularAlias } from "@/app/actions";

type Sugerencia = { id: string; nombre: string; marca: string | null; cantidad: number | null; unidad: string | null };

export default async function SettoPage({ searchParams }: { searchParams: Promise<{ item?: string; q?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  let pendientes;
  try {
    pendientes = await pendientesConAlias(supabase);
  } catch (e) {
    return <main className="mx-auto max-w-2xl p-4 text-red-600">{(e as Error).message}</main>;
  }
  if (!pendientes) return <main className="mx-auto max-w-2xl p-4">La lista de Setto no está conectada a tu usuario.</main>;

  const sinVincular = pendientes.filter((p) => !p.alias);
  const sugerencias = new Map<string, Sugerencia[]>();
  await Promise.all(
    sinVincular.map(async (p) => {
      const texto = sp.item === p.id && sp.q ? sp.q : p.busqueda;
      const { data } = await supabase.rpc("sugerir_productos", { p_texto: texto, p_limite: 6 });
      sugerencias.set(p.id, (data as Sugerencia[] | null) ?? []);
    }),
  );
  const desc = (s: Sugerencia) => [s.nombre, s.marca, s.cantidad && `${s.cantidad}${s.unidad ?? ""}`].filter(Boolean).join(" · ");

  return (
    <main className="mx-auto max-w-2xl space-y-5 p-4">
      <div>
        <h1 className="text-2xl font-bold">Lista de compras de Setto</h1>
        <p className="text-sm text-neutral-500">
          {pendientes.length} pendientes en la caja · {sinVincular.length} sin vincular. Vinculá cada ítem una vez y después se compara solo en{" "}
          <Link href="/super" className="underline">Estoy en el súper</Link>.
        </p>
      </div>

      {sinVincular.map((p) => (
        <section key={p.id} className="space-y-2 rounded border bg-white p-3">
          <div className="flex justify-between">
            <p className="font-semibold">{p.urgente && <span className="text-red-600">Urgente · </span>}{p.item}</p>
            {p.donde && <span className="text-sm text-neutral-500">{p.donde}</span>}
          </div>
          <ul className="space-y-1 text-sm">
            {sugerencias.get(p.id)?.map((s) => (
              <li key={s.id}>
                <form action={vincularAlias} className="flex items-center justify-between gap-2">
                  <input type="hidden" name="texto" value={p.texto} />
                  <input type="hidden" name="producto_id" value={s.id} />
                  <span>{desc(s)}</span>
                  <button className="shrink-0 rounded bg-emerald-600 px-3 py-1 font-semibold text-white">Es este</button>
                </form>
              </li>
            ))}
            {!sugerencias.get(p.id)?.length && <li className="text-neutral-500">No encontré nada parecido en los súpers.</li>}
          </ul>
          <div className="flex flex-wrap gap-2">
            <form className="flex flex-1 gap-2">
              <input type="hidden" name="item" value={p.id} />
              <input name="q" defaultValue={sp.item === p.id ? sp.q : p.busqueda} className="min-w-0 flex-1 rounded border p-1 text-sm" />
              <button className="rounded border px-3 text-sm">Buscar</button>
            </form>
            <form action={vincularAlias}>
              <input type="hidden" name="texto" value={p.texto} />
              <input type="hidden" name="producto_id" value="" />
              <button className="rounded border px-3 py-1 text-sm text-neutral-600">No está en súpers</button>
            </form>
          </div>
        </section>
      ))}

      {pendientes.some((p) => p.alias) && (
        <section>
          <h2 className="mb-2 font-semibold">Vinculados</h2>
          <ul className="divide-y rounded border bg-white text-sm">
            {pendientes.filter((p) => p.alias).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 p-2">
                <span>{p.item} → <span className="text-neutral-500">{p.alias?.nombre ?? "no está en súpers"}</span></span>
                <form action={desvincularAlias}>
                  <input type="hidden" name="texto" value={p.texto} />
                  <button className="text-red-600">Cambiar</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
