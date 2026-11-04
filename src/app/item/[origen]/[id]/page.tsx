import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { pendientesConAlias, limpiarItem } from "@/lib/setto";
import { pesos, porUnidad, presentacion, palabraDim, esPorMetro, esRolloCocina, partirTermino } from "@/lib/formato";
import { leerDescuentos, mejorDescuento, ahorroCon, textoDescuento, hoyAR } from "@/lib/descuentos";
import { guardarItem, borrarItem, guardarSetto, guardarHabitual, guardarPagado, guardarCategoria, guardarRendimiento } from "@/app/actions";
import { CATEGORIAS, categoriaDe } from "@/lib/categorias";
import { detectarRubro, esRubro, nombreRubro, type Rubro } from "@/lib/rubros";
import { claveCompra } from "@/lib/lista";
import { Encabezado, Pill, Tarjeta, Titulo, ayudaCls, inputCls, btnCls, btnSecCls, btnSobre } from "@/components/ui";
import type { Opcion } from "@/lib/lista";
import { NuevoLugar } from "@/components/FormPrecio";

export default async function ItemPage({ params }: { params: Promise<{ origen: string; id: string }> }) {
  const { origen, id } = await params;
  const supabase = await createClient();
  const esMio = origen === "mio";

  let titulo = "", termino = "", dim: string | null = null, productoId: string | null = null, productoNombre: string | null = null;
  let rubroElegido: Rubro | null = null, categoriaElegida: string | null = null, precioAlerta: number | null = null;
  let cantidad = 1, frecuencia: number | null = null, lugarId: string | null = null, texto = "", donde: string | null = null, lugarSetto: string | null = null;

  if (esMio) {
    const { data: i } = await supabase
      .from("lista_items")
      .select("id, nombre, termino, cantidad, frecuencia_dias, lugar_id, rubro, categoria, precio_alerta, productos(id, nombre, nombre_base, dim)")
      .eq("id", id).maybeSingle();
    if (!i) notFound();
    const p = i.productos as unknown as { id: string; nombre: string; nombre_base: string; dim: string } | null;
    titulo = i.nombre ?? p?.nombre ?? "";
    termino = i.termino || i.nombre || (p?.nombre_base ?? "").split(" ").filter((w) => w.length > 2).slice(0, 2).join(" ");
    dim = p?.dim ?? null; productoId = p?.id ?? null; productoNombre = p?.nombre ?? null;
    cantidad = Number(i.cantidad); frecuencia = i.frecuencia_dias; lugarId = i.lugar_id;
    rubroElegido = esRubro(i.rubro) ? i.rubro : null;
    categoriaElegida = i.categoria ?? null;
    precioAlerta = i.precio_alerta != null ? Number(i.precio_alerta) : null;
  } else {
    const pend = await pendientesConAlias(supabase);
    const s = pend?.find((x) => x.id === id);
    if (!s) notFound();
    titulo = s.alias?.nombreItem || s.item; texto = s.texto; donde = s.lugar?.nombre ?? s.donde; lugarSetto = s.lugar?.id ?? null;
    termino = s.alias?.termino || (s.alias?.nombreItem?.toLowerCase() ?? "") || s.busqueda || limpiarItem(s.item);
    dim = s.alias?.dim ?? null; productoId = s.alias?.producto_id ?? null; productoNombre = s.alias?.nombre ?? null;
    rubroElegido = esRubro(s.alias?.rubro) ? (s.alias!.rubro as Rubro) : null;
    categoriaElegida = s.alias?.categoria ?? null;
    precioAlerta = s.alias?.precioAlerta ?? null;
  }
  const rubroAuto = detectarRubro(titulo);
  const rubro = rubroElegido ?? rubroAuto;
  const enSuper = rubro === "super";
  const categoriaAuto = categoriaDe(titulo, rubro);

  const filtro = partirTermino(termino);
  const porMetro = enSuper && esPorMetro(filtro.base || titulo);
  const porPano = enSuper && !porMetro && esRolloCocina(filtro.base || titulo);
  const rendimiento = porMetro || porPano;
  const [{ data: ops }, { data: lugares }, { data: pagos }, { data: hab }, descuentos, { data: sinLeer }] = await Promise.all([
    enSuper ? supabase.rpc("opciones_termino2", { p_termino: termino, p_dim: dim, p_limite: 10 }) : Promise.resolve({ data: [] }),
    supabase.from("supermercados").select("id, nombre").eq("oculto", false).order("nombre"),
    enSuper ? Promise.resolve({ data: [] })
      : supabase.from("compras_historial").select("precio, fecha, supermercados(nombre)").eq("clave", claveCompra(termino || titulo)).order("fecha", { ascending: false }).limit(5),
    enSuper ? Promise.resolve({ data: null }) : supabase.from("rubros_habituales").select("lugar_id").eq("rubro", rubro).maybeSingle(),
    enSuper ? leerDescuentos(supabase) : Promise.resolve([]),
    porMetro
      ? supabase.from("productos").select("id, nombre").neq("dim", "m").or("nombre_base.ilike.papel higien%,nombre_base.ilike.p higien%").limit(15)
      : porPano
      ? supabase.from("productos").select("id, nombre").neq("dim", "p").or("nombre_base.ilike.rollo%coc%,nombre_base.ilike.toalla de cocina%").limit(15)
      : Promise.resolve({ data: [] }),
  ]);
  const historial = (pagos as { precio: number | null; fecha: string; supermercados: unknown }[] | null) ?? [];
  const habitualId = (hab as { lugar_id: string } | null)?.lugar_id ?? "";
  const { dia } = hoyAR();
  // Descuento del día de cada súper (si hay): se usa para ordenar y se muestra al lado del precio
  const opciones = ((ops as Opcion[] | null) ?? []).map((o) => {
    const d = mejorDescuento(descuentos, o.supermercado_id, dia);
    const ahorro = ahorroCon(d, Number(o.precio));
    const conDesc = ahorro > 0 ? Number(o.precio) - ahorro : null;
    return { ...o, desc: ahorro > 0 ? d : null, conDesc, puFinal: o.por_unidad != null ? (conDesc ?? Number(o.precio)) / Number(o.cant_base || 1) : null };
  }).sort((a, b) => (a.puFinal ?? Infinity) - (b.puFinal ?? Infinity));
  const hayDescuento = opciones.some((o) => o.desc);
  const { data: rend } = rendimiento && opciones.length
    ? await supabase.from("productos").select("id, rollos, hoja").in("id", opciones.map((o) => o.producto_id))
    : { data: [] };
  const rendDe = new Map(((rend as { id: string; rollos: number | null; hoja: string | null }[] | null) ?? []).map((r) => [r.id, r]));
  const sinMetros = ((sinLeer as { id: string; nombre: string }[] | null) ?? []).filter((p) => (porMetro ? esPorMetro(p.nombre) && !/toalla|palito|porta/i.test(p.nombre) : esRolloCocina(p.nombre) && !/porta|soporte/i.test(p.nombre)));
  const volverA = `/item/${origen}/${id}`;
  const guardar = esMio ? guardarItem : guardarSetto;
  const ocultos = (
    <>
      <input type="hidden" name="id" value={id} />
      {!esMio && <input type="hidden" name="texto" value={texto} />}
    </>
  );

  return (
    <main>
      <Encabezado titulo={titulo} sub={esMio ? "De tu lista" : `De la caja de Setto${donde ? ` · ${donde}` : ""}`}>
        <Link href="/" className="pb-1 text-sm font-semibold text-marca">Listo</Link>
      </Encabezado>

      <div className="space-y-5 px-4">
        <Tarjeta className="p-4">
          <form action={guardar} className="space-y-2">
            {ocultos}
            <Titulo>Nombre</Titulo>
            <div className="flex gap-2">
              <input name="nombre" defaultValue={titulo} className={inputCls} />
              <button className={btnSecCls}>Guardar</button>
            </div>
            {!esMio && <p className={ayudaCls}>Solo cambia acá. En la caja de Setto sigue como lo escribiste.</p>}
          </form>
        </Tarjeta>


        <Tarjeta tono="lila" className="p-4">
          <form action={guardarCategoria} className="space-y-2">
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="origen" value={origen} />
            {!esMio && <input type="hidden" name="texto" value={texto} />}
            <Titulo tono="lila">Categoría</Titulo>
            <div className="flex gap-2">
              <select name="categoria" defaultValue={categoriaElegida ?? ""} className={inputCls}>
                <option value="">Automática ({categoriaAuto.nombre})</option>
                {CATEGORIAS.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
              <button className={btnSobre("lila")}>Guardar</button>
            </div>
            <p className={ayudaCls}>{enSuper ? "Se compara con los precios de los súpers." : "No se compara con los súpers: te muestro lo último que pagaste."}</p>
          </form>
        </Tarjeta>

        {!enSuper && (
          <>
          <Tarjeta tono="menta" className="p-4">
            <Titulo tono="menta" className="mb-2">Lo que pagaste</Titulo>
            {historial.length ? (
              <ul className="divide-y divide-menta-tinta/15 text-[15px]">
                {historial.map((h, i) => (
                  <li key={i} className="flex justify-between py-2">
                    <span>{h.fecha.split("-").reverse().slice(0, 2).join("/")}{(h.supermercados as { nombre: string } | null)?.nombre ? ` · ${(h.supermercados as { nombre: string }).nombre}` : ""}</span>
                    <span className="num font-semibold">{h.precio != null ? pesos(Number(h.precio)) : "—"}</span>
                  </li>
                ))}
              </ul>
            ) : <p className={ayudaCls}>Todavía nada. Cargalo acá o cuando lo marques comprado te pregunto el precio.</p>}
            <form action={guardarPagado} className="mt-3 space-y-2 border-t border-menta-tinta/15 pt-3">
              <input type="hidden" name="nombre" value={titulo} />
              <input type="hidden" name="clave" value={claveCompra(termino || titulo)} />
              <input type="hidden" name="volver_a" value={`/item/${origen}/${id}`} />
              <div className="grid grid-cols-2 gap-2">
                <label className="text-sm font-semibold text-menta-tinta">Precio
                  <input name="precio" type="number" inputMode="decimal" min="1" step="any" required placeholder="$" className={`${inputCls} mt-1`} />
                </label>
                <label className="text-sm font-semibold text-menta-tinta">Dónde
                  <select name="lugar_id" defaultValue={habitualId} className={`${inputCls} mt-1`}>
                    <option value="">Sin lugar</option>
                    {lugares?.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                  </select>
                </label>
              </div>
              <button className={`${btnSobre("menta")} w-full`}>Cargar lo que pagué</button>
            </form>
          </Tarjeta>
          <Tarjeta tono="cielo" className="p-4">
            <form action={guardarHabitual} className="space-y-2">
              <input type="hidden" name="rubro" value={rubro} />
              <input type="hidden" name="volver_a" value={`/item/${origen}/${id}`} />
              <Titulo tono="cielo">Tu {rubro === "otro" ? "comercio" : nombreRubro(rubro).toLowerCase()} de siempre</Titulo>
              <p className={ayudaCls}>Solo el lugar. El precio va en “Lo que pagaste”.</p>
              <label className="block">
                <select name="lugar_id" defaultValue={habitualId} className={inputCls} aria-label="Lugar de siempre">
                  <option value="">Ninguna en particular</option>
                  {lugares?.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                </select>
              </label>
              <NuevoLugar />
              <button className={`${btnSobre("cielo")} w-full`}>Guardar lugar</button>
              <p className={ayudaCls}>Todo lo de {nombreRubro(rubro).toLowerCase()} va a ese lugar en la lista, salvo lo que anotes en otro.</p>
            </form>
          </Tarjeta>
          </>
        )}

        {enSuper && <Tarjeta className="p-4">
          <form action={guardar} className="space-y-2">
            {ocultos}
            <Titulo>Buscar como</Titulo>
            <input type="hidden" name="filtro_hoja" value={filtro.hoja ?? ""} />
            <input type="hidden" name="filtro_min" value={filtro.minRollo ?? ""} />
            <input type="hidden" name="filtro_texto" value={filtro.texto} />
            <div className="flex gap-2">
              <input name="filtro_base" defaultValue={filtro.base} className={inputCls} />
              <button className={btnSecCls}>Buscar</button>
            </div>
            <p className={ayudaCls}>Usá palabras genéricas: “azucar comun”, “leche entera”, “crema de leche”.</p>
          </form>
        </Tarjeta>}

        {enSuper && (
          <Tarjeta tono="durazno" className="p-4">
            <form action={guardar} className="space-y-2">
              {ocultos}
              <Titulo tono="durazno">Avisame si baja de</Titulo>
              <div className="flex gap-2">
                <input name="precio_alerta" type="number" inputMode="decimal" min="0" step="any" defaultValue={precioAlerta ?? ""} placeholder="$ (vacío = sin tope)" className={inputCls} />
                <button className={btnSobre("durazno")}>Guardar</button>
              </div>
              <p className={ayudaCls}>Te lo marco arriba de la lista cuando el mejor precio{opciones[0] ? ` (hoy ${pesos(opciones[0].precio)})` : ""} quede por debajo. También te aviso solo cuando está en su precio más bajo del mes.</p>
            </form>
          </Tarjeta>
        )}

        {enSuper && !productoId && (
          <Tarjeta tono="limon" className="p-4">
            <form action={guardar} className="space-y-3">
              {ocultos}
              <input type="hidden" name="filtro_base" value={filtro.base} />
              <Titulo tono="limon">Cualquier marca: comparo por {palabraDim(porMetro ? "m" : porPano ? "p" : dim ?? opciones[0]?.dim)}</Titulo>
              <p className={ayudaCls}>
                {porMetro ? "Leo rollos × metros de cada paquete" : porPano ? "Leo los paños de cada paquete" : "Leo el tamaño de cada paquete (kilos, litros o unidades del pack)"} y te muestro el que sale menos{hayDescuento ? ", con el descuento de hoy" : ""}.
              </p>
              {!rendimiento && <input type="hidden" name="filtro_hoja" value={filtro.hoja ?? ""} />}
              {rendimiento && <fieldset>
                <legend className="mb-1 text-sm font-semibold text-limon-tinta">Hoja</legend>
                <div className="flex flex-wrap gap-2">
                  {[["", "Cualquiera"], ["simple", "Simple"], ["doble", "Doble o triple"]].map(([v, l]) => (
                    <label key={v} className="cursor-pointer">
                      <input type="radio" name="filtro_hoja" value={v} defaultChecked={(filtro.hoja ?? "") === v} className="peer sr-only" />
                      <span className="block rounded-full bg-tarjeta px-3 py-1.5 text-sm font-semibold text-limon-tinta ring-1 ring-limon-tinta/20 peer-checked:bg-limon-tinta peer-checked:text-white">{l}</span>
                    </label>
                  ))}
                </div>
              </fieldset>}
              {porMetro && <label className="block text-sm font-semibold text-limon-tinta">Metros mínimos por rollo
                <input name="filtro_min" type="number" inputMode="numeric" min="0" max="500" defaultValue={filtro.minRollo ?? ""} placeholder="Sin mínimo (ej. 30)" className={`${inputCls} mt-1`} />
              </label>}
              <label className="block text-sm font-semibold text-limon-tinta">Solo los que digan
                <input name="filtro_texto" defaultValue={filtro.texto} placeholder="Ej.: XG · 60x90 · AA (separá con coma)" className={`${inputCls} mt-1`} />
              </label>
              <button className={`${btnSobre("limon")} w-full`}>Aplicar</button>
            </form>
          </Tarjeta>
        )}

        <Link
          href={`/precios?nuevo=${encodeURIComponent(titulo)}&item=${origen}:${id}${texto ? `&texto=${encodeURIComponent(texto)}` : ""}`}
          className="flex items-center justify-between rounded-2xl bg-durazno px-4 py-3 active:opacity-80"
        >
          <span>
            <span className="block text-[15px] font-bold text-durazno-tinta">Cargar mi precio</span>
            <span className={ayudaCls}>Si lo comprás en un lugar que no está (papelera, almacén…)</span>
          </span>
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-suave" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 6 6 6-6 6" /></svg>
        </Link>

        {enSuper && <section>
          <h2 className="mb-2 px-1 text-[15px] font-bold">Opciones más baratas por {palabraDim(porMetro ? "m" : porPano ? "p" : dim ?? opciones[0]?.dim)}{hayDescuento ? " (con descuento de hoy)" : ""}</h2>
          {productoId && (
            <div className="mb-2 flex items-center justify-between rounded-2xl bg-marca-suave px-4 py-3 text-sm">
              <span>Fijado: <b>{productoNombre}</b></span>
              <form action={guardar}>
                {ocultos}
                <input type="hidden" name="producto_id" value="" />
                <button className="font-semibold text-marca">Cualquier marca</button>
              </form>
            </div>
          )}
          <ul className="divide-y divide-linea overflow-hidden rounded-2xl border border-linea bg-tarjeta">
            {opciones.map((o, i) => {
              const r = rendDe.get(o.producto_id);
              const detalleRollos = o.dim === "m" && r?.rollos ? `${r.rollos} rollos × ${Math.round(Number(o.cant_base) / r.rollos)} m` : presentacion(o.cant_base, o.dim);
              return (
              <li key={o.producto_id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] leading-snug">{o.nombre}</p>
                  <p className={ayudaCls}>
                    {o.supermercado}{detalleRollos && ` · ${detalleRollos}`}{r?.hoja && ` · hoja ${r.hoja}`}
                    {i === 0 && <span className="ml-1"><Pill tono="verde">más barato</Pill></span>}
                  </p>
                  {o.desc && <p className="text-sm text-menta-tinta">Hoy {textoDescuento(o.desc)}: <span className="num font-semibold">{pesos(o.conDesc)}</span></p>}
                </div>
                <div className="text-right">
                  <p className="num font-semibold">{pesos(o.precio)}</p>
                  <p className="num text-sm text-suave">{porUnidad(o.puFinal ?? o.por_unidad, o.dim)}</p>
                </div>
                {o.producto_id !== productoId && (
                  <form action={guardar}>
                    {ocultos}
                    <input type="hidden" name="producto_id" value={o.producto_id} />
                    <button className="rounded-lg bg-menta px-2.5 py-1 text-sm font-semibold text-menta-tinta">Fijar</button>
                  </form>
                )}
              </li>
              );
            })}
            {!opciones.length && <li className="px-4 py-6 text-center text-sm text-suave">No encontré “{filtro.base || termino}” en los súpers{filtro.hoja || filtro.minRollo || filtro.texto ? " con esos filtros" : ""}. Probá con otra palabra.</li>}
          </ul>
          {rendimiento && (
            <details className="mt-3 rounded-2xl bg-tarjeta px-4 py-3">
              <summary className="cursor-pointer text-[15px] font-bold">Corregir {porMetro ? "metros" : "paños"} {sinMetros.length ? `(${sinMetros.length} sin leer)` : ""}</summary>
              <p className={`${ayudaCls} mt-1`}>Si un paquete no dice los {porMetro ? "metros" : "paños"} o los leí mal, cargalo acá y entra en la comparación.</p>
              <ul className="mt-2 divide-y divide-linea">
                {[...sinMetros.map((p) => ({ id: p.id, nombre: p.nombre, rollos: null as number | null, mpr: null as number | null, hoja: null as string | null, falta: true })),
                  ...opciones.map((o) => { const r = rendDe.get(o.producto_id); return { id: o.producto_id, nombre: o.nombre, rollos: r?.rollos ?? null, mpr: r?.rollos ? Math.round(Number(o.cant_base) / r.rollos) : null, hoja: r?.hoja ?? null, falta: false }; }),
                ].map((p) => (
                  <li key={p.id} className="py-3">
                    <p className="text-sm leading-snug">{p.falta && <span className="font-semibold text-durazno-tinta">Sin {porMetro ? "metros" : "paños"} · </span>}{p.nombre}</p>
                    <form action={guardarRendimiento} className="mt-2 grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2">
                      <input type="hidden" name="producto_id" value={p.id} />
                      <input type="hidden" name="volver_a" value={volverA} />
                      <label className="text-xs font-semibold text-suave">Rollos
                        <input name="rollos" type="number" inputMode="numeric" min="1" required defaultValue={p.rollos ?? ""} className={`${inputCls} mt-1`} />
                      </label>
                      <label className="text-xs font-semibold text-suave">{porMetro ? "m" : "Paños"} por rollo
                        <input name="metros_rollo" type="number" inputMode="decimal" min="1" step="any" required defaultValue={p.mpr ?? ""} className={`${inputCls} mt-1`} />
                      </label>
                      <label className="text-xs font-semibold text-suave">Hoja
                        <select name="hoja" defaultValue={p.hoja ?? ""} className={`${inputCls} mt-1`}>
                          <option value="">?</option><option value="simple">Simple</option><option value="doble">Doble</option><option value="triple">Triple</option>
                        </select>
                      </label>
                      <button className={btnSecCls}>OK</button>
                    </form>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>}

        {esMio && (
          <Tarjeta tono="cielo" className="p-4">
            <form action={guardarItem} className="space-y-3">
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="volver" value="1" />
              <div className="grid grid-cols-2 gap-3">
                <label className="text-[15px] font-bold text-cielo-tinta">Cantidad
                  <input name="cantidad" type="number" step="any" min="0.01" defaultValue={cantidad} className={`${inputCls} mt-1`} />
                </label>
                <label className="text-[15px] font-bold text-cielo-tinta">Cada cuántos días
                  <input name="frecuencia_dias" type="number" min="1" defaultValue={frecuencia ?? ""} placeholder="—" className={`${inputCls} mt-1`} />
                </label>
              </div>
              <label className="block text-[15px] font-bold text-cielo-tinta">Dónde lo comprás
                <select name="lugar_id" defaultValue={lugarId ?? ""} className={`${inputCls} mt-1`}>
                  <option value="">{enSuper ? "Donde esté más barato" : "Donde compro siempre"}</option>
                  {lugares?.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                </select>
              </label>
              <NuevoLugar />
              <button className={`${btnCls} w-full`}>Guardar</button>
            </form>
            <form action={borrarItem} className="mt-3">
              <input type="hidden" name="id" value={id} />
              <button className="w-full py-2 text-sm font-semibold text-red-600">Quitar de la lista</button>
            </form>
          </Tarjeta>
        )}
        {!esMio && (
          <Tarjeta tono="cielo" className="p-4">
            <form action={guardarSetto} className="space-y-3">
              {ocultos}
              <input type="hidden" name="volver" value="1" />
              <label className="block text-[15px] font-bold text-cielo-tinta">Dónde lo comprás
                <select name="lugar_id" defaultValue={lugarSetto ?? ""} className={`${inputCls} mt-1`}>
                  <option value="">{enSuper ? "Donde esté más barato" : "Donde compro siempre"}</option>
                  {lugares?.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                </select>
              </label>
              <NuevoLugar />
              <button className={`${btnCls} w-full`}>Guardar</button>
            </form>
          </Tarjeta>
        )}
        {!esMio && <p className="px-1 text-sm text-suave">Este ítem vive en la caja de Setto: si lo marcás comprado o lo quitás desde la lista, se actualiza allá también.</p>}
      </div>
    </main>
  );
}
