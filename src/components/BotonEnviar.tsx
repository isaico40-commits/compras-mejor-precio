"use client";

import { useFormStatus } from "react-dom";

/** Botón de formulario con feedback: se deshabilita y muestra el texto de carga mientras se envía (bloquea el doble toque). */
export function BotonEnviar({ children, cargando, className, ...rest }: { children: React.ReactNode; cargando: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending } = useFormStatus();
  return (
    <button {...rest} disabled={pending || rest.disabled} aria-busy={pending} className={`${className ?? ""} disabled:opacity-60`}>
      {pending ? <span className="inline-flex items-center justify-center gap-2"><span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />{cargando}</span> : children}
    </button>
  );
}
