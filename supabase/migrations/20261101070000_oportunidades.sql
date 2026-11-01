-- Oportunidades: productos que en un súper están más baratos que en todos los demás.
-- Se calcula una vez por día y por súper, y queda guardado.
create index if not exists precios_super_fecha_idx on public.precios (supermercado_id, fecha desc);

create table if not exists public.oportunidades (
  supermercado_id uuid primary key references public.supermercados(id) on delete cascade,
  calculado date not null,
  datos jsonb not null
);
alter table public.oportunidades enable row level security;
create policy "oportunidades lectura" on public.oportunidades for select to authenticated using (true);

create or replace function public.oportunidades_en_super(p_super uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  res jsonb;
begin
  select datos into res from public.oportunidades where supermercado_id = p_super and calculado = hoy;
  if res is not null then return res; end if;

  with aca as (
    select distinct on (pr.producto_id) pr.producto_id, coalesce(pr.precio_promo, pr.precio) ef, pr.precio_promo is not null promo
      from public.precios pr
     where pr.supermercado_id = p_super and pr.fecha >= hoy - 10
     order by pr.producto_id, pr.fecha desc, pr.created_at desc
  ),
  otros as (
    select distinct on (pr.producto_id, pr.supermercado_id) pr.producto_id, pr.supermercado_id, coalesce(pr.precio_promo, pr.precio) ef
      from aca join public.precios pr on pr.producto_id = aca.producto_id
     where pr.supermercado_id <> p_super and pr.fecha >= hoy - 10
     order by pr.producto_id, pr.supermercado_id, pr.fecha desc, pr.created_at desc
  ),
  resumen as (
    select o.producto_id, count(*) n,
           min(o.ef) siguiente,
           (array_agg(o.supermercado_id order by o.ef))[1] super_sig,
           percentile_cont(0.5) within group (order by o.ef) mediana
      from otros o group by o.producto_id
  ),
  top as (
    select a.producto_id, a.ef, a.promo, r.n, r.siguiente, r.super_sig, r.mediana,
           round((1 - a.ef / r.siguiente) * 100) ahorro
      from aca a join resumen r using (producto_id)
     where r.n >= 2 and a.ef < r.siguiente * 0.9 and a.ef > r.siguiente * 0.4   -- más de 60% suele ser un error de carga
     order by (1 - a.ef / r.siguiente) desc
     limit 150
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'producto_id', t.producto_id, 'nombre', p.nombre, 'base', p.nombre_base, 'dim', p.dim, 'cant', p.cant_base,
           'precio', t.ef, 'promo', t.promo, 'siguiente', t.siguiente, 'super_sig', s.nombre,
           'mediana', round(t.mediana::numeric, 2), 'n', t.n, 'ahorro', t.ahorro) order by t.ahorro desc), '[]'::jsonb)
    into res
    from top t join public.productos p on p.id = t.producto_id join public.supermercados s on s.id = t.super_sig;

  insert into public.oportunidades (supermercado_id, calculado, datos) values (p_super, hoy, res)
  on conflict (supermercado_id) do update set calculado = excluded.calculado, datos = excluded.datos;
  return res;
end;
$$;
revoke execute on function public.oportunidades_en_super(uuid) from public, anon;
grant execute on function public.oportunidades_en_super(uuid) to authenticated;
