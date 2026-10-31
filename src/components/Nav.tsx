import Link from "next/link";

export function Nav() {
  return (
    <nav className="flex gap-4 border-b bg-white p-4 text-sm font-medium">
      <Link href="/">Mis listas</Link>
      <Link href="/precios">Cargar precio</Link>
      <Link href="/productos">Productos</Link>
    </nav>
  );
}
