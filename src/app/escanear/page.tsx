import { redirect } from "next/navigation";

/** El escáner ahora vive dentro de "En el súper" (lista y carrito en una sola pantalla). */
export default async function EscanearPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const s = (await searchParams).s;
  redirect(s ? `/super?s=${s}` : "/super");
}
