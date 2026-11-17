import type { Grupo, Entrada, PlanViaje, Volumen } from "@/lib/lista";
import type { Recompra } from "@/lib/recompra";
import type { Descuento } from "@/lib/descuentos";
import { pesos } from "@/lib/formato";
import { Destacados, type Destacado } from "@/components/Destacados";
import { Icono } from "@/components/IconoProducto";
import { ActivarAvisos } from "@/components/ActivarAvisos";
import { ListaInteractiva } from "@/components/ListaInteractiva";
import { AgregarItem } from "@/components/AgregarItem";
import { PasarACasa } from "@/components/PasarACasa";
import { AutoAnalizar } from "@/components/AutoAnalizar";
import { Encabezado } from "@/components/ui";
import { agregarALista } from "@/app/actions";
import Link from "next/link";
import { DIAS } from "@/lib/descuentos";

export type DatosInicio = {
  porCategoria: Grupo[]; entradas: Entrada[]; settoError: string | null; porAnalizar: { termino: string; dim: string | null }[];
  plan: PlanViaje | null; alertas: Entrada[]; volumen: Volumen; promosHoy: Descuento[]; dia: number; recompra: Recompra[];
  supers: { id: string; nombre: string }[]; recientesSetto: { itemId: string; texto: string; titulo: string }[]; total: number; lugares: number;
};

const fila = "flex items-center gap-3 px-3 py-2.5";
const chip = "inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-semibold";
const corto = (e: Entrada) => {
  const a = e.alerta!;
  if (a.tipo === "umbral") return "🔔 tu tope";
  if (a.tipo === "minimo") return "mínimo del mes";
  const m = a.texto.match(/(\d+)%/);
  return m ? `−${m[1]}%` : "bajó";
};

