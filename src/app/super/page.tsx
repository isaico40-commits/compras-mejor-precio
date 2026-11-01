import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { pesos } from "@/lib/formato";
import { marcarComprado } from "@/app/actions";

type Fila = {
  item_id: string; producto: string; marca: string | null; cantidad: number;
  frecuencia_dias: number | null; ultima_compra: string | null; toca: boolean;
  precio_aca: number | null; promo_aca: string | null; fecha_aca: string | null;
  mejor_precio: number | null; mejor_super: string | null; mejor_fecha: string | null;
};

export default async function SuperPage({
  searchParams,
}: { searchParams: Promise<{ lista?: string; s?: string; todos?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: listas }, { data: supers }] = await Promise.all([
    supabase.from("listas").select("id, nombre").order("created_at"),
    supabase.from("supermercados").select("id, nombre").order("nombre"),
  ]);
  const listaId = sp.lista ?? listas?.[0]?.id;
  const superId = sp.s;
  const verTodos = sp.todos === "1";

  let filas: Fila[] = [];
  if (listaId && superId) {
    const { data } = await supabase.rpc("comparar_en_super", { p_lista_id: listaId, p_super_id: superId });
    filas = (data as Fila[] | null) ?? [];
  }
  const visibles = verTodos ? filas : filas.filter((f) => f.toca);
  const conviene = (f: Fila) =>
    f.precio_aca != null && (f.mejor_precio == null || Number(f.precio_aca) <= Number(f.mejor_precio));
  const comprarAca = visibles.filter(conviene);
  const enOtro = visibles.filter((f) => !conviene(f));
  const totalAca = comprarAca.reduce((a, f) => a + Number(f.precio_aca) * Number(f.cantidad), 0);
  const superNombre = supers?.find((s) => s.id === superId)?.nombre;
  const qs = (extra: Record<string, string>) =>
    "?" + new URLSearchParams({ ...(listaId ? { lista: listaId } : {}), ...(superId ? { s: superId } : {}), ...extra }).toString();

  return (
    <main className="mx-auto max-w-2xl space-y-5 p-4">
      <h1 className="text-2xl font-bold">Estoy en el súper</h1>

      <form className="grid grid-cols-2 gap-2">
        <select name="s" defaultValue={superId ?? ""} required className="rounded border bg-white p-2">
          <option value="">¿En qué súper estás?</option>
          {supers?.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        <select name="lista" defaultValue={listaId ?? ""} className="rounded border bg-white p-2">
          {listas?.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
        </select>
        <button className="col-span-2 rounded bg-emerald-600 p-2 font-semibold text-white">Ver qué me conviene</button>
      </form>

      {!listas?.length && <p className="text-neutral-500">Primero creá una lista en <Link href="/" className="underline">Mis listas</Link>.</p>}

      {superId && listaId && (
        <>
          <div className="flex items-center justify-between text-sm">
            <span>{visibles.length} {verTodos ? "productos" : "pendientes"} · {filas.length} en la lista</span>
            <Link href={qs(verTodos ? {} : { todos: "1" })} className="underline">
              {verTodos ? "Ver solo lo que toca comprar" : "Ver toda la lista"}
            </Link>
          </div>

          <section className="space-y-2">
            <h2 className="font-semibold text-emerald-700">
              Comprá acá en {superNombre} · {pesos(totalAca)}
            </h2>
            <ul className="divide-y rounded border bg-white text-sm">
              {comprarAca.map((f) => (
                <Item key={f.item_id} f={f}>
                  <span className="font-semibold">{pesos(f.precio_aca)}</span>
                  {f.mejor_precio != null && Number(f.mejor_precio) > Number(f.precio_aca) && (
                    <span className="text-neutral-500"> · {pesos(Number(f.mejor_precio) - Number(f.precio_aca))} menos que {f.mejor_super}</span>
                  )}
                  {f.promo_aca && <span className="text-emerald-700"> · {f.promo_aca}</span>}
                </Item>
              ))}
              {!comprarAca.length && <li className="p-3 text-neutral-500">Nada de la lista conviene acá.</li>}
            </ul>
          </section>

          {!!enOtro.length && (
            <section className="space-y-2">
              <h2 className="font-semibold text-amber-700">Mejor en otro lado</h2>
              <ul className="divide-y rounded border bg-white text-sm">
                {enOtro.map((f) => (
                  <Item key={f.item_id} f={f}>
                    {f.mejor_precio != null ? (
                      <>
                        <span className="font-semibold">{f.mejor_super} {pesos(f.mejor_precio)}</span>
                        {f.precio_aca != null
                          ? <span className="text-neutral-500"> · acá {pesos(f.precio_aca)} (+{pesos(Number(f.precio_aca) - Number(f.mejor_precio))})</span>
                          : <span className="text-neutral-500"> · acá sin precio cargado</span>}
                      </>
                    ) : (
                      <span className="text-neutral-500">Sin precios en ningún súper</span>
                    )}
                  </Item>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}

function Item({ f, children }: { f: Fila; children: React.ReactNode }) {
  const comprado = !f.toca;
  return (
    <li className={`flex items-center justify-between gap-3 p-3 ${comprado ? "opacity-50" : ""}`}>
      <div>
        <p>{f.cantidad} × {f.producto}{f.marca ? ` · ${f.marca}` : ""}</p>
        <p>{children}</p>
      </div>
      <form action={marcarComprado}>
        <input type="hidden" name="id" value={f.item_id} />
        {comprado && <input type="hidden" name="deshacer" value="1" />}
        <button className={`rounded px-3 py-2 text-sm font-semibold ${comprado ? "border" : "bg-emerald-600 text-white"}`}>
          {comprado ? "Deshacer" : "Comprado"}
        </button>
      </form>
    </li>
  );
}
