import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { editarPrecio, borrarPrecio } from "@/app/actions";
import { Encabezado, Tarjeta, inputCls, btnCls, btnSecCls } from "@/components/ui";
import { CamposMedida, CamposPrecio, medidaDe } from "@/components/FormPrecio";

export default async function EditarPrecioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: p }, { data: supers }] = await Promise.all([
    supabase
      .from("precios")
      .select("id, precio, precio_promo, promo_detalle, fecha, supermercado_id, cargado_por, productos(id, nombre, cantidad, unidad, creado_por)")
      .eq("id", id).maybeSingle(),
    supabase.from("supermercados").select("id, nombre").order("nombre"),
  ]);
  if (!p || p.cargado_por !== user?.id) notFound();
  const prod = p.productos as unknown as { id: string; nombre: string; cantidad: number | null; unidad: string | null; creado_por: string | null };
  const propio = prod.creado_por === user?.id;
  const m = medidaDe(prod.cantidad != null ? Number(prod.cantidad) : null, prod.unidad);

  return (
    <main>
      <Encabezado titulo="Editar precio" sub={propio ? undefined : prod.nombre}>
        <Link href="/precios" className="pb-1 text-sm font-semibold text-marca">Volver</Link>
      </Encabezado>
      <div className="space-y-4 px-4">
        <Tarjeta className="p-4">
          <form action={editarPrecio} className="space-y-3">
            <input type="hidden" name="id" value={p.id} />
            {propio && (
              <>
                <input type="hidden" name="producto_id" value={prod.id} />
                <label className="block text-sm font-semibold">Producto
                  <input name="nombre" required defaultValue={prod.nombre} className={`${inputCls} mt-1`} />
                </label>
                <CamposMedida medida={m.medida} cant={m.cant} />
              </>
            )}
            <CamposPrecio supers={supers ?? []} superId={p.supermercado_id} precio={p.precio} promo={p.precio_promo} detalle={p.promo_detalle} fecha={p.fecha} />
            <button className={`${btnCls} w-full`}>Guardar cambios</button>
          </form>
        </Tarjeta>
        <form action={borrarPrecio}>
          <input type="hidden" name="id" value={p.id} />
          <button className={`${btnSecCls} w-full text-red-600`}>Borrar este precio</button>
        </form>
        {!propio && <p className="px-1 text-xs text-suave">El nombre y la medida vienen del catálogo de los súpers y no se pueden cambiar.</p>}
      </div>
    </main>
  );
}
