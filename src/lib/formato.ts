export const pesos = (n: number | null | undefined) =>
  n == null ? "—" : "$" + new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(Math.round(Number(n)));

export const etiquetaDim: Record<string, string> = { kg: "kg", l: "litro", u: "u", m: "m", p: "paño" };

/** "$1.290/kg" */
export const porUnidad = (n: number | null | undefined, dim: string | null | undefined) =>
  n == null || !dim ? ""
    : dim === "m" || dim === "p" ? `$${new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n))}/${dim === "m" ? "m" : "paño"}`
    : `${pesos(n)}/${dim === "l" ? "l" : etiquetaDim[dim] ?? dim}`;

/** 0.8 kg -> "800 g"; 1.5 l -> "1,5 l"; 30 u -> "30 u" */
export function presentacion(cant: number | null | undefined, dim: string | null | undefined) {
  if (cant == null || !dim) return "";
  const c = Number(cant);
  const f = (x: number) => new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(x);
  if (dim === "kg") return c < 1 ? `${f(c * 1000)} g` : `${f(c)} kg`;
  if (dim === "l") return c < 1 ? `${f(c * 1000)} ml` : `${f(c)} l`;
  if (dim === "m") return `${f(c)} m`;
  if (dim === "p") return `${f(c)} paños`;
  return c > 1 ? `${f(c)} u` : "";
}

/** Filtro de búsqueda seguro para PostgREST: nombre, marca o EAN. */
export const filtroBusqueda = (q: string) => {
  const t = q.replace(/[,()%*\\:"']/g, " ").trim();
  const ean = q.replace(/\D/g, "") || "0";
  return `nombre.ilike.%${t}%,marca.ilike.%${t}%,ean.eq.${ean}`;
};

/** minúsculas, sin acentos ni espacios extra */
export const normalizar = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Palabra de la unidad de comparación: "kilo", "litro", "metro", "unidad" */
export const palabraDim = (d: string | null | undefined) =>
  d === "l" ? "litro" : d === "u" ? "unidad" : d === "m" ? "metro" : d === "p" ? "paño" : "kilo";

/** Productos que se comparan por metros (por ahora, papel higiénico) */
export const esPorMetro = (t: string | null | undefined) => /\bpapel\s*higi|^p\.?\s*higi/.test(normalizar(t));

/** Rollo de cocina: se compara por paño */
export const esRolloCocina = (t: string | null | undefined) => /^(rollos?|ro\.?) (de )?coc|\brollos? (de )?cocina|\btoallas? de cocina|\bpapel de cocina/.test(normalizar(t));

/** "pañales | xg" o "papel higienico | doble | 30m" -> base + filtros (hoja, metros por rollo, texto libre) */
export function partirTermino(t: string | null | undefined) {
  const [base, ...resto] = (t ?? "").split("|").map((s) => s.trim());
  let hoja: string | null = null, minRollo: number | null = null;
  const texto: string[] = [];
  for (const s of resto) {
    const l = s.toLowerCase();
    if (/^(simple|doble|triple)$/.test(l)) hoja = l;
    else if (/^\d{1,3}\s*m$/.test(l)) minRollo = Number(l.replace(/\D/g, ""));
    else if (l) texto.push(s);
  }
  return { base: base ?? "", hoja, minRollo, texto: texto.join(", ") };
}

/** Arma el término con filtros. "texto" admite varias palabras separadas por coma: "xg, ahorro" */
export function unirTermino(base: string, hoja: string | null, minRollo: number | null, texto?: string | null) {
  const libres = (texto ?? "").split(",").map((s) => s.replace(/\|/g, " ").trim()).filter(Boolean);
  return [base.trim(), hoja, minRollo ? `${minRollo}m` : null, ...libres].filter(Boolean).join(" | ");
}