/** La pantalla de inicio (sin datos: los trae page.tsx). La lista arriba; lo demás, en chips que se abren de a uno. */
export function InicioVista({ porCategoria, entradas, settoError, porAnalizar, plan, alertas, volumen, promosHoy, dia, recompra, supers, recientesSetto, total, lugares }: DatosInicio) {
  const destacados: Destacado[] = [];

  if (alertas.length) destacados.push({
    id: "bajas", emoji: "📉", label: `${alertas.length} ${alertas.length === 1 ? "bajó" : "bajaron"}`, tono: "durazno",
    contenido: (
      <ul className="divide-y divide-linea">
        {alertas.map((e) => (
          <li key={e.key}>
            <Link href={`/item/${e.origen}/${e.itemId}`} className={`${fila} active:bg-fondo`}>
              <Icono nombre={e.titulo} cat={e.categoria} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px] font-semibold">{e.titulo}</span>
                <span className={`${chip} mt-0.5 bg-menta text-menta-tinta`}>{corto(e)}</span>
              </span>
              {e.recomendado?.precio != null && <span className="num shrink-0 text-[16px] font-bold">{pesos(e.recomendado.precio)}</span>}
            </Link>
          </li>
        ))}
      </ul>
    ),
  });

  destacados.push({
    id: "descuentos", emoji: "🏷️", label: promosHoy.length ? `${promosHoy.length} descuentos hoy` : "Descuentos", tono: "limon",
    contenido: (
      <div className="p-3">
        {promosHoy.length ? (
          <ul className="grid grid-cols-2 gap-2">
            {promosHoy.map((d) => (
              <li key={d.id} className="rounded-2xl bg-limon px-3 py-2.5">
                <span className="block truncate text-[13px] font-semibold text-limon-tinta">{d.super}</span>
                <span className="num block text-[22px] font-bold leading-tight">{d.porcentaje}%</span>
                <span className="block truncate text-[12px] text-suave">{d.medio}{d.tope ? ` · tope ${pesos(d.tope)}` : ""}</span>
              </li>
            ))}
          </ul>
        ) : <p className="px-1 text-[15px] text-suave">Hoy ({DIAS[dia]}) no hay descuentos cargados.</p>}
        <Link href="/descuentos" className="mt-3 block text-center text-[14px] font-semibold text-limon-tinta">Ver la semana ›</Link>
      </div>
    ),
  });

  if (plan) destacados.push({
    id: "plan", emoji: "🗺️", label: plan.par ? `Ahorrás ${pesos(plan.par.ahorro)}` : `Todo en ${plan.solo.super}`, tono: "cielo",
    contenido: (
      <div className="space-y-2 p-3">
        <div className={`rounded-2xl px-3 py-2.5 ${plan.par ? "bg-fondo" : "bg-cielo"}`}>
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[15px] font-semibold">1 parada · {plan.solo.super}</span>
            <span className="num text-[17px] font-bold">{pesos(plan.solo.total)}</span>
          </span>
          {plan.solo.cubre < plan.items && <span className="text-[13px] text-suave">{plan.solo.cubre} de {plan.items} cosas</span>}
        </div>
        {plan.par ? (
          <>
            <div className="rounded-2xl bg-cielo px-3 py-2.5">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[15px] font-semibold text-cielo-tinta">2 paradas · {plan.par.a} + {plan.par.b}</span>
                <span className="num text-[17px] font-bold">{pesos(plan.par.total)}</span>
              </span>
              <span className={`${chip} mt-1 bg-tarjeta text-menta-tinta`}>Ahorrás {pesos(plan.par.ahorro)}</span>
            </div>
            <details className="px-1 text-[14px]">
              <summary className="cursor-pointer font-semibold text-cielo-tinta">Qué va en cada uno</summary>
              <p className="mt-1"><b>{plan.par.a}:</b> {plan.par.enA.join(", ")}</p>
              <p className="mt-1"><b>{plan.par.b}:</b> {plan.par.enB.join(", ")}</p>
            </details>
          </>
        ) : <p className="px-1 text-[14px] text-suave">Dividir no ahorra casi nada: andá a uno solo.</p>}
        {(plan.solo.promo || plan.par?.promoA || plan.par?.promoB) && <p className="px-1 text-[13px] text-suave">Ya con los descuentos de hoy.</p>}
      </div>
    ),
  });

  if (recompra.length) destacados.push({
    id: "recompra", emoji: "🔁", label: `${recompra.length} te ${recompra.length === 1 ? "falta" : "faltan"}`, tono: "lila",
    contenido: (
      <ul className="divide-y divide-linea">
        {recompra.map((r) => (
          <li key={r.clave} className={fila}>
            <Icono nombre={r.nombre} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[16px] font-semibold">{r.nombre}</span>
              <span className={`${chip} mt-0.5 bg-lila text-lila-tinta`}>cada {r.cadaDias} días</span>
            </span>
            <form action={agregarALista}>
              <input type="hidden" name="nombre" value={r.nombre} />
              <button aria-label={`Agregar ${r.nombre}`} className="flex h-9 w-9 items-center justify-center rounded-full bg-lila text-[20px] font-bold text-lila-tinta active:opacity-70">+</button>
            </form>
          </li>
        ))}
      </ul>
    ),
  });

  if (volumen.stock.length || volumen.packs.length) destacados.push({
    id: "volumen", emoji: "📦", label: "Llevá de más", tono: "menta",
    contenido: (
      <div>
        {volumen.stock.map((s) => (
          <div key={s.super} className="border-b border-linea px-3 py-3">
            <p className="text-[15px] font-semibold">Hoy en {s.super} <span className={`${chip} bg-menta text-menta-tinta`}>−{s.porcentaje}%</span></p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {s.items.slice(0, 8).map((t) => <li key={t} className="rounded-full bg-fondo px-2.5 py-1 text-[13px] font-medium">{t}</li>)}
            </ul>
          </div>
        ))}
        {volumen.packs.length > 0 && (
          <ul className="divide-y divide-linea">
            {volumen.packs.slice(0, 6).map((e) => (
              <li key={e.key}>
                <Link href={`/item/${e.origen}/${e.itemId}`} className={`${fila} active:bg-fondo`}>
                  <Icono nombre={e.titulo} cat={e.categoria} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-semibold">{e.titulo}</span>
                    <span className="line-clamp-1 text-[13px] text-suave">{e.pack}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="px-3 py-2 text-[12px] text-suave">Solo lo que no se vence.</p>
      </div>
    ),
  });

  return (
    <main>
      <Encabezado titulo="Mi lista" sub={entradas.length ? `${entradas.length} cosas · ${lugares} lugar${lugares === 1 ? "" : "es"}` : "Nada pendiente"}>
        {total > 0 && <span className="num pb-0.5 text-[24px] font-bold leading-none tracking-tight">{pesos(total)}</span>}
      </Encabezado>
      <div className="px-4 pb-28">
        <AgregarItem />
        <AutoAnalizar
          terminos={porAnalizar.map((p) => p.termino)}
          dims={porAnalizar.map((p) => p.dim)}
          mostrar={entradas.some((e) => e.analizando)}
        />

        <PasarACasa items={recientesSetto} titulo={`${recientesSetto.length} cosas se cargaron hoy en la caja de Setto. ¿Son para tu casa?`} />
        {settoError && <p className="mt-3 rounded-xl bg-alerta-suave p-3 text-sm text-alerta">No pude leer la lista de Setto: {settoError}</p>}

        {!entradas.length && (
          <div className="mt-16 text-center text-suave">
            <p className="text-4xl">🛒</p>
            <p className="mt-2">Escribí arriba lo que necesitás comprar.</p>
          </div>
        )}

        <Destacados items={destacados} />

        <ListaInteractiva grupos={porCategoria} supers={supers} />

        {entradas.length > 0 && <ActivarAvisos />}
      </div>
    </main>
  );
}
