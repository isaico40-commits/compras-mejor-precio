import { normalizar } from "@/lib/formato";
import type { Rubro } from "@/lib/rubros";

export type Tono = "menta" | "cielo" | "lila" | "durazno" | "limon";
export type Categoria = { id: string; nombre: string; tono: Tono; palabras: string };

// Orden en que aparecen en la lista. Se busca la primera palabra y frases ("dulce de leche").
export const CATEGORIAS: Categoria[] = [
  { id: "verduleria", nombre: "Verdulería", tono: "menta", palabras: "" },
  { id: "lacteos", nombre: "Lácteos", tono: "cielo", palabras: "leche yogur yogurt queso quesos manteca crema ricota muzzarella mozzarella mascarpone|dulce de leche" },
  { id: "almacen", nombre: "Almacén", tono: "limon", palabras: "arroz fideo fideos harina azucar sal aceite yerba cafe te mate cocido galletitas galletita galleta galletas polenta lenteja lentejas poroto porotos atun mayonesa ketchup mostaza vinagre pure cacao chocolate mermelada miel levadura polvo esencia vainilla almidon maicena cereal cereales salsa caldo oregano pimienta condimento gelatina pasta premezcla cobertura grana sprinkles colorante glucosa huevo huevos|pan rallado" },
  { id: "dietetica", nombre: "Dietética", tono: "menta", palabras: "avena granola stevia edulcorante coco nuez nueces almendra almendras mani pasas sesamo chia lino quinoa amaranto matcha tapioca castanas avellana avellanas pistacho pistachos datiles semillas mix girasol psyllium proteina|harina de almendra|harina de coco|harina integral|frutos secos|azucar mascabo|leche de almendras|leche de coco" },
  { id: "bebidas", nombre: "Bebidas", tono: "cielo", palabras: "agua gaseosa coca jugo cerveza vino soda sprite fernet tonica energizante" },
  { id: "carniceria", nombre: "Carnicería", tono: "durazno", palabras: "carne carnes pollo milanesa milanesas chorizo chorizos hamburguesa hamburguesas cerdo bondiola asado vacio matambre nalga peceto cuadril bife bifes osobuco picada costilla costillas pechuga pechugas suprema supremas morcilla mondongo pescado merluza" },
  { id: "fiambres", nombre: "Fiambrería", tono: "limon", palabras: "jamon salame fiambre panceta salchicha salchichas mortadela bondiolita leberwurst" },
  { id: "panaderia", nombre: "Panadería", tono: "limon", palabras: "pan panes facturas medialunas tostadas budin bizcochos prepizza" },
  { id: "congelados", nombre: "Congelados", tono: "cielo", palabras: "helado congelado congelados hielo" },
  { id: "descartables", nombre: "Descartables y packaging", tono: "lila", palabras: "blonda blondas sorbete sorbetes pajita pajitas servilleta servilletas bolsa bolsas film aluminio caja cajas cajita cajitas etiqueta etiquetas sticker stickers tapa tapas descartable descartables rollo|papel aluminio|papel film|vasos descartables|vaso descartable" },
  { id: "limpieza", nombre: "Limpieza", tono: "menta", palabras: "lavandina detergente suavizante limpiador desengrasante lysoform alcohol esponja esponjas guante guantes insecticida virulana|papel de cocina|rollo de cocina|jabon en polvo|jabon liquido para ropa" },
  { id: "higiene", nombre: "Higiene y perfumería", tono: "lila", palabras: "shampoo champu acondicionador jabon desodorante cepillo toallitas toallas algodon afeitadora maquinita protector perfume crema|pasta dental|papel higienico" },
  { id: "bazar", nombre: "Bazar", tono: "durazno", palabras: "" },
  { id: "mascotas", nombre: "Mascotas", tono: "durazno", palabras: "alimento|piedras sanitarias" },
  { id: "otro_comercio", nombre: "Otro comercio (papelera, ferretería…)", tono: "durazno", palabras: "" },
  { id: "otros", nombre: "Otros", tono: "limon", palabras: "" },
];

const indice = CATEGORIAS.map((c) => {
  const [sueltas, ...frases] = c.palabras.split("|");
  return { c, palabras: new Set(sueltas.split(/\s+/).filter(Boolean)), frases: frases.map((f) => normalizar(f)) };
});
const RELLENO = new Set("kg kgs kilo kilos gr grs gramos lt lts litro litros un unidad unidades medio media docena cuarto de del x bolsa paquete pack".split(" "));

/** Categoría para agrupar la lista. Lo de verdulería / bazar sale del rubro. */
export function categoriaDe(nombre: string, rubro: Rubro, elegida?: string | null): Categoria {
  const fija = elegida ? CATEGORIAS.find((c) => c.id === elegida) : undefined;
  if (fija) return fija;
  const n = normalizar(nombre).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const porId = (id: string) => CATEGORIAS.find((c) => c.id === id)!;
  // Frases primero ("dulce de leche" es lácteo, "papel higienico" es higiene)
  for (const { c, frases } of indice) if (frases.some((f) => n.startsWith(f) || n.includes(` ${f}`))) return c;
  if (/\bdescartables?\b/.test(n)) return porId("descartables");
  if (rubro === "verduleria") return porId("verduleria");
  const ws = n.split(" ").filter((w) => w.length > 1 && !/^\d/.test(w) && !RELLENO.has(w));
  const primera = ws[0] ?? "";
  const formas = [primera, primera.replace(/es$/, ""), primera.replace(/s$/, "")];
  for (const { c, palabras } of indice) if (formas.some((f) => palabras.has(f))) return c;
  if (rubro === "bazar") return porId("bazar");
  if (rubro === "otro") return porId("otro_comercio");
  return porId("otros");
}

// Títulos que se pueden poner en una lista pegada: "Verdulería", "Carnicería:", "DIETÉTICA"
const TITULOS: Record<string, string> = {
  verduleria: "verduleria", verdu: "verduleria", verduras: "verduleria", frutas: "verduleria", "frutas y verduras": "verduleria", "fruta y verdura": "verduleria",
  lacteos: "lacteos", almacen: "almacen", dietetica: "dietetica", bebidas: "bebidas",
  carniceria: "carniceria", carnes: "carniceria", fiambreria: "fiambres", fiambres: "fiambres",
  panaderia: "panaderia", congelados: "congelados", descartables: "descartables", packaging: "descartables",
  limpieza: "limpieza", higiene: "higiene", perfumeria: "higiene", "higiene y perfumeria": "higiene",
  bazar: "bazar", mascotas: "mascotas", otros: "otros",
};
/** Si la línea es un título de categoría, devuelve su id. */
export function tituloCategoria(linea: string): string | null {
  const n = normalizar(linea).replace(/[:\-–•*#]+/g, " ").replace(/\s+/g, " ").trim();
  return TITULOS[n] ?? null;
}
/** Rubro que implica una categoría (lo que no se compara con los súpers). */
export const rubroDeCategoria = (id: string | null | undefined): Rubro | null =>
  id === "verduleria" ? "verduleria" : id === "bazar" ? "bazar" : id === "otro_comercio" ? "otro" : null;
