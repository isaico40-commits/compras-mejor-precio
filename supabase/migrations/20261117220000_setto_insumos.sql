-- Insumos de Setto (aplicado con apply_migration el 2026-11-17)
create table if not exists public.setto_insumos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  producto_id uuid not null references public.productos(id) on delete cascade,
  lugar_id uuid references public.supermercados(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, producto_id)
);
alter table public.setto_insumos enable row level security;
create policy "insumos propios" on public.setto_insumos for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Costo actual de cada insumo: precio en su lugar habitual (o el más barato de 90 días) y costo por kg/l/u.
-- Incluye lo vinculado desde la caja de Setto (alias_productos con producto).
create or replace function public.costos_setto()
returns table (producto_id uuid, nombre text, precio numeric, super text, super_id uuid, fecha date, dim text, cant_base numeric, por_unidad numeric, desde text)
language sql stable set search_path = '' as $$
  with ins as (
    select i.producto_id, i.lugar_id, 'insumo'::text desde from public.setto_insumos i where i.user_id = (select auth.uid())
    union
    select a.producto_id, a.lugar_id, 'caja' from public.alias_productos a
     where a.user_id = (select auth.uid()) and a.producto_id is not null
       and not exists (select 1 from public.setto_insumos i where i.user_id = a.user_id and i.producto_id = a.producto_id)
  ),
  ult as (
    select distinct on (pr.producto_id, pr.supermercado_id) pr.producto_id, pr.supermercado_id, coalesce(pr.precio_promo, pr.precio) ef, pr.fecha
      from public.precios pr join ins on ins.producto_id = pr.producto_id
     where pr.fecha >= current_date - 90
     order by pr.producto_id, pr.supermercado_id, pr.fecha desc, pr.created_at desc
  ),
  elegido as (
    select distinct on (ins.producto_id) ins.producto_id, ins.desde, u.ef, u.supermercado_id, u.fecha
      from ins left join ult u on u.producto_id = ins.producto_id
     order by ins.producto_id, (u.supermercado_id = ins.lugar_id) desc nulls last, u.ef nulls last
  )
  select e.producto_id, p.nombre, e.ef, s.nombre, e.supermercado_id, e.fecha, p.dim, p.cant_base,
         case when p.cant_base > 0 then round(e.ef / p.cant_base, 2) end, e.desde
    from elegido e join public.productos p on p.id = e.producto_id
    left join public.supermercados s on s.id = e.supermercado_id
   order by p.nombre;
$$;
grant execute on function public.costos_setto() to authenticated;
