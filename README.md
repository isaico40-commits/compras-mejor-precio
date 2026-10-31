# Compras al mejor precio

Armás tu lista de compras frecuentes, cargás precios de los súpers de Mar del Plata y la app te dice:

- dónde está más barato cada producto (y cuánto gastás repartiendo la compra),
- cuánto sale la lista completa en un solo súper, para comparar si vale el viaje extra.

## Stack

- Next.js 15 (App Router) + Tailwind
- Supabase: Postgres, Auth (link por email) y RLS

## Correr local

```bash
npm install
cp .env.example .env.local   # completar NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev
```

## Base de datos

El esquema está en `supabase/migrations/`. Tablas:

| Tabla | Para qué |
|---|---|
| `supermercados` | Súpers (Toledo, La Anónima, Carrefour, ChangoMás, Día) |
| `productos` | Catálogo compartido, con EAN opcional |
| `precios` | Historial de precios por producto, súper y fecha (precio de lista + promo) |
| `listas` / `lista_items` | Listas personales con cantidad y frecuencia |

- Vista `precios_actuales`: último precio de cada producto en cada súper.
- `mejor_precio_por_item(lista)` y `total_lista_por_super(lista)`: la comparación que muestra la app.

## Precios automáticos (Precios Claros / SEPA)

`.github/workflows/precios-claros.yml` corre todos los días a las 10:23 (hora argentina):

1. Descarga el ZIP del día del dataset [SEPA](https://datos.produccion.gob.ar/dataset/sepa-precios).
2. Se queda con las sucursales de Mar del Plata / General Pueyrredón.
3. Toma el precio más bajo de cada producto (por código de barras) en cada cadena.
4. Lo carga con `sepa_cargar`: si el precio no cambió, actualiza la fecha; si cambió, guarda un registro nuevo (queda el historial).

Necesita el secret `SUPABASE_SERVICE_ROLE_KEY` en el repo. Se puede correr a mano desde la pestaña Actions → "Importar Precios Claros" → Run workflow.

## Publicar (Vercel)

Importar el repo en Vercel con las variables `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Cada push a `main` se publica solo. En Supabase → Authentication → URL Configuration, poner la URL de Vercel como Site URL.

## Pendiente

- Foto del ticket → OCR → precios (`fuente = 'ticket'`).
