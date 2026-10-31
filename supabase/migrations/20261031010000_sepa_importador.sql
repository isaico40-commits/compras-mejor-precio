-- Precios Claros (SEPA): vínculo de súpers, búsqueda de productos y carga diaria.

alter table public.supermercados
  add column sepa_comercio text,
  add column sepa_bandera text,
  add constraint supermercados_sepa_uq unique (sepa_comercio, sepa_bandera);

create extension if not exists pg_trgm with schema extensions;
create index productos_nombre_trgm_idx on public.productos using gin (nombre extensions.gin_trgm_ops);

-- Carga un lote de precios de SEPA (ya agregados por bandera en Mar del Plata).
-- Si el precio no cambió, actualiza la fecha del último registro; si cambió, inserta uno nuevo.
create or replace function public.sepa_cargar(p_fecha date, p_rows jsonb)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_nuevos integer;
begin
  drop table if exists _r, _c, _u;
  create temp table _r on commit drop as
  select * from jsonb_to_recordset(p_rows) as r(
    comercio text, bandera text, bandera_nombre text, ean text,
    descripcion text, marca text, cantidad numeric, unidad text,
    precio numeric, promo numeric, leyenda text);

  -- Súpers: vincular por nombre con los cargados a mano, o crear
  update public.supermercados s
     set sepa_comercio = b.comercio, sepa_bandera = b.bandera
    from (select distinct comercio, bandera, bandera_nombre from _r) b
   where s.sepa_comercio is null
     and lower(translate(s.nombre, 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou')) = lower(translate(b.bandera_nombre, 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou'))
     and not exists (select 1 from public.supermercados x where x.sepa_comercio = b.comercio and x.sepa_bandera = b.bandera);

  insert into public.supermercados (nombre, cadena, sepa_comercio, sepa_bandera)
  select distinct on (comercio, bandera) bandera_nombre, bandera_nombre, comercio, bandera from _r
  on conflict (sepa_comercio, sepa_bandera) do nothing;

  -- Productos por código de barras
  insert into public.productos (nombre, marca, cantidad, unidad, ean)
  select distinct on (ean) descripcion, marca, cantidad, unidad, ean from _r
  on conflict (ean) do nothing;

  create temp table _c on commit drop as
  select p.id as producto_id, s.id as supermercado_id, r.precio, r.promo, r.leyenda
    from _r r
    join public.productos p on p.ean = r.ean
    join public.supermercados s on s.sepa_comercio = r.comercio and s.sepa_bandera = r.bandera;

  create temp table _u on commit drop as
  select distinct on (pr.producto_id, pr.supermercado_id) pr.id, pr.producto_id, pr.supermercado_id, pr.precio, pr.precio_promo, pr.fecha
    from public.precios pr
    join _c c on c.producto_id = pr.producto_id and c.supermercado_id = pr.supermercado_id
   where pr.fuente = 'precios_claros'
   order by pr.producto_id, pr.supermercado_id, pr.fecha desc, pr.created_at desc;

  -- Mismo precio: solo actualizar la fecha
  update public.precios pr set fecha = p_fecha
    from _u u join _c c using (producto_id, supermercado_id)
   where pr.id = u.id and u.fecha < p_fecha
     and u.precio = c.precio and u.precio_promo is not distinct from c.promo;

  -- Precio nuevo o distinto: insertar
  insert into public.precios (producto_id, supermercado_id, precio, precio_promo, promo_detalle, fecha, fuente, cargado_por)
  select c.producto_id, c.supermercado_id, c.precio, c.promo, c.leyenda, p_fecha, 'precios_claros', null
    from _c c left join _u u using (producto_id, supermercado_id)
   where u.id is null
      or (u.fecha <= p_fecha and (u.precio <> c.precio or u.precio_promo is distinct from c.promo));
  get diagnostics v_nuevos = row_count;
  return v_nuevos;
end;
$$;

revoke execute on function public.sepa_cargar(date, jsonb) from public, anon, authenticated;
grant execute on function public.sepa_cargar(date, jsonb) to service_role;
