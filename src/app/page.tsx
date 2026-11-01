import { createClient } from "@/lib/supabase/server";
import { armarLista } from "@/lib/lista";
import { pesos } from "@/lib/formato";
import { Fila } from "@/components/FilaLista";
import { AgregarItem } from "@/components/AgregarItem";
import { AutoAnalizar } from "@/components/AutoAnalizar";
import { Encabezado, Pill } from "@/components/ui";

export default async function Home() {
  const supabase = await createClient();
  const { grupos, entradas, settoError, porAnalizar } = await armarLista(supabase);
  const total = grupos.reduce((a, g) => a + g.total, 0);
  const lugares = grupos.filter((g) => g.id !== "sin-precio" && g.id !== "analizando").length;

  return (
    <main>
      <Encabezado
        titulo="Mi lista"
        sub={entradas.length ? <>{entradas.length} cosas · <span className="num">{pesos(total)}</span> en {lugares} lugar{lugares === 1 ? "" : "es"}</> : "Nada pendiente"}
      />
      <div className="px-4">
        <AgregarItem />
        <AutoAnalizar
          terminos={porAnalizar.map((p) => p.termino)}
          dims={porAnalizar.map((p) => p.dim)}
          mostrar={entradas.some((e) => e.analizando)}
        />

        {settoError && <p className="mt-3 rounded-xl bg-alerta-suave p-3 text-sm text-alerta">No pude leer la lista de Setto: {settoError}</p>}

        {!entradas.length && (
          <div className="mt-16 text-center text-suave">
            <p className="text-4xl">🛒</p>
            <p className="mt-2">Escribí arriba lo que necesitás comprar.</p>
          </div>
        )}

        <div className="mt-5 space-y-6">
          {grupos.map((g) => (
            <section key={g.id}>
              <div className="mb-2 flex items-baseline justify-between px-1">
                <h2 className={`text-lg font-bold ${g.id === "analizando" ? "text-suave" : ""}`}>
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
