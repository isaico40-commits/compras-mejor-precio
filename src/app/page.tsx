import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { crearLista, salir } from "./actions";

export default async function Home() {
  const supabase = await createClient();
  const { data: listas } = await supabase.from("listas").select("id, nombre, lista_items(count)").order("created_at");

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Mis listas</h1>
        <form action={salir}><button className="text-sm text-neutral-500">Salir</button></form>
      </div>

      <ul className="space-y-2">
        {listas?.map((l) => (
          <li key={l.id}>
            <Link href={`/lista/${l.id}`} className="flex justify-between rounded border bg-white p-4 hover:border-emerald-600">
              <span className="font-medium">{l.nombre}</span>
              <span className="text-sm text-neutral-500">{l.lista_items?.[0]?.count ?? 0} productos</span>
            </Link>
          </li>
        ))}
        {!listas?.length && <p className="text-neutral-500">Todavía no tenés listas. Creá la primera.</p>}
      </ul>

      <form action={crearLista} className="flex gap-2">
        <input name="nombre" placeholder="Ej: Compra semanal" className="flex-1 rounded border p-2" />
        <button className="rounded bg-emerald-600 px-4 font-semibold text-white">Crear lista</button>
      </form>
    </main>
  );
}
