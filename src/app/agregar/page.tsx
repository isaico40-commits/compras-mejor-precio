import { Encabezado } from "@/components/ui";
import { AgregarDesdeTexto } from "@/components/AgregarDesdeTexto";
import { parsearItems } from "@/lib/parsear";

/**
 * /agregar recibe:
 *  - lo compartido desde otra app (Web Share Target): ?title=…&text=…
 *  - un link de rutina o acceso directo: ?item=azúcar,leche&auto=1
 *  - el atajo de voz del ícono: ?voz=1
 */
export default async function AgregarPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const texto = [sp.title, sp.text, sp.item].filter(Boolean).join("\n");
  const items = parsearItems(texto);
  return (
    <main>
      <Encabezado titulo="Agregar" sub={items.length ? "Revisá y agregá a la lista" : "Dictá lo que necesitás"} />
      <div className="px-4">
        <AgregarDesdeTexto inicial={items} auto={sp.auto === "1"} voz={sp.voz === "1"} />
      </div>
    </main>
  );
}
