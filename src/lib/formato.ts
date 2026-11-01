export const pesos = (n: number | null | undefined) =>
  n == null ? "—" : "$" + new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(Math.round(Number(n)));

export const etiquetaDim: Record<string, string> = { kg: "kg", l: "litro", u: "u" };

/** "$1.290/kg" */
export const porUnidad = (n: number | null | undefined, dim: string | null | undefined) =>
  n == null || !dim ? "" : `${pesos(n)}/${dim === "l" ? "l" : etiquetaDim[dim] ?? dim}`;

/** 0.8 kg -> "800 g"; 1.5 l -> "1,5 l"; 30 u -> "30 u" */
export function presentacion(cant: number | null | undefined, dim: string | null | undefined) {
  if (cant == null || !dim) return "";
  const c = Number(cant);
  const f = (x: number) => new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(x);
  if (dim === "kg") return c < 1 ? `${f(c * 1000)} g` : `${f(c)} kg`;
  if (dim === "l") return c < 1 ? `${f(c * 1000)} ml` : `${f(c)} l`;
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
