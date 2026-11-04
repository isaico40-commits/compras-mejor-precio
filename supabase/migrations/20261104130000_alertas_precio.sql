-- Alertas de precio (aplicada en Supabase el 2026-11-04 como alertas_precio).
-- Tope por ítem ("avisame si baja de $X") y mínimo de 30 días con el historial del importador.
alter table public.lista_items add column if not exists precio_alerta numeric(12,2) check (precio_alerta > 0);
alter table public.alias_productos add column if not exists precio_alerta numeric(12,2) check (precio_alerta > 0);

create or replace function public.historial_30d(p_productos uuid[])
returns table (producto_id uuid, actual numeric, minimo numeric, maximo numeric, fechas int)
language sql stable set search_path = '' as $$
  with h as (
    select pr.producto_id, pr.supermercado_id, pr.fecha, coalesce(pr.precio_promo, pr.precio) ef,
           row_number() over (partition by pr.producto_id, pr.supermercado_id order by pr.fecha desc, pr.created_at desc) rn
      from public.precios pr
     where pr.producto_id = any (p_productos)
       and pr.fecha >= (now() at time zone 'America/Argentina/Buenos_Aires')::date - 30
  )
  select producto_id,
         min(ef) filter (where rn = 1),
         min(ef), max(ef), count(distinct fecha)::int
    from h group by producto_id;
$$;
grant execute on function public.historial_30d(uuid[]) to authenticated;
