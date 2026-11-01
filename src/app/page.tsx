import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { armarLista, type Opcion } from "@/lib/lista";
import { Fila } from "@/components/FilaLista";
import { pesos, porUnidad, presentacion } from "@/lib/formato";
import { agregarALista } from "./actions";
import { Encabezado, Pill, inputCls } from "@/components/ui";

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").trim();
  const supabase = await createClient();
  const { grupos, entradas, settoError } = await armarLista(supabase);
  const total = grupos.reduce((a, g) => a + g.total, 0);
  const supersConPrecio = grupos.filter((g) => g.id !== "sin-precio").length;

  let resultados: Opcion[] = [];
  if (q) {
    const { data } = await supabase.rpc("opciones_termino", { p_termino: q, p_dim: null, p_limite: 8 });
    resultados = (data as Opcion[] | null) ?? [];
  }

  return (
    <main>
      <Encabezado
        titulo="Mi lista"
        sub={entradas.length ? <>{entradas.length} cosas · <span className="num">{pesos(total)}</span> en {supersConPrecio} lugar{supersConPrecio === 1 ? "" : "es"}</> : "Nada pendiente"}
      />

      <div className="px-4">
        <form className="relative">
          <input name="q" defaultValue={q} placeholder="Agregar: azúcar, leche, yerba…" className={`${inputCls} pl-10`} autoComplete="off" />
          <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-suave" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg>
        </form>

        {q && (
          <div className="mt-2 overflow-hidden rounded-2xl border border-linea bg-tarjeta">
            <form action={agregarALista}>
              <input type="hidden" name="nombre" value={q} />
              <button className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left active:bg-fondo">
                <span>
                  <span className="block font-semibold">Agregar “{q}”</span>
                  <span className="text-sm text-suave">Busca la opción más barata de cualquier marca y tamaño</span>
                </span>
                <Pill tono="verde">Recomendado</Pill>
              </button>
            </form>
            {resultados.map((r) => (
              <form key={r.producto_id} action={agregarALista} className="border-t border-linea">
                <input type="hidden" name="producto_id" value={r.producto_id} />
                <button className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left active:bg-fondo">
                  <span className="min-w-0">
                    <span className="block truncate text-[15px]">{r.nombre}</span>
                    <span className="text-sm text-suave">{r.supermercado} · {presentacion(r.cant_base, r.dim)}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="num block font-semibold">{pesos(r.precio)}</span>
                    <span className="num text-xs text-suave">{porUnidad(r.por_unidad, r.dim)}</span>
                  </span>
                </button>
              </form>
            ))}
            <Link href="/" className="block border-t border-linea py-2.5 text-center text-sm text-suave">Cerrar</Link>
          </div>
        )}

        {settoError && <p className="mt-3 rounded-xl bg-alerta-suave p-3 text-sm text-alerta">No pude leer la lista de Setto: {settoError}</p>}

        {!entradas.length && !q && (
          <div className="mt-16 text-center text-suave">
            <p className="text-4xl">🛒</p>
            <p className="mt-2">Escribí arriba lo que necesitás comprar.</p>
          </div>
        )}

        <div className="mt-5 space-y-6">
          {grupos.map((g) => (
            <section key={g.id}>
              <div className="mb-2 flex items-baseline justify-between px-1">
                <h2 className="text-lg font-bold">
                  {g.nombre}
                  {g.anotado && <span className="ml-2 align-middle"><Pill>anotado</Pill></span>}
                </h2>
                {g.total > 0 && <span className="num text-sm font-semibold text-suave">{pesos(g.total)}</span>}
              </div>
              <ul className="divide-y divide-linea overflow-hidden rounded-2xl border border-linea bg-tarjeta">
                {g.entradas.map((e) => <Fila key={e.key} e={e} grupoId={g.id} />)}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
