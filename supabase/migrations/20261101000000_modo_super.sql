-- Modo súper: última compra por ítem y comparación "acá vs. mejor en otro".
alter table public.lista_items add column ultima_compra date;

create or replace function public.comparar_en_super(p_lista_id uuid, p_super_id uuid)
returns table (
  item_id uuid, producto_id uuid, producto text, marca text, cantidad numeric,
  frecuencia_dias int, ultima_compra date, toca boolean,
  precio_aca numeric, promo_aca text, fecha_aca date,
  mejor_precio numeric, mejor_super text, mejor_fecha date
)
language sql stable security invoker set search_path = '' as $$
  select i.id, p.id, p.nombre, p.marca, i.cantidad,
    i.frecuencia_dias, i.ultima_compra,
    (i.ultima_compra is null or i.frecuencia_dias is null
       or i.ultima_compra + i.frecuencia_dias <= current_date) as toca,
    aca.efectivo, aca.promo_detalle, aca.fecha,
    otro.efectivo, s.nombre, otro.fecha
  from public.lista_items i
  join public.productos p on p.id = i.producto_id
  left join lateral (
    select coalesce(pr.precio_promo, pr.precio) as efectivo, pr.promo_detalle, pr.fecha
      from public.precios pr
     where pr.producto_id = i.producto_id and pr.supermercado_id = p_super_id
     order by pr.fecha desc, pr.created_at desc
     limit 1
  ) aca on true
  left join lateral (
    select u.supermercado_id, u.efectivo, u.fecha from (
      select distinct on (pr.supermercado_id) pr.supermercado_id,
             coalesce(pr.precio_promo, pr.precio) as efectivo, pr.fecha
        from public.precios pr
       where pr.producto_id = i.producto_id and pr.supermercado_id <> p_super_id
       order by pr.supermercado_id, pr.fecha desc, pr.created_at desc
    ) u order by u.efectivo limit 1
  ) otro on true
  left join public.supermercados s on s.id = otro.supermercado_id
  where i.lista_id = p_lista_id
  order by p.nombre;
$$;
