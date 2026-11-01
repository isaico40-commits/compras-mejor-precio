/** Pantalla de carga: aparece al instante al cambiar de pestaña mientras llegan los datos. */
export function Esqueleto({ titulo, bloques = 3 }: { titulo: string; bloques?: number }) {
  const tonos = ["bg-cielo", "bg-menta", "bg-lila", "bg-durazno"];
  return (
    <main aria-busy="true">
      <header className="px-4 pb-3 pt-5">
        <h1 className="text-[26px] font-bold leading-tight tracking-tight">{titulo}</h1>
        <div className="mt-1.5 h-4 w-40 animate-pulse rounded bg-linea" />
      </header>
      <div className="space-y-4 px-4">
        {Array.from({ length: bloques }, (_, i) => (
          <div key={i} className="overflow-hidden rounded-2xl border border-linea bg-tarjeta">
            <div className={`h-11 animate-pulse ${tonos[i % tonos.length]}`} />
            {[0, 1, 2].map((j) => (
              <div key={j} className="flex items-center gap-3 border-t border-linea px-3 py-3.5">
                <div className="h-7 w-7 rounded-full bg-fondo" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-fondo" />
                  <div className="h-3.5 w-1/3 animate-pulse rounded bg-fondo" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </main>
  );
}
