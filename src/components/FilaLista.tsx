import Link from "next/link";
import type { Entrada } from "@/lib/lista";
import { pesos, porUnidad, presentacion } from "@/lib/formato";
import { marcarComprado } from "@/app/actions";

export function Fila({ e, grupoId }: { e: Entrada; grupoId: string }) {
  const r = e.recomendado;
  const enOtroLado = r && e.lugar && r.superId !== grupoId;
  return (
    <li className="flex items-start gap-3 px-3 py-3">
      {e.origen === "mio" ? (
        <form action={marcarComprado} className="pt-0.5">
          <input type="hidden" name="id" value={e.itemId} />
          <button aria-label="Marcar comprado" className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-linea active:border-marca active:bg-marca-suave" />
        </form>
      ) : (
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-fondo text-[10px] font-bold text-suave" title="De la caja de Setto">S</span>
      )}
      <Link href={`/item/${e.origen}/${e.itemId}`} className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold leading-snug">
            {e.urgente && <span className="text-alerta">● </span>}
            {e.cantidad > 1 && <span className="num text-suave">{e.cantidad}× </span>}
            {e.titulo}
            {e.cantidadTexto && <span className="font-normal text-suave"> · {e.cantidadTexto}</span>}
          </p>
          {r?.precio != null && !enOtroLado && (
            <span className="shrink-0 text-right">
              <span className="num block font-semibold">{pesos(r.precio * e.cantidad)}</span>
              <span className="num block text-xs text-suave">
                {e.cantidad > 1 ? `${e.cantidad} × ${pesos(r.precio)}` : porUnidad(r.porUnidad, r.dim)}
              </span>
            </span>
          )}
        </div>
        {r ? (
          <p className="mt-0.5 line-clamp-1 text-sm text-suave">
            {r.nombre !== e.titulo ? r.nombre : ""}
            {presentacion(r.cant, r.dim) && <> · {presentacion(r.cant, r.dim)}</>}
            {(enOtroLado || e.cantidad > 1) && r.porUnidad != null && <> · <span className="num">{porUnidad(r.porUnidad, r.dim)}</span></>}
          </p>
        ) : (
          <p className="mt-0.5 text-sm text-suave">{e.lugar ? "Sin precio cargado" : "No encontré precios. Tocá para ajustar"}</p>
        )}
        {enOtroLado && r && (
          <p className="mt-1 text-sm text-alerta">Más barato en {r.super}: <span className="num">{pesos(r.precio)}</span></p>
        )}
        {e.consejo && <p className="mt-1 text-sm text-marca">💡 {e.consejo}</p>}
      </Link>
    </li>
  );
}
