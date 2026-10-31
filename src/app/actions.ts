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
}

export async function salir() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
