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

## Fuentes de precios (próximos pasos)

1. Carga manual (ya funciona).
2. Foto del ticket → OCR → precios (`fuente = 'ticket'`).
3. Precios Claros (SEPA): datasets públicos con precios por sucursal y EAN.
