import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Encabezado } from "@/components/ui";
import { Escaner } from "@/components/Escaner";
import { leerDescuentos, mejorDescuento, hoyAR } from "@/lib/descuentos";

export const dynamic = "force-dynamic";

/** Carrito virtual: escaneás códigos de barras en el súper y ves si pagás de más. */
export default async function EscanearPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const superId = (await searchParams).s;
  const supabase = await createClient();
  const [{ data: supers }, descuentos] = await Promise.all([
    supabase.from("supermercados").select("id, nombre").eq("oculto", false).order("nombre"),
    leerDescuentos(supabase).catch(() => []),
  ]);
  const actual = supers?.find((s) => s.id === superId);

  if (!actual) {
    return (
      <main>
        <Encabezado titulo="Escanear" sub="¿En qué súper estás?" />
        <ul className="grid grid-cols-2 gap-2 px-4 pb-28">
          {supers?.map((s) => (
            <li key={s.id}>
              <Link href={`/escanear?s=${s.id}`} className="block rounded-2xl bg-cielo px-4 py-4 font-semibold text-cielo-tinta active:opacity-80">{s.nombre}</Link>
            </li>
          ))}
        </ul>
      </main>
    );
  }

  const d = mejorDescuento(descuentos, actual.id, hoyAR().dia);
  return (
    <main>
      <Encabezado titulo={`Carrito en ${actual.nombre}`} sub="Escaneá lo que vas llevando">
        <Link href={`/super?s=${actual.id}`} className="pb-1 text-sm font-semibold text-marca">Lista</Link>
      </Encabezado>
      <Escaner
        superId={actual.id}
        nombreSuper={actual.nombre}
        promo={d ? { porcentaje: d.porcentaje, tope: d.tope, minimo: d.minimo, medio: d.medio } : null}
      />
    </main>
  );
}
