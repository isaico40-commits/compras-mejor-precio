import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { leerDescuentos, DIAS, MEDIOS, hoyAR, textoDescuento, type Descuento } from "@/lib/descuentos";
import { guardarDescuento, borrarDescuento } from "@/app/actions";
import { Encabezado, Pill, Tarjeta, inputCls, btnCls, btnSecCls } from "@/components/ui";
import { NuevoLugar } from "@/components/FormPrecio";

// Lunes primero
const ORDEN = [1, 2, 3, 4, 5, 6, 0];

export default async function DescuentosPage({ searchParams }: { searchParams: Promise<{ editar?: string; nuevo?: string; ok?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [descuentos, { data: supers }] = await Promise.all([
    leerDescuentos(supabase),
    supabase.from("supermercados").select("id, nombre").eq("oculto", false).order("nombre"),
  ]);
  const { dia } = hoyAR();
  const editando = sp.editar ? descuentos.find((d) => d.id === sp.editar) ?? null : null;
  const formAbierto = !!editando || sp.nuevo !== undefined;

  return (
    <main>
      <Encabezado titulo="Descuentos" sub="Qué día conviene ir a cada lugar y con qué pagar">
        <Link href="/" className="pb-1 text-sm font-semibold text-marca">Lista</Link>
      </Encabezado>
      <div className="space-y-5 px-4">
        {sp.ok && <p className="rounded-xl bg-marca-suave p-3 text-sm font-medium text-marca">Listo, descuento guardado.</p>}

        {formAbierto ? (
          <Tarjeta className="p-4">
            <form action={guardarDescuento} className="space-y-3">
              {editando && <input type="hidden" name="id" value={editando.id} />}
              <p className="font-bold">{editando ? "Editar descuento" : "Nuevo descuento"}</p>
              <label className="block text-sm font-semibold">Dónde
                <select name="supermercado_id" defaultValue={editando?.supermercado_id ?? ""} className={`${inputCls} mt-1`}>
                  <option value="">Elegí el lugar</option>
                  {supers?.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </label>
              <NuevoLugar />
              <div>
                <p className="mb-1 text-sm font-semibold">Días</p>
                <div className="grid grid-cols-7 gap-1">
                  {ORDEN.map((d) => (
                    <label key={d} className="cursor-pointer">
                      <input type="checkbox" name="dias" value={d} defaultChecked={editando?.dias.includes(d)} className="peer sr-only" />
                      <span className="block rounded-lg border border-linea bg-tarjeta py-2 text-center text-sm font-semibold peer-checked:border-marca peer-checked:bg-marca-suave peer-checked:text-marca">
                        {DIAS[d].slice(0, 2)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-sm font-semibold">Pagando con
                  <select name="medio" defaultValue={editando?.medio ?? "Mercado Pago"} className={`${inputCls} mt-1`}>
                    {MEDIOS.map((m) => <option key={m}>{m}</option>)}
                  </select>
                </label>
                <label className="text-sm font-semibold">Descuento %
                  <input name="porcentaje" type="number" step="0.5" min="1" max="99" required defaultValue={editando?.porcentaje ?? ""} className={`${inputCls} mt-1`} />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-sm font-semibold">Tope $ (opcional)
                  <input name="tope" type="number" min="0" defaultValue={editando?.tope ?? ""} className={`${inputCls} mt-1`} />
                </label>
                <label className="text-sm font-semibold">Tope por
                  <select name="tope_periodo" defaultValue={editando?.tope_periodo ?? ""} className={`${inputCls} mt-1`}>
                    <option value="">—</option><option value="compra">compra</option><option value="semana">semana</option><option value="mes">mes</option>
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-sm font-semibold">Compra mínima $
                  <input name="minimo" type="number" min="0" defaultValue={editando?.minimo ?? ""} className={`${inputCls} mt-1`} />
                </label>
                <label className="text-sm font-semibold">Válido hasta
                  <input name="hasta" type="date" defaultValue={editando?.hasta ?? ""} className={`${inputCls} mt-1`} />
                </label>
              </div>
              <input name="detalle" defaultValue={editando?.detalle ?? ""} placeholder="Detalle (ej: solo QR, dinero en cuenta)" className={inputCls} />
              <div className="flex gap-2">
                <Link href="/descuentos" className={`${btnSecCls} flex-1 text-center`}>Cancelar</Link>
                <button className={`${btnCls} flex-[2]`}>Guardar</button>
              </div>
            </form>
            {editando && (
              <form action={borrarDescuento} className="mt-2">
                <input type="hidden" name="id" value={editando.id} />
                <button className="w-full py-2 text-sm font-semibold text-red-600">Borrar descuento</button>
              </form>
            )}
          </Tarjeta>
        ) : (
          <Link href="/descuentos?nuevo" className={`${btnCls} block text-center`}>Agregar descuento</Link>
        )}

        {ORDEN.map((d) => {
          const delDia = descuentos.filter((x) => x.dias.includes(d));
          return (
            <section key={d}>
              <h2 className={`mb-2 px-1 font-bold ${d === dia ? "text-marca" : ""}`}>
                {DIAS[d]}{d === dia && <span className="ml-2 align-middle"><Pill tono="verde">hoy</Pill></span>}
              </h2>
              <ul className="divide-y divide-linea overflow-hidden rounded-2xl border border-linea bg-tarjeta">
                {delDia.map((x) => <FilaDescuento key={x.id} d={x} />)}
                {!delDia.length && <li className="px-4 py-3 text-sm text-suave">Nada cargado.</li>}
              </ul>
            </section>
          );
        })}
        <p className="px-1 text-sm text-suave">
          Los de Mercado Pago salen de la guía de noviembre 2026 de calcularsueldo.com.ar (sin topes publicados). Revisá las condiciones en la app antes de pagar.
          No encontré promos vigentes de BBVA, Santander, Brubank ni MODO para noviembre: cargalas acá cuando las veas.
        </p>
      </div>
    </main>
  );
}

function FilaDescuento({ d }: { d: Descuento }) {
  return (
    <li>
      <Link href={`/descuentos?editar=${d.id}`} className="flex items-start justify-between gap-3 px-4 py-3 active:bg-fondo">
        <span className="min-w-0">
          <span className="block font-semibold">{d.super}</span>
          <span className="block text-sm text-suave">{textoDescuento(d)}{d.minimo ? ` · mínimo $${Math.round(d.minimo).toLocaleString("es-AR")}` : ""}</span>
          {d.detalle && <span className="block text-sm text-suave">{d.detalle}</span>}
          <span className="block text-sm text-suave">
            {d.fuente === "manual" ? "Cargado por vos" : "De internet"}
            {d.verificado && ` · revisado ${d.verificado.split("-").reverse().slice(0, 2).join("/")}`}
            {d.hasta && ` · hasta ${d.hasta.split("-").reverse().slice(0, 2).join("/")}`}
          </span>
        </span>
        <span className="num shrink-0 text-lg font-bold text-marca">−{d.porcentaje}%</span>
      </Link>
    </li>
  );
}
