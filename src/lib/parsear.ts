/**
 * Convierte texto libre (una nota, un dictado) en ítems de la lista.
 * "Azúcar, leche y yerba" / "- harina\n- 2 cremas\n☐ manteca" -> ["Azúcar", "leche", "yerba"] / ["harina", "2 cremas", "manteca"]
 */
export function parsearItems(texto: string | null | undefined): string[] {
  if (!texto) return [];
  const partes = texto
    .replace(/https?:\/\/\S+/g, " ")               // links compartidos
    .split(/\r?\n|,|;|\s+y\s+|\s+e\s+|\s+más\s+|\s+mas\s+/i)
    .map((p) => p
      .replace(/^[\s\-–•*·☐☑✓✔▢□■●>]+/, "")       // viñetas y casillas
      .replace(/^\[\s?[xX]?\s?\]\s*/, "")           // [ ] y [x]
      .replace(/^\d+[.)]\s+/, "")                   // 1. 2)
      .replace(/\s+/g, " ")
      .replace(/[.!]+$/, "")
      .trim())
    .filter((p) => p.length > 1 && p.length < 80);
  const vistos = new Set<string>();
  return partes.filter((p) => { const k = p.toLowerCase(); if (vistos.has(k)) return false; vistos.add(k); return true; })
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .slice(0, 40);
}
