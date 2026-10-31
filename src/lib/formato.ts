export const pesos = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(Number(n));

/** Filtro de búsqueda seguro para PostgREST: nombre, marca o EAN. */
export const filtroBusqueda = (q: string) => {
  const t = q.replace(/[,()%*\\:"']/g, " ").trim();
  const ean = q.replace(/\D/g, "") || "0";
  return `nombre.ilike.%${t}%,marca.ilike.%${t}%,ean.eq.${ean}`;
};
