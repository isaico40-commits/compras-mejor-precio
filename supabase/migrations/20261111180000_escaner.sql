-- Escáner de código de barras (carrito virtual en el súper):
-- producto por EAN, su último precio en el súper donde estás y los 3 más baratos en otros lugares (últimos 30 días).
create or replace function public.escaneo(p_ean text, p_super uuid)
returns jsonb
language sql stable set search_path = '' as $$
  with p as (
    select pr.id, pr.nombre, pr.dim, pr.cant_base from public.productos pr where pr.id = public.producto_por_ean(p_ean)
  ),
  ult as (
    select distinct on (x.supermercado_id) x.supermercado_id, coalesce(x.precio_promo, x.precio) ef, x.precio, x.fecha, x.fuente::text fuente, x.promo_detalle
      from public.precios x join p on p.id = x.producto_id
     order by x.supermercado_id, x.fecha desc, x.created_at desc
  )
  select case when not exists (select 1 from p) then null else jsonb_build_object(
    'producto', (select to_jsonb(p) from p),
    'aca', (select jsonb_build_object('precio', u.ef, 'lista', u.precio, 'fecha', u.fecha, 'fuente', u.fuente, 'promo', u.promo_detalle)
              from ult u where u.supermercado_id = p_super),
    'otros', coalesce((select jsonb_agg(o order by o.precio) from (
              select s.nombre super, s.id super_id, u.ef precio, u.fecha
                from ult u join public.supermercados s on s.id = u.supermercado_id
               where u.supermercado_id <> p_super and not s.oculto
                 and u.fecha >= (now() at time zone 'America/Argentina/Buenos_Aires')::date - 30
               order by u.ef limit 3) o), '[]'::jsonb)
  ) end;
$$;
grant execute on function public.escaneo(text, uuid) to authenticated;
