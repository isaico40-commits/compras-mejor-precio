import { createClient } from "@/lib/supabase/server";
import { armarLista } from "@/lib/lista";
import { pesos } from "@/lib/formato";
import { ListaInteractiva } from "@/components/ListaInteractiva";
import { AgregarItem } from "@/components/AgregarItem";
import { AutoAnalizar } from "@/components/AutoAnalizar";
import { Encabezado } from "@/components/ui";
import { sugerirRecompra } from "@/lib/recompra";
import { agregarALista } from "@/app/actions";
import Link from "next/link";
import { DIAS, hoyAR, textoDescuento } from "@/lib/descuentos";

export default async function Home() {
  const supabase = await createClient();
  const { grupos, entradas, settoError, porAnalizar, plan, descuentos } = await armarLista(supabase);
  const { dia } = hoyAR();
  const promosHoy = descuentos.filter((d) => d.dias.includes(dia));
  const [recompra, { data: supers }] = await Promise.all([
    sugerirRecompra(supabase, entradas.map((e) => e.termino)).catch(() => []),
    supabase.from("supermercados").select("id, nombre").order("nombre"),
  ]);
  const total = grupos.reduce((a, g) => a + g.total, 0);
  const lugares = grupos.filter((g) => g.id !== "sin-precio" && g.id !== "analizando").length;

  return (
    <main>
      <Encabezado
        titulo="Mi lista"
        sub={entradas.length ? <>{entradas.length} cosas · <span className="num">{pesos(total)}</span> en {lugares} lugar{lugares === 1 ? "" : "es"}</> : "Nada pendiente"}
      />
      <div className="px-4 pb-28">
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

        <Link href="/descuentos" className="mt-4 block rounded-2xl bg-limon px-4 py-3 active:opacity-80">
          <span className="flex items-center justify-between">
            <span className="text-[15px] font-bold text-limon-tinta">Descuentos de hoy · {DIAS[dia]}</span>
            <span className="text-sm font-semibold text-limon-tinta">Ver semana ›</span>
          </span>
          {promosHoy.length ? (
            <span className="mt-1 block text-sm">
              {promosHoy.slice(0, 4).map((d) => <span key={d.id} className="block"><b>{d.super}</b>: {textoDescuento(d)}</span>)}
              {promosHoy.length > 4 && <span className="block text-suave">y {promosHoy.length - 4} más</span>}
            </span>
          ) : (
            <span className="mt-1 block text-sm text-suave">Hoy no hay descuentos cargados.</span>
          )}
        </Link>

        {recompra.length > 0 && (
          <section className="mt-5">
            <ul className="divide-y divide-lila-tinta/10 overflow-hidden rounded-2xl bg-lila">
              <li className="px-4 pt-3 text-[15px] font-bold text-lila-tinta">Te estaría faltando</li>
              {recompra.map((r) => (
                <li key={r.clave} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.nombre}</span>
                    <span className="text-sm text-suave">Lo comprás cada {r.cadaDias} días · hace {r.haceDias}</span>
                  </span>
                  <form action={agregarALista}>
                    <input type="hidden" name="nombre" value={r.nombre} />
                    <button className="rounded-lg bg-tarjeta px-3 py-1.5 text-sm font-semibold text-lila-tinta">Agregar</button>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        )}

        {plan && (
          <section className="mt-5 rounded-2xl bg-cielo p-4">
            <p className="text-[15px] font-bold text-cielo-tinta">Plan del viaje</p>
            <p className="mt-1">
              Todo en <b>{plan.solo.super}</b>: <span className="num font-semibold">{pesos(plan.solo.total)}</span>
              {plan.solo.cubre < plan.items && <span className="text-sm text-suave"> ({plan.solo.cubre} de {plan.items} cosas)</span>}
            </p>
            {plan.solo.promo && <p className="text-sm text-marca">Ya con {plan.solo.promo} de hoy</p>}
            {plan.par ? (
              <>
                <p className="mt-1">
                  Dividiendo <b>{plan.par.a}</b> + <b>{plan.par.b}</b>: <span className="num font-semibold">{pesos(plan.par.total)}</span>
                </p>
                <p className="mt-2 rounded-xl bg-tarjeta px-3 py-2 text-sm font-semibold text-menta-tinta">
                  Ahorrás <span className="num">{pesos(plan.par.ahorro)}</span> haciendo dos paradas
                </p>
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer font-semibold text-cielo-tinta">Qué comprar en cada uno</summary>
                  <p className="mt-1"><b>{plan.par.a}:</b> {plan.par.enA.join(", ")}</p>
                  <p className="mt-1"><b>{plan.par.b}:</b> {plan.par.enB.join(", ")}</p>
                  {(plan.par.promoA || plan.par.promoB) && (
                    <p className="mt-1 text-sm text-marca">
                      Incluye descuentos de hoy: {[plan.par.promoA && `${plan.par.a} ${plan.par.promoA}`, plan.par.promoB && `${plan.par.b} ${plan.par.promoB}`].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </details>
              </>
            ) : (
              <p className="mt-1 text-sm text-suave">Dividir la compra no te ahorra casi nada: andá a uno solo.</p>
            )}
          </section>
        )}

        <ListaInteractiva grupos={grupos} supers={supers ?? []} />
      </div>
    </main>
  );
}
