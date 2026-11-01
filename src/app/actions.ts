"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { esRubro, type Rubro } from "@/lib/rubros";
import { marcarEnSetto, actualizarEnSetto, agregarEnSetto } from "@/lib/setto";

const num = (v: FormDataEntryValue | null) => (v === null || v === "" ? null : Number(v));
const txt = (v: FormDataEntryValue | null) => (v === null || v === "" ? null : String(v).trim());

/** Lugar elegido en un formulario: uno de la lista o uno nuevo escrito a mano (se crea si no existe). */
async function resolverLugar(supabase: Awaited<ReturnType<typeof createClient>>, form: FormData, campo = "supermercado_id") {
  const nuevo = txt(form.get("nuevo_lugar"))?.replace(/\s+/g, " ");
  if (nuevo) {
    // "4000 kg", "$3500", "2 un" no son lugares: seguramente era un precio o una cantidad
    if (/^[\s$]*\d/.test(nuevo) || !/[a-záéíóúñ]{3,}/i.test(nuevo.replace(/\b(kg|kgs|gr|grs|lt|lts|ml|un|unidades?|kilos?|litros?|pesos?)\b/gi, ""))) {
      throw new Error(`"${nuevo}" parece un precio o una cantidad, no el nombre de un lugar.`);
    }
    const { data: existe } = await supabase.from("supermercados").select("id").ilike("nombre", nuevo).limit(1).maybeSingle();
    if (existe) return existe.id as string;
    const { data, error } = await supabase.from("supermercados").insert({ nombre: nuevo }).select("id").single();
    if (error) throw new Error(error.message);
    return data.id as string;
  }
  return txt(form.get(campo));
}

