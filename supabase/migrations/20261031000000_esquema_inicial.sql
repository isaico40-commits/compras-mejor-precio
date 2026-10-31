-- Aplicada en el proyecto Supabase "app-compras" (uwtqsfsnpbubwnjxvgex) el 2026-10-31.

-- Catálogo compartido
create table public.supermercados (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  cadena text,
  direccion text,
  ciudad text not null default 'Mar del Plata',
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now()
);

create table public.productos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  marca text,
  categoria text,
  cantidad numeric,          -- ej: 1.5
  unidad text,               -- ej: 'kg', 'l', 'u'
  ean text unique,           -- código de barras
  created_at timestamptz not null default now()
);

create type public.fuente_precio as enum ('manual', 'ticket', 'precios_claros', 'web');

create table public.precios (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos(id) on delete cascade,
  supermercado_id uuid not null references public.supermercados(id) on delete cascade,
  precio numeric(12,2) not null check (precio > 0),
  precio_promo numeric(12,2) check (precio_promo > 0),
  promo_detalle text,
  fecha date not null default current_date,
  fuente public.fuente_precio not null default 'manual',
  cargado_por uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index precios_prod_super_fecha_idx on public.precios (producto_id, supermercado_id, fecha desc);

-- Listas personales
create table public.listas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  nombre text not null default 'Compras frecuentes',
  created_at timestamptz not null default now()
);
create index listas_user_idx on public.listas (user_id);

create table public.lista_items (
  id uuid primary key default gen_random_uuid(),
  lista_id uuid not null references public.listas(id) on delete cascade,
  producto_id uuid not null references public.productos(id) on delete cascade,
  cantidad numeric not null default 1 check (cantidad > 0),
  frecuencia_dias int,       -- cada cuántos días se compra
  created_at timestamptz not null default now(),
  unique (lista_id, producto_id)
);
create index lista_items_producto_idx on public.lista_items (producto_id);

-- Último precio de cada producto en cada súper
create view public.precios_actuales with (security_invoker = true) as
select distinct on (producto_id, supermercado_id)
  producto_id, supermercado_id,
  coalesce(precio_promo, precio) as precio_efectivo,
  precio, precio_promo, promo_detalle, fecha, fuente
from public.precios
order by producto_id, supermercado_id, fecha desc, created_at desc;

-- RLS
alter table public.supermercados enable row level security;
alter table public.productos enable row level security;
alter table public.precios enable row level security;
alter table public.listas enable row level security;
alter table public.lista_items enable row level security;

create policy "catalogo lectura" on public.supermercados for select to anon, authenticated using (true);
create policy "catalogo alta" on public.supermercados for insert to authenticated with check (true);
create policy "productos lectura" on public.productos for select to anon, authenticated using (true);
create policy "productos alta" on public.productos for insert to authenticated with check (true);
create policy "precios lectura" on public.precios for select to anon, authenticated using (true);
create policy "precios alta" on public.precios for insert to authenticated with check (cargado_por = (select auth.uid()));
create policy "precios borrar propios" on public.precios for delete to authenticated using (cargado_por = (select auth.uid()));

create policy "listas propias" on public.listas for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "items de listas propias" on public.lista_items for all to authenticated
  using (exists (select 1 from public.listas l where l.id = lista_id and l.user_id = (select auth.uid())))
  with check (exists (select 1 from public.listas l where l.id = lista_id and l.user_id = (select auth.uid())));

-- Para cada item de una lista: dónde está más barato
create function public.mejor_precio_por_item(p_lista_id uuid)
returns table (
  producto_id uuid, producto text, cantidad numeric,
  supermercado_id uuid, supermercado text,
  precio_unitario numeric, subtotal numeric, fecha date
)
language sql stable security invoker set search_path = '' as $$
  select distinct on (i.producto_id)
    i.producto_id, p.nombre, i.cantidad,
    s.id, s.nombre,
    pa.precio_efectivo, pa.precio_efectivo * i.cantidad, pa.fecha
  from public.lista_items i
  join public.productos p on p.id = i.producto_id
  join public.precios_actuales pa on pa.producto_id = i.producto_id
  join public.supermercados s on s.id = pa.supermercado_id
  where i.lista_id = p_lista_id
  order by i.producto_id, pa.precio_efectivo asc;
$$;

-- Total de la lista completa en cada súper (para decidir un solo viaje)
create function public.total_lista_por_super(p_lista_id uuid)
returns table (
  supermercado_id uuid, supermercado text,
  total numeric, items_con_precio bigint, items_totales bigint
)
language sql stable security invoker set search_path = '' as $$
  select s.id, s.nombre,
    sum(pa.precio_efectivo * i.cantidad),
    count(pa.producto_id),
    (select count(*) from public.lista_items x where x.lista_id = p_lista_id)
  from public.supermercados s
  cross join public.lista_items i
  left join public.precios_actuales pa
    on pa.producto_id = i.producto_id and pa.supermercado_id = s.id
  where i.lista_id = p_lista_id
  group by s.id, s.nombre
  order by count(pa.producto_id) desc, sum(pa.precio_efectivo * i.cantidad) asc;
$$;
