import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { pendientesConAlias, limpiarItem } from "@/lib/setto";
import { pesos, porUnidad, presentacion, palabraDim, esPorMetro, esRolloCocina, partirTermino } from "@/lib/formato";
import { leerDescuentos, mejorDescuento, ahorroCon, textoDescuento, hoyAR } from "@/lib/descuentos";
import { guardarItem, borrarItem, pasarASetto, guardarSetto, guardarHabitual, precioDelItem, guardarRendimiento } from "@/app/actions";
import { categoriaDe } from "@/lib/categorias";
import { detectarRubro, esRubro, nombreRubro, type Rubro } from "@/lib/rubros";
import { claveCompra } from "@/lib/lista";
import { Encabezado, Pill, Tarjeta, Titulo, ayudaCls, inputCls, btnCls, btnSecCls } from "@/components/ui";
import type { Opcion } from "@/lib/lista";
import { NuevoLugar, medidaDe } from "@/components/FormPrecio";
import { CategoriaRapida } from "@/components/CategoriaRapida";

export default async function ItemPage({ params, searchParams }: { params: Promise<{ origen: string; id: string }>; searchParams: Promise<{ ok?: string }> }) {
  const { origen, id } = await params;
  const { ok } = await searchParams;
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
  const [{ data: ops }, { data: lugares }, { data: pagos }, { data: hab }, descuentos, { data: sinLeer }, { data: preciosFijo }, { data: prod }] = await Promise.all([
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
    productoId
      ? supabase.from("precios").select("precio, precio_promo, fecha, supermercado_id, supermercados(nombre)").eq("producto_id", productoId)
          .order("fecha", { ascending: false }).order("created_at", { ascending: false }).limit(40)
      : Promise.resolve({ data: [] }),
    productoId ? supabase.from("productos").select("unidad, cantidad, ean").eq("id", productoId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const tam = prod && (prod as { ean: string | null }).ean == null ? medidaDe(Number((prod as { cantidad: number }).cantidad), (prod as { unidad: string }).unidad) : null;
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

  // Lo que se muestra arriba: marca, precio y dónde. Si hay un producto fijado, su precio en tu lugar (o el más barato).
  const lugarActual = esMio ? lugarId : lugarSetto;
  const porSuper = new Map<string, { precio: number; super: string; fecha: string }>();
  for (const r of (preciosFijo as { precio: number; precio_promo: number | null; fecha: string; supermercado_id: string; supermercados: unknown }[] | null) ?? []) {
    if (!porSuper.has(r.supermercado_id)) porSuper.set(r.supermercado_id, { precio: Number(r.precio_promo ?? r.precio), super: (r.supermercados as { nombre: string } | null)?.nombre ?? "", fecha: r.fecha });
  }
  type Hero = { etiqueta: string; marca: string; precio: number; donde: string | null; dondeId: string | null; fecha: string | null; chip: { texto: string; caro: boolean } | null };
  let hero: Hero | null = null;
  if (productoId && porSuper.size) {
    const orden = [...porSuper.entries()].sort((a, b) => a[1].precio - b[1].precio);
    const aca = lugarActual ? porSuper.get(lugarActual) : undefined;
    const [minId, min] = orden[0];
    const h = aca ?? min;
    const caro = !!aca && min.precio < aca.precio * 0.98;
    const otraMarca = enSuper && opciones[0] && opciones[0].producto_id !== productoId;
    hero = {
      etiqueta: "Lo que comprás", marca: productoNombre ?? titulo, precio: h.precio, donde: h.super, dondeId: aca ? lugarActual : minId, fecha: h.fecha,
      chip: caro ? { texto: `En ${min.super}: ${pesos(min.precio)}`, caro: true }
        : otraMarca ? { texto: "Otra marca sale menos ›", caro: true }
        : orden.length > 1 ? { texto: "✓ El más barato", caro: false } : null,
    };
  } else if (enSuper && opciones[0]) {
    const o = opciones[0];
    hero = { etiqueta: "Lo más barato hoy", marca: o.nombre, precio: o.conDesc ?? Number(o.precio), donde: o.supermercado, dondeId: o.supermercado_id, fecha: null, chip: o.desc ? { texto: `con ${textoDescuento(o.desc)}`, caro: false } : null };
  } else if (!enSuper && historial[0]?.precio != null) {
    const h = historial[0];
    hero = { etiqueta: "Lo último que pagaste", marca: titulo, precio: Number(h.precio), donde: (h.supermercados as { nombre: string } | null)?.nombre ?? null, dondeId: null, fecha: h.fecha, chip: null };
  }
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

      <div className="space-y-5 px-4 pb-10">
        {ok === "precio" && <p className="rounded-2xl bg-menta px-4 py-3 text-[15px] font-semibold text-menta-tinta">✓ Precio guardado. Queda fijo con esa marca y ese lugar.</p>}

        {/* Lo principal: marca, precio y dónde */}
        <section className="overflow-hidden rounded-3xl bg-tarjeta shadow-sm ring-1 ring-linea">
          <div className="p-4">
            <div className="mb-3"><CategoriaRapida id={id} origen={origen} texto={texto} elegida={categoriaElegida} auto={categoriaAuto.id} /></div>
            {hero ? (
              <>
                <p className="text-[13px] font-semibold uppercase tracking-wide text-suave">{hero.etiqueta}</p>
                <p className="mt-0.5 line-clamp-2 text-[17px] font-semibold leading-snug">{hero.marca}</p>
                <p className="num mt-1 text-[38px] font-bold leading-none tracking-tight">{pesos(hero.precio)}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {hero.donde && <span className="rounded-full bg-cielo px-2.5 py-1 text-[13px] font-semibold text-cielo-tinta">📍 {hero.donde}</span>}
                  {hero.fecha && <span className="rounded-full bg-fondo px-2.5 py-1 text-[13px] font-medium text-suave">{hero.fecha.split("-").reverse().slice(0, 2).join("/")}</span>}
                  {hero.chip && <a href="#comparar" className={`rounded-full px-2.5 py-1 text-[13px] font-semibold ${hero.chip.caro ? "bg-durazno text-durazno-tinta" : "bg-menta text-menta-tinta"}`}>{hero.chip.texto}</a>}
                </div>
              </>
            ) : (
              <>
                <p className="text-[17px] font-semibold">Todavía sin precio</p>
                <p className={ayudaCls}>Cargalo una vez acá abajo y queda fijo.</p>
              </>
            )}
          </div>
          <form action={precioDelItem} className="space-y-2 border-t border-linea bg-fondo/60 p-4">
            <input type="hidden" name="item" value={`${origen}:${id}`} />
            {!esMio && <input type="hidden" name="texto" value={texto} />}
            <input type="hidden" name="producto_id" value={productoId ?? ""} />
            <input type="hidden" name="volver_a" value={volverA} />
            <p className="text-[15px] font-bold">{hero ? "Cambiar precio a mano" : "Cargar precio"}</p>
            <label className="block text-sm font-semibold text-suave">Marca / producto
              <input name="nombre" defaultValue={productoNombre ?? (enSuper ? "" : titulo)} placeholder={`Ej: ${titulo} marca X`} className={`${inputCls} mt-1`} />
            </label>
            <div>
              <p className="text-sm font-semibold text-suave">Tamaño <span className="font-normal">(para comparar por kilo o litro)</span></p>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <input name="cantidad" type="number" step="any" min="0.01" inputMode="decimal" defaultValue={tam?.cant ?? ""} placeholder="Ej: 500" aria-label="Tamaño" className={`${inputCls} num`} />
                <select name="medida" defaultValue={tam && tam.medida !== "medio_kg" ? tam.medida : ""} aria-label="Unidad" className={inputCls}>
                  <option value="">Unidad…</option>
                  <option value="g">gramos (g)</option>
                  <option value="kg">kilos (kg)</option>
                  <option value="ml">mililitros (ml / cc)</option>
                  <option value="l">litros (l)</option>
                  <option value="u">unidades</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-[1fr_1.3fr] gap-2">
              <label className="text-sm font-semibold text-suave">Precio
                <input name="precio" type="number" inputMode="decimal" min="1" step="any" required placeholder="$" className={`${inputCls} num mt-1 text-[18px] font-bold`} />
              </label>
              <label className="text-sm font-semibold text-suave">Dónde
                <select name="supermercado_id" defaultValue={lugarActual ?? hero?.dondeId ?? habitualId} className={`${inputCls} mt-1`}>
                  <option value="">Elegí</option>
                  {lugares?.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                </select>
              </label>
            </div>
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-marca">¿No está el lugar?</summary>
              <div className="mt-2"><NuevoLugar /></div>
            </details>
            <button className={`${btnCls} w-full`}>Guardar precio</button>
          </form>
        </section>

        {enSuper && <section>
          <h2 id="comparar" className="mb-2 px-1 text-[17px] font-bold">Comparar por {palabraDim(porMetro ? "m" : porPano ? "p" : dim ?? opciones[0]?.dim)}{hayDescuento ? " (con descuento de hoy)" : ""}</h2>
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
          <ul className="divide-y divide-linea overflow-hidden rounded-3xl bg-tarjeta shadow-sm ring-1 ring-linea">
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

        {!enSuper && (
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
            ) : <p className={ayudaCls}>Todavía nada. Cargá el precio arriba o te lo pregunto cuando lo marques comprado.</p>}
          </Tarjeta>
        )}

        <details className="group rounded-3xl bg-tarjeta shadow-sm ring-1 ring-linea">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3.5 text-[15px] font-bold">
            Más opciones
            <span className="text-[13px] font-medium text-suave group-open:hidden">búsqueda, aviso, cantidad…</span>
          </summary>
          <div className="divide-y divide-linea border-t border-linea">
          <Bloque emoji="📝" titulo="Nombre en tu lista" ayuda={!esMio ? "Solo cambia acá. En la caja de Setto sigue como lo escribiste." : null}>
            <form action={guardar} className="flex gap-2">
              {ocultos}
              <input name="nombre" defaultValue={titulo} className={inputCls} />
              <button className={btnSecCls}>Guardar</button>
            </form>
          </Bloque>

          {enSuper && (
            <Bloque emoji="🔍" titulo="Qué busco en los súpers" ayuda="Si en “Comparar” aparecen cosas que no son lo tuyo, cambiá las palabras o agregá un detalle.">
              <form action={guardar} className="space-y-2">
                {ocultos}
                <label className="block text-sm font-semibold text-suave">Palabras
                  <input name="filtro_base" defaultValue={filtro.base} placeholder="Ej: arroz largo fino" className={`${inputCls} mt-1`} />
                </label>
                <label className="block text-sm font-semibold text-suave">Que diga también (opcional)
                  <input name="filtro_texto" defaultValue={filtro.texto} placeholder="Ej: integral, 00000, XG" className={`${inputCls} mt-1`} />
                </label>
                {!rendimiento && <input type="hidden" name="filtro_hoja" value={filtro.hoja ?? ""} />}
                {!porMetro && <input type="hidden" name="filtro_min" value={filtro.minRollo ?? ""} />}
                {rendimiento && (
                  <div className="flex flex-wrap gap-2">
                    {[["", "Cualquier hoja"], ["simple", "Hoja simple"], ["doble", "Doble o triple"]].map(([v, l]) => (
                      <label key={v} className="cursor-pointer">
                        <input type="radio" name="filtro_hoja" value={v} defaultChecked={(filtro.hoja ?? "") === v} className="peer sr-only" />
                        <span className="block rounded-full bg-fondo px-3 py-1.5 text-sm font-semibold ring-1 ring-linea peer-checked:bg-marca peer-checked:text-white">{l}</span>
                      </label>
                    ))}
                  </div>
                )}
                {porMetro && (
                  <label className="block text-sm font-semibold text-suave">Metros mínimos por rollo
                    <input name="filtro_min" type="number" inputMode="numeric" min="0" max="500" defaultValue={filtro.minRollo ?? ""} placeholder="Sin mínimo" className={`${inputCls} mt-1`} />
                  </label>
                )}
                <button className={`${btnSecCls} w-full`}>Buscar</button>
              </form>
            </Bloque>
          )}

          {enSuper && (
            <Bloque emoji="🔔" titulo="Avisame si baja de" ayuda="Te aviso cuando el más barato quede por debajo de este precio.">
              <form action={guardar} className="flex gap-2">
                {ocultos}
                <input name="precio_alerta" type="number" inputMode="decimal" min="0" step="any" defaultValue={precioAlerta ?? ""} placeholder="$ (vacío = sin aviso)" className={`${inputCls} num`} />
                <button className={btnSecCls}>Guardar</button>
              </form>
            </Bloque>
          )}

          {enSuper && lugarActual && (
            <Bloque emoji="📍" titulo={`Fijado en ${lugares?.find((l) => l.id === lugarActual)?.nombre ?? "un lugar"}`} ayuda="Si lo soltás, la lista te lo pone en el súper donde esté más barato.">
              <form action={guardar}>
                {ocultos}
                <input type="hidden" name="lugar_id" value="" />
                <button className={`${btnSecCls} w-full`}>Soltar: donde esté más barato</button>
              </form>
            </Bloque>
          )}

          {!enSuper && (
            <Bloque emoji="🏪" titulo={`Tu ${rubro === "otro" ? "comercio" : nombreRubro(rubro).toLowerCase()} de siempre`} ayuda={`Todo lo de ${nombreRubro(rubro).toLowerCase()} va a ese lugar en la lista.`}>
              <form action={guardarHabitual} className="space-y-2">
                <input type="hidden" name="rubro" value={rubro} />
                <input type="hidden" name="volver_a" value={volverA} />
                <div className="flex gap-2">
                  <select name="lugar_id" defaultValue={habitualId} className={inputCls} aria-label="Lugar de siempre">
                    <option value="">Ninguno en particular</option>
                    {lugares?.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                  </select>
                  <button className={btnSecCls}>Guardar</button>
                </div>
                <details><summary className="cursor-pointer text-sm font-semibold text-marca">¿No está el lugar?</summary><div className="mt-2"><NuevoLugar /></div></details>
              </form>
            </Bloque>
          )}

          {esMio && (
            <Bloque emoji="🔁" titulo="Cuántos y cada cuánto" ayuda="Si ponés días, cuando lo marcás comprado vuelve solo a la lista pasado ese tiempo.">
              <form action={guardarItem} className="space-y-2">
                <input type="hidden" name="id" value={id} />
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-sm font-semibold text-suave">Cuántos llevo
                    <input name="cantidad" type="number" step="any" min="0.01" inputMode="decimal" defaultValue={cantidad} className={`${inputCls} num mt-1`} />
                  </label>
                  <label className="text-sm font-semibold text-suave">Volver cada (días)
                    <input name="frecuencia_dias" type="number" min="1" inputMode="numeric" defaultValue={frecuencia ?? ""} placeholder="No" className={`${inputCls} num mt-1`} />
                  </label>
                </div>
                <button className={`${btnSecCls} w-full`}>Guardar</button>
              </form>
            </Bloque>
          )}


          {esMio ? (
            <div className="space-y-1 pt-1">
              <form action={pasarASetto}>
                <input type="hidden" name="id" value={id} />
                <button className="w-full rounded-xl bg-lila py-2.5 text-[15px] font-semibold text-lila-tinta">Es de Setto: pasarlo a su lista</button>
              </form>
              <form action={borrarItem}>
                <input type="hidden" name="id" value={id} />
                <button className="w-full py-2 text-sm font-semibold text-red-600">Quitar de la lista</button>
              </form>
            </div>
          ) : <p className="px-1 text-sm text-suave">Vive en la caja de Setto: si lo marcás comprado o lo quitás, se actualiza allá también.</p>}
          </div>
        </details>
      </div>
    </main>
  );
}

/** Un ajuste dentro de "Más opciones": título con ícono, el campo y una línea que explica para qué sirve. */
function Bloque({ emoji, titulo, ayuda, children }: { emoji: string; titulo: string; ayuda?: string | null; children: React.ReactNode }) {
  return (
    <div className="space-y-2 px-4 py-4">
      <p className="text-[15px] font-bold"><span className="mr-1.5">{emoji}</span>{titulo}</p>
      {children}
      {ayuda && <p className={ayudaCls}>{ayuda}</p>}
    </div>
  );
}