export async function crearLista(form: FormData) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("listas")
    .insert({ nombre: txt(form.get("nombre")) ?? "Compras frecuentes" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  redirect(`/lista/${data.id}`);
}

export async function agregarItem(form: FormData) {
  const listaId = String(form.get("lista_id"));
  const supabase = await createClient();
  const { error } = await supabase.from("lista_items").upsert(
    {
      lista_id: listaId,
      producto_id: String(form.get("producto_id")),
      cantidad: num(form.get("cantidad")) ?? 1,
      frecuencia_dias: num(form.get("frecuencia_dias")),
      lugar_id: txt(form.get("lugar_id")),
    },
    { onConflict: "lista_id,producto_id" },
  );
  if (error) throw new Error(error.message);
  revalidatePath(`/lista/${listaId}`);
}

export async function quitarItem(form: FormData) {
  const listaId = String(form.get("lista_id"));
  const supabase = await createClient();
  await supabase.from("lista_items").delete().eq("id", String(form.get("id")));
  revalidatePath(`/lista/${listaId}`);
}

export async function crearProducto(form: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.from("productos").insert({
    nombre: txt(form.get("nombre")),
    marca: txt(form.get("marca")),
    categoria: txt(form.get("categoria")),
    cantidad: num(form.get("cantidad")),
    unidad: txt(form.get("unidad")),
    ean: txt(form.get("ean")),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/productos");
  redirect(`/precios?q=${encodeURIComponent(String(form.get("nombre") ?? ""))}`);
}

export async function cargarPrecio(form: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.from("precios").insert({
    producto_id: String(form.get("producto_id")),
    supermercado_id: String(form.get("supermercado_id")),
    precio: num(form.get("precio")),
    precio_promo: num(form.get("precio_promo")),
    promo_detalle: txt(form.get("promo_detalle")),
    fecha: txt(form.get("fecha")) ?? undefined,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/precios");
  revalidatePath("/");
  redirect("/precios?ok=1");
}

export async function salir() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function marcarComprado(form: FormData) {
  const supabase = await createClient();
  const deshacer = form.get("deshacer") === "1";
  const hoy = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  await supabase
    .from("lista_items")
    .update({ ultima_compra: deshacer ? null : hoy })
    .eq("id", String(form.get("id")));
  revalidatePath("/super");
  revalidatePath("/");
}

export async function vincularAlias(form: FormData) {
  const supabase = await createClient();
  const producto = String(form.get("producto_id") ?? "");
  const { error } = await supabase.from("alias_productos").upsert(
    { texto: String(form.get("texto")), producto_id: producto || null },
    { onConflict: "user_id,texto" },
  );
  if (error) throw new Error(error.message);
  revalidatePath("/setto");
  revalidatePath("/super");
}

export async function desvincularAlias(form: FormData) {
  const supabase = await createClient();
  await supabase.from("alias_productos").delete().eq("texto", String(form.get("texto")));
  revalidatePath("/setto");
  revalidatePath("/super");
}

export async function cambiarLugar(form: FormData) {
  const listaId = String(form.get("lista_id"));
  const supabase = await createClient();
  await supabase.from("lista_items").update({ lugar_id: txt(form.get("lugar_id")) }).eq("id", String(form.get("id")));
  revalidatePath(`/lista/${listaId}`);
  revalidatePath("/super");
}

async function idListaPorDefecto(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.from("listas").select("id").order("created_at").limit(1).maybeSingle();
  if (data) return data.id as string;
  const { data: nueva, error } = await supabase.from("listas").insert({ nombre: "Mi lista" }).select("id").single();
  if (error) throw new Error(error.message);
  return nueva.id as string;
}

/** Agrega un ítem genérico ("Azúcar") o un producto puntual a la lista. */
export async function agregarALista(form: FormData) {
  const supabase = await createClient();
  const productoId = txt(form.get("producto_id"));
  const nombre = txt(form.get("nombre"));
  // Una sola lista: lo que se agrega por nombre va a la caja de Setto (sin duplicar)
  if (!productoId && nombre) {
    const cant = num(form.get("cantidad"));
    const id = await agregarEnSetto(supabase, nombre, cant && cant > 1 ? String(cant) : null).catch(() => null);
    if (id) { revalidatePath("/"); return; }
  }
  const listaId = await idListaPorDefecto(supabase);
  const fila = {
    lista_id: listaId,
    producto_id: productoId,
    nombre: productoId ? null : nombre,
    termino: productoId ? null : nombre?.toLowerCase(),
    cantidad: num(form.get("cantidad")) ?? 1,
  };
  const { error } = productoId
    ? await supabase.from("lista_items").upsert({ ...fila, ultima_compra: null }, { onConflict: "lista_id,producto_id" })
    : await supabase.from("lista_items").insert(fila);
  if (error) throw new Error(error.message);
  revalidatePath("/");
}

/** Guarda los ajustes de un ítem propio. */
export async function guardarItem(form: FormData) {
  const supabase = await createClient();
  const id = String(form.get("id"));
  const cambios: Record<string, unknown> = {};
  if (form.has("termino")) cambios.termino = txt(form.get("termino"))?.toLowerCase() ?? null;
  if (form.has("nombre")) {
    cambios.nombre = txt(form.get("nombre"));
    if (cambios.nombre) cambios.termino = String(cambios.nombre).toLowerCase();
  }
  if (form.has("cantidad")) cambios.cantidad = num(form.get("cantidad")) ?? 1;
  if (form.has("frecuencia_dias")) cambios.frecuencia_dias = num(form.get("frecuencia_dias"));
  if (form.has("lugar_id") || form.has("nuevo_lugar")) cambios.lugar_id = await resolverLugar(supabase, form, "lugar_id");
  if (form.has("producto_id")) cambios.producto_id = txt(form.get("producto_id"));
  if (form.has("rubro")) { const r = txt(form.get("rubro")); cambios.rubro = esRubro(r) ? r : null; }
  const { error } = await supabase.from("lista_items").update(cambios).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/");
  if (form.get("volver")) redirect("/");
  revalidatePath(`/item/mio/${id}`);
}

export async function borrarItem(form: FormData) {
  const supabase = await createClient();
  await supabase.from("lista_items").delete().eq("id", String(form.get("id")));
  revalidatePath("/");
  redirect("/");
}

/** Ajustes de un ítem de Setto: término de búsqueda y producto fijado (se guardan como alias). */
export async function guardarSetto(form: FormData) {
  const supabase = await createClient();
  const texto = String(form.get("texto"));
  const { data: actual } = await supabase.from("alias_productos").select("termino, producto_id, nombre, lugar_id, rubro").eq("texto", texto).maybeSingle();
  const nombre = form.has("nombre") ? txt(form.get("nombre")) : actual?.nombre ?? null;
  const fila = {
    texto,
    nombre,
    termino: form.has("nombre") && nombre
      ? nombre.toLowerCase()
      : form.has("termino") ? txt(form.get("termino"))?.toLowerCase() ?? null : actual?.termino ?? null,
    producto_id: form.has("producto_id") ? txt(form.get("producto_id")) : actual?.producto_id ?? null,
    lugar_id: form.has("lugar_id") || form.has("nuevo_lugar") ? await resolverLugar(supabase, form, "lugar_id") : actual?.lugar_id ?? null,
    rubro: form.has("rubro") ? (esRubro(txt(form.get("rubro"))) ? txt(form.get("rubro")) : null) : actual?.rubro ?? null,
  };
  const { error } = await supabase.from("alias_productos").upsert(fila, { onConflict: "user_id,texto" });
  if (error) throw new Error(error.message);
  revalidatePath("/");
  if (form.get("volver")) redirect("/");
  revalidatePath(`/item/setto/${String(form.get("id"))}`);
}

const MEDIDAS: Record<string, { unidad: string; factor: number }> = {
  kg: { unidad: "kg", factor: 1 },
  medio_kg: { unidad: "kg", factor: 0.5 },
  g: { unidad: "gr", factor: 1 },
  l: { unidad: "lt", factor: 1 },
  ml: { unidad: "ml", factor: 1 },
  u: { unidad: "un", factor: 1 },
};

/** Lee medida + cantidad del formulario: "medio_kg" + 2 -> 1 kg. */
function leerMedida(form: FormData) {
  const m = MEDIDAS[String(form.get("medida") ?? "u")] ?? MEDIDAS.u;
  const cant = (num(form.get("cantidad")) ?? 1) * m.factor;
  return { unidad: m.unidad, cantidad: cant };
}

/** Carga un precio. Si no viene producto_id, crea (o reusa) un producto propio con nombre y medida. */
export async function guardarPrecioNuevo(form: FormData) {
  const supabase = await createClient();
  let productoId = txt(form.get("producto_id"));
  if (!productoId) {
    const nombre = txt(form.get("nombre"));
    if (!nombre) throw new Error("Falta el nombre del producto");
    const { unidad, cantidad } = leerMedida(form);
    const { data: existente } = await supabase
      .from("productos").select("id").ilike("nombre", nombre).eq("unidad", unidad).eq("cantidad", cantidad).is("ean", null).limit(1).maybeSingle();
    if (existente) productoId = existente.id;
    else {
      const { data: nuevo, error } = await supabase
        .from("productos").insert({ nombre, unidad, cantidad, marca: txt(form.get("marca")) }).select("id").single();
      if (error) throw new Error(error.message);
      productoId = nuevo.id;
    }
  }
  const superId = await resolverLugar(supabase, form);
  if (!superId) throw new Error("Elegí o escribí dónde lo comprás");
  const { error } = await supabase.from("precios").insert({
    producto_id: productoId,
    supermercado_id: superId,
    precio: num(form.get("precio")),
    precio_promo: num(form.get("precio_promo")),
    promo_detalle: txt(form.get("promo_detalle")),
    fecha: txt(form.get("fecha")) ?? undefined,
  });
  if (error) throw new Error(error.message);

  // Si se cargó desde un ítem de la lista: queda fijado a este producto y a este lugar
  const [origen, itemId] = String(form.get("item") ?? "").split(":");
  if (origen === "mio" && itemId) {
    await supabase.from("lista_items").update({ producto_id: productoId, lugar_id: superId }).eq("id", itemId);
  } else if (origen === "setto" && itemId) {
    const texto = txt(form.get("texto"));
    if (texto) {
      const { data: actual } = await supabase.from("alias_productos").select("nombre, termino").eq("texto", texto).maybeSingle();
      await supabase.from("alias_productos").upsert(
        { texto, producto_id: productoId, lugar_id: superId, nombre: actual?.nombre ?? null, termino: actual?.termino ?? null },
        { onConflict: "user_id,texto" },
      );
    }
  }
  revalidatePath("/precios");
  revalidatePath("/");
  redirect("/precios?ok=1");
}

export async function editarPrecio(form: FormData) {
  const supabase = await createClient();
  const id = String(form.get("id"));
  const superId = await resolverLugar(supabase, form);
  if (!superId) throw new Error("Elegí o escribí dónde lo comprás");
  const { error } = await supabase.from("precios").update({
    supermercado_id: superId,
    precio: num(form.get("precio")),
    precio_promo: num(form.get("precio_promo")),
    promo_detalle: txt(form.get("promo_detalle")),
    fecha: txt(form.get("fecha")) ?? undefined,
  }).eq("id", id);
  if (error) throw new Error(error.message);
  const productoId = txt(form.get("producto_id"));
  if (productoId && form.has("nombre")) {
    const { unidad, cantidad } = leerMedida(form);
    await supabase.from("productos").update({ nombre: txt(form.get("nombre")), unidad, cantidad }).eq("id", productoId);
  }
  revalidatePath("/precios");
  revalidatePath("/");
  redirect("/precios?ok=1");
}

export async function borrarPrecio(form: FormData) {
  const supabase = await createClient();
  await supabase.from("precios").delete().eq("id", String(form.get("id")));
  revalidatePath("/precios");
  revalidatePath("/");
  redirect("/precios");
}

/** Calcula en segundo plano el mejor precio de los términos que falten o estén viejos. */
export async function analizarPendientes(terminos: string[], dims: (string | null)[]) {
  if (!terminos.length) return 0;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("analizar_terminos2", { p_terminos: terminos.slice(0, 40), p_dims: dims.slice(0, 40) });
  if (error) throw new Error(error.message);
  return data as number;
}

export type ItemCarrito = {
  origen: "mio" | "setto"; itemId: string; titulo: string; termino: string; productoId: string | null;
  precio: number | null;      // precio unitario confirmado al comprar
  texto?: string;             // clave del alias (ítems de Setto)
};

/** Fin de la compra en el súper: guarda el historial, tacha lo propio y marca lo de Setto en la caja. */
export async function terminarCompra(superId: string, items: ItemCarrito[]) {
  const supabase = await createClient();
  const hoy = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const mios = items.filter((i) => i.origen === "mio").map((i) => i.itemId);
  const setto = items.filter((i) => i.origen === "setto").map((i) => i.itemId);
  const clave = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const esUuid = /^[0-9a-f-]{36}$/i.test(superId);

  const [hist, propios] = await Promise.all([
    items.length
      ? supabase.from("compras_historial").insert(items.map((i) => ({
          clave: clave(i.termino || i.titulo), nombre: i.titulo, producto_id: i.productoId,
          supermercado_id: esUuid ? superId : null, precio: i.precio, fecha: hoy, origen: i.origen,
        })))
      : Promise.resolve({ error: null }),
    mios.length ? supabase.from("lista_items").update({ ultima_compra: hoy }).in("id", mios) : Promise.resolve({ error: null }),
  ]);
  if (hist.error) throw new Error(hist.error.message);
  if (propios.error) throw new Error(propios.error.message);

  // El precio que confirmaste al comprar queda como precio real de ese súper
  const reales = items.filter((i) => esUuid && i.productoId && i.precio && i.precio > 0);
  if (reales.length) {
    await supabase.from("precios").insert(reales.map((i) => ({
      producto_id: i.productoId, supermercado_id: superId, precio: i.precio, fecha: hoy, promo_detalle: "Confirmado al comprar",
    })));
  }

  let settoError: string | null = null;
  try { await marcarEnSetto(supabase, setto); } catch (e) { settoError = (e as Error).message; }
  revalidatePath("/");
  revalidatePath("/super");
  return { ok: true, settoError };
}

/** Sube la foto de un ticket (ya comprimida en el celu) para que Claude la cargue después. */
export async function subirTicket(base64: string, tipo: string, nota: string | null) {
  const supabase = await createClient();
  const hex = "\\x" + Buffer.from(base64, "base64").toString("hex");
  const { error } = await supabase.from("ticket_fotos").insert({ foto: hex, tipo, nota: nota || null });
  if (error) throw new Error(error.message);
  revalidatePath("/tickets");
  return { ok: true };
}

/** Alta o edición de un descuento por día / súper / medio de pago */
export async function guardarDescuento(form: FormData) {
  const supabase = await createClient();
  const superId = await resolverLugar(supabase, form);
  if (!superId) throw new Error("Elegí o escribí el lugar");
  const dias = form.getAll("dias").map(Number).filter((n) => n >= 0 && n <= 6);
  if (!dias.length) throw new Error("Elegí al menos un día");
  const fila = {
    supermercado_id: superId, dias,
    medio: txt(form.get("medio")) ?? "Otro",
    porcentaje: num(form.get("porcentaje")),
    tope: num(form.get("tope")),
    tope_periodo: txt(form.get("tope_periodo")),
    minimo: num(form.get("minimo")),
    detalle: txt(form.get("detalle")),
    hasta: txt(form.get("hasta")),
  };
  const id = txt(form.get("id"));
  const hoy = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const { error } = id
    ? await supabase.from("descuentos").update({ ...fila, verificado: hoy }).eq("id", id)
    : await supabase.from("descuentos").insert({ ...fila, fuente: "manual", verificado: hoy });
  if (error) throw new Error(error.message);
  revalidatePath("/descuentos");
  revalidatePath("/");
  redirect("/descuentos?ok=1");
}

export async function borrarDescuento(form: FormData) {
  const supabase = await createClient();
  await supabase.from("descuentos").delete().eq("id", String(form.get("id")));
  revalidatePath("/descuentos");
  revalidatePath("/");
  redirect("/descuentos");
}

export type ItemLote = { origen: "mio" | "setto"; itemId: string; texto?: string };

/** Quitar varios ítems de la lista (los de Setto quedan como "quitada" en la caja) */
export async function quitarItems(items: ItemLote[]) {
  const supabase = await createClient();
  const mios = items.filter((i) => i.origen === "mio").map((i) => i.itemId);
  const setto = items.filter((i) => i.origen === "setto").map((i) => i.itemId);
  if (mios.length) await supabase.from("lista_items").delete().in("id", mios);
  let settoError: string | null = null;
  try { await actualizarEnSetto(supabase, setto, "quitada"); } catch (e) { settoError = (e as Error).message; }
  revalidatePath("/");
  return { settoError };
}

/** Anotar varios ítems para comprar en un lugar (vacío = donde esté más barato) */
export async function lugarItems(items: ItemLote[], lugarId: string | null, nuevoLugar: string | null) {
  const supabase = await createClient();
  const fd = new FormData();
  if (nuevoLugar) fd.set("nuevo_lugar", nuevoLugar);
  if (lugarId) fd.set("lugar_id", lugarId);
  const id = await resolverLugar(supabase, fd, "lugar_id");
  const mios = items.filter((i) => i.origen === "mio").map((i) => i.itemId);
  if (mios.length) await supabase.from("lista_items").update({ lugar_id: id }).in("id", mios);
  const setto = items.filter((i) => i.origen === "setto" && i.texto);
  if (setto.length) {
    const { data: actuales } = await supabase.from("alias_productos").select("texto, producto_id, nombre, termino, rubro").in("texto", setto.map((i) => i.texto!));
    const porTexto = new Map((actuales ?? []).map((a) => [a.texto, a]));
    await supabase.from("alias_productos").upsert(
      setto.map((i) => ({ ...(porTexto.get(i.texto!) ?? { producto_id: null, nombre: null, termino: null, rubro: null }), texto: i.texto!, lugar_id: id })),
      { onConflict: "user_id,texto" },
    );
  }
  revalidatePath("/");
}

/** Agrega varios ítems de una (nota compartida, dictado por voz). Van a la caja de Setto sin duplicar. */
export async function agregarVarios(nombres: string[]) {
  const supabase = await createClient();
  let n = 0;
  for (const nombre of nombres.map((x) => x.trim()).filter(Boolean).slice(0, 40)) {
    const id = await agregarEnSetto(supabase, nombre).catch(() => null);
    if (!id) {
      const listaId = await idListaPorDefecto(supabase);
      const { error } = await supabase.from("lista_items").insert({ lista_id: listaId, nombre, termino: nombre.toLowerCase(), cantidad: 1 });
      if (error) throw new Error(error.message);
    }
    n++;
  }
  revalidatePath("/");
  return { n };
}

/** Rubro de varios ítems (null = detectarlo por el nombre) */
export async function rubroItems(items: ItemLote[], rubro: Rubro | null) {
  const supabase = await createClient();
  const r = esRubro(rubro) ? rubro : null;
  const mios = items.filter((i) => i.origen === "mio").map((i) => i.itemId);
  if (mios.length) await supabase.from("lista_items").update({ rubro: r }).in("id", mios);
  const setto = items.filter((i) => i.origen === "setto" && i.texto);
  if (setto.length) {
    const { data: actuales } = await supabase.from("alias_productos").select("texto, producto_id, nombre, termino, lugar_id").in("texto", setto.map((i) => i.texto!));
    const porTexto = new Map((actuales ?? []).map((a) => [a.texto, a]));
    await supabase.from("alias_productos").upsert(
      setto.map((i) => ({ ...(porTexto.get(i.texto!) ?? { producto_id: null, nombre: null, termino: null, lugar_id: null }), texto: i.texto!, rubro: r })),
      { onConflict: "user_id,texto" },
    );
  }
  revalidatePath("/");
  revalidatePath("/super");
}

/** Comercio habitual de un rubro ("mi verdulería"). Vacío = ninguno. */
export async function guardarHabitual(form: FormData) {
  const supabase = await createClient();
  const rubro = txt(form.get("rubro"));
  if (!esRubro(rubro) || rubro === "super") throw new Error("Rubro inválido");
  const lugarId = await resolverLugar(supabase, form, "lugar_id");
  const { error } = lugarId
    ? await supabase.from("rubros_habituales").upsert({ rubro, lugar_id: lugarId }, { onConflict: "user_id,rubro" })
    : await supabase.from("rubros_habituales").delete().eq("rubro", rubro);
  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath("/super");
  const volver = txt(form.get("volver_a"));
  if (volver?.startsWith("/item/")) revalidatePath(volver);
}

/** Precio pagado cargado a mano (ítems de verdulería, bazar u otros comercios). */
export async function guardarPagado(form: FormData) {
  const supabase = await createClient();
  const precio = num(form.get("precio"));
  if (!precio || precio <= 0) throw new Error("Poné el precio");
  const nombre = String(form.get("nombre") ?? "").trim();
  const clave = String(form.get("clave") ?? "").trim();
  const lugarId = await resolverLugar(supabase, form, "lugar_id");
  const hoy = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const { error } = await supabase.from("compras_historial").insert({
    clave, nombre, precio, supermercado_id: lugarId, fecha: txt(form.get("fecha")) ?? hoy, origen: "manual",
  });
  if (error) throw new Error(error.message);
  revalidatePath("/");
  const volver = txt(form.get("volver_a"));
  if (volver?.startsWith("/item/")) revalidatePath(volver);
}
