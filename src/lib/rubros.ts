import { normalizar } from "@/lib/formato";

export type Rubro = "super" | "verduleria" | "bazar" | "otro";
export const RUBROS: { id: Rubro; nombre: string; grupo: string }[] = [
  { id: "super", nombre: "Súper", grupo: "Súper" },
  { id: "verduleria", nombre: "Verdulería", grupo: "Verdulería" },
  { id: "bazar", nombre: "Bazar", grupo: "Bazar" },
  { id: "otro", nombre: "Otro comercio", grupo: "Otros comercios" },
];
export const nombreRubro = (r: Rubro) => RUBROS.find((x) => x.id === r)?.nombre ?? r;
export const esRubro = (v: unknown): v is Rubro => RUBROS.some((r) => r.id === v);

// Se mira la PRIMERA palabra: "tomate" es verdulería, "puré de tomate" es súper.
const VERDULERIA = `tomate papa batata cebolla verdeo lechuga zanahoria zapallo zapallito zucchini berenjena morron pimiento ajo
  puerro apio acelga espinaca rucula repollo brocoli coliflor choclo pepino remolacha rabanito perejil albahaca cilantro menta
  jengibre kale champinon champignon hongo palta banana manzana pera naranja mandarina limon lima pomelo frutilla arandano
  frambuesa mora kiwi anana melon sandia durazno ciruela uva cereza mango maracuya higo damasco verdura fruta hinojo chaucha
  arveja radicheta`;
const BAZAR = `vaso plato taza jarra sarten olla cacerola cubierto tenedor cuchillo cuchara cucharita tupper taper recipiente bowl bol
  bandeja fuente tabla colador rallador espatula batidor pinza molde termo bombilla botella frasco balde escoba secador trapo
  rejilla canasto perchero broche mantel repasador individual organizador dispenser vela`;
const lista = (s: string) => new Set(s.split(/\s+/).filter(Boolean));
const V = lista(VERDULERIA), B = lista(BAZAR);

const RELLENO = lista("kg kgs kilo kilos gr grs gramos lt lts litro litros un unidad unidades medio media docena cuarto de del x bolsa cajon maple atado planta");
const singular = (w: string) => [w, w.replace(/es$/, ""), w.replace(/s$/, "")];

/** Rubro probable por el nombre. Si no reconoce nada, súper. */
export function detectarRubro(nombre: string): Rubro {
  const primera = normalizar(nombre).replace(/[^a-z0-9 ]/g, " ").split(" ").find((w) => w.length > 1 && !/^\d/.test(w) && !RELLENO.has(w)) ?? "";
  const formas = singular(primera);
  if (formas.some((f) => V.has(f))) return "verduleria";
  if (formas.some((f) => B.has(f))) return "bazar";
  return "super";
}
