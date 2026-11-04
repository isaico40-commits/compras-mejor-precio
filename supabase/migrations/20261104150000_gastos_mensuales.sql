-- Gasto mensual (aplicada en Supabase el 2026-11-04 como gastos_mensuales).
-- Tickets + compras_historial que no vienen de tickets ("Terminar compra", pagos cargados),
-- con el precio más caro de ese producto en los súpers (Precios Claros, -30/+7 días) para calcular el ahorro.
create or replace function public.gastos_detalle(p_desde date)
returns table (fecha date, nombre text, producto text, monto numeric, cantidad numeric, unitario numeric,
               caro numeric, lugar text, origen text, ticket_id uuid, ticket_total numeric)
language sql stable set search_path = '' as $$
  with base as (
    select t.fecha, i.descripcion nombre, i.producto_id, i.cantidad,
           coalesce(i.subtotal, i.precio_unitario * i.cantidad) monto,
           coalesce(i.precio_unitario, i.subtotal / nullif(i.cantidad, 0)) unitario,
           coalesce(s.nombre, t.comercio) lugar, 'ticket'::text origen, t.id ticket_id, t.total ticket_total,
           t.supermercado_id
      from public.tickets t
      join public.ticket_items i on i.ticket_id = t.id
      left join public.supermercados s on s.id = t.supermercado_id
     where t.fecha >= p_desde
    union all
    select h.fecha, h.nombre, h.producto_id, 1, h.precio, h.precio, s.nombre, h.origen, null, null, h.supermercado_id
      from public.compras_historial h
      left join public.supermercados s on s.id = h.supermercado_id
     where h.fecha >= p_desde and h.origen <> 'ticket' and h.precio is not null
  )
  select b.fecha, b.nombre, p.nombre, b.monto, b.cantidad, b.unitario,
         (select max(x.ef) from (
            select distinct on (pr.supermercado_id) coalesce(pr.precio_promo, pr.precio) ef
              from public.precios pr
             where pr.producto_id = b.producto_id and pr.fuente = 'precios_claros'
               and pr.fecha between b.fecha - 30 and b.fecha + 7
             order by pr.supermercado_id, abs(pr.fecha - b.fecha), pr.created_at desc
          ) x) caro,
         b.lugar, b.origen, b.ticket_id, b.ticket_total
    from base b
    left join public.productos p on p.id = b.producto_id
   order by b.fecha desc;
$$;
grant execute on function public.gastos_detalle(date) to authenticated;
