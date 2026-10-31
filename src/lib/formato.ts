export const pesos = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(Number(n));
