"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const num = (v: FormDataEntryValue | null) => (v === null || v === "" ? null : Number(v));
const txt = (v: FormDataEntryValue | null) => (v === null || v === "" ? null : String(v).trim());

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
  const listaId = await idListaPorDefecto(supabase);
  const productoId = txt(form.get("producto_id"));
  const nombre = txt(form.get("nombre"));
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
  redirect("/");
}

/** Guarda los ajustes de un ítem propio. */
export async function guardarItem(form: FormData) {
  const supabase = await createClient();
  const id = String(form.get("id"));
  const cambios: Record<string, unknown> = {};
  if (form.has("termino")) cambios.termino = txt(form.get("termino"))?.toLowerCase() ?? null;
  if (form.has("cantidad")) cambios.cantidad = num(form.get("cantidad")) ?? 1;
  if (form.has("frecuencia_dias")) cambios.frecuencia_dias = num(form.get("frecuencia_dias"));
  if (form.has("lugar_id")) cambios.lugar_id = txt(form.get("lugar_id"));
  if (form.has("producto_id")) cambios.producto_id = txt(form.get("producto_id"));
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
  const { data: actual } = await supabase.from("alias_productos").select("termino, producto_id").eq("texto", texto).maybeSingle();
  const fila = {
    texto,
    termino: form.has("termino") ? txt(form.get("termino"))?.toLowerCase() ?? null : actual?.termino ?? null,
    producto_id: form.has("producto_id") ? txt(form.get("producto_id")) : actual?.producto_id ?? null,
  };
  const { error } = await supabase.from("alias_productos").upsert(fila, { onConflict: "user_id,texto" });
  if (error) throw new Error(error.message);
  revalidatePath("/");
  if (form.get("volver")) redirect("/");
  revalidatePath(`/item/setto/${String(form.get("id"))}`);
}
