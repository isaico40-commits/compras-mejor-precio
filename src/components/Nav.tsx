import Link from "next/link";

export function Nav() {
  return (
    <nav className="flex flex-wrap gap-x-4 gap-y-1 border-b bg-white p-4 text-sm font-medium">
      <Link href="/super">Estoy en el súper</Link>
      <Link href="/">Mis listas</Link>
      <Link href="/setto">Lista Setto</Link>
      <Link href="/precios">Cargar precio</Link>
      <Link href="/productos">Productos</Link>
    </nav>
  );
}
