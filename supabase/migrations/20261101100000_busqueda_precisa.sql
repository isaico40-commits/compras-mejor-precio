-- Búsqueda más precisa: "leche" busca leches, no "chocolate con leche".
-- Si hay al menos 3 productos cuyo nombre EMPIEZA con lo buscado, se usan solo esos,
-- y primero los que no son "X de algo" ("manteca" -> manteca, no "manteca de maní").
-- Funciones nuevas (…2) para no cambiar la versión publicada hasta el merge.
create or replace function public.candidatos(p_termino text)
returns table (id uuid, nombre text, dim text, cant_base numeric)
language sql stable set search_path = '' as $$
  with base as (select public.nombre_base(p_termino) b),
  pats as (
    select coalesce(array_agg('\m' || w || '\M'), array[]::text[]) p
      from base, regexp_split_to_table(base.b, ' ') w where length(w) > 2
  ),
  todos as (
    select c.id, c.nombre, c.dim, c.cant_base, c.nombre_base,
           (c.nombre_base like (select b from base) || '%') frase,
           (c.nombre_base ~ ('^' || (select b from base) || ' (de|con|sabor|para|tipo|en|sin)\M')) compuesto,
           (c.nombre_base ~ ('^' || split_part((select b from base), ' ', 1) || '\M')) primera
      from public.productos c, pats
     where cardinality(pats.p) > 0 and c.nombre_base ~ all (pats.p)
  ),
  nivel as (
    select case when (select count(*) from todos where frase and not compuesto) >= 3 then 0
                when (select count(*) from todos where frase) >= 3 then 1
                when (select count(*) from todos where primera) >= 3 then 2
                else 3 end n
  )
  select t.id, t.nombre, t.dim, t.cant_base
    from todos t, nivel
   where nivel.n = 3 or (nivel.n = 0 and t.frase and not t.compuesto) or (nivel.n = 1 and t.frase) or (nivel.n = 2 and t.primera)
   order by t.frase desc, t.primera desc
   limit 400;
$$;

create or replace function public.analizar_terminos2(p_terminos text[], p_dims text[])
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  t text; v_d text; i int; n int := 0;
  res jsonb;
begin
  for i in 1 .. coalesce(array_length(p_terminos, 1), 0) loop
    t := p_terminos[i]; v_d := p_dims[i];
    if t is null or length(trim(t)) = 0 then continue; end if;

    with cand as (select * from public.candidatos(t)),
    dd as (select coalesce(v_d, (select mode() within group (order by dim) from cand)) dd_dim),
    ult as (
      select distinct on (c.id, pr.supermercado_id) c.id, pr.supermercado_id, coalesce(pr.precio_promo, pr.precio) ef, pr.fecha
        from cand c join dd on c.dim = dd.dd_dim
        join public.precios pr on pr.producto_id = c.id
       order by c.id, pr.supermercado_id, pr.fecha desc, pr.created_at desc
    ),
    mejor as (
      select distinct on (u.id) u.id, u.supermercado_id, u.ef, u.fecha, c.nombre, c.dim, c.cant_base,
             u.ef / nullif(c.cant_base, 0) pu
        from ult u join cand c on c.id = u.id
       order by u.id, u.ef
    ),
    porsuper as (
      select distinct on (u.supermercado_id) u.supermercado_id, u.ef, u.ef / nullif(c.cant_base, 0) pu
        from ult u join cand c on c.id = u.id
       order by u.supermercado_id, u.ef / nullif(c.cant_base, 0) nulls last
    ),
    top as (
      select m.*, s.nombre super from mejor m join public.supermercados s on s.id = m.supermercado_id
       order by m.pu nulls last, m.cant_base desc limit 4
    )
    select jsonb_build_object(
      'v', 2,
      'dim', (select dd_dim from dd),
      'n', (select count(*) from mejor),
      'mediana', (select percentile_cont(0.5) within group (order by m.pu) from mejor m
                   where m.pu is not null
                     and m.pu <= 3 * (select min(pu) from mejor)
                     and public.nombre_base(m.nombre) like public.nombre_base(t) || '%'),
      'chica', (select min(cant_base) from mejor),
      'por_super', coalesce((select jsonb_object_agg(supermercado_id, jsonb_build_object('precio', ef, 'pu', round(pu, 2))) from porsuper), '{}'::jsonb),
      'opciones', coalesce((select jsonb_agg(jsonb_build_object(
          'producto_id', id, 'nombre', nombre, 'super_id', supermercado_id, 'super', super,
          'precio', ef, 'cant', cant_base, 'pu', round(pu, 2), 'fecha', fecha) order by pu nulls last, cant_base desc) from top), '[]'::jsonb)
    ) into res;

    insert into public.sugerencias (clave, termino, dim, resultado, calculado_at)
    values (public.clave_sugerencia(t, v_d), lower(t), v_d, res, now())
    on conflict (clave) do update set resultado = excluded.resultado, calculado_at = now(), termino = excluded.termino;
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function public.opciones_termino2(p_termino text, p_dim text default null, p_limite integer default 4)
returns table (producto_id uuid, nombre text, dim text, cant_base numeric, supermercado_id uuid, supermercado text, precio numeric, por_unidad numeric, fecha date)
language sql stable set search_path = '' as $$
  with cand as (select * from public.candidatos(p_termino)),
  dimension as (
    select coalesce(p_dim, (select mode() within group (order by dim) from cand)) d
  ),
  ult as (
    select distinct on (c.id, pr.supermercado_id) c.id, pr.supermercado_id,
           coalesce(pr.precio_promo, pr.precio) as ef, pr.fecha
      from cand c join dimension on c.dim = dimension.d
      join public.precios pr on pr.producto_id = c.id
     order by c.id, pr.supermercado_id, pr.fecha desc, pr.created_at desc
  ),
  mejor_por_producto as (
    select distinct on (u.id) u.* from ult u order by u.id, u.ef
  )
  select c.id, c.nombre, c.dim, c.cant_base, s.id, s.nombre, u.ef, round(u.ef / nullif(c.cant_base, 0), 2), u.fecha
    from mejor_por_producto u join cand c on c.id = u.id join public.supermercados s on s.id = u.supermercado_id
   order by u.ef / nullif(c.cant_base, 0) asc nulls last, c.cant_base desc
   limit p_limite;
$$;

create or replace function public.opciones_lote_en_super2(p_terminos text[], p_dims text[], p_super_id uuid)
returns table (orden integer, producto_id uuid, nombre text, dim text, cant_base numeric, precio numeric, por_unidad numeric, fecha date)
language sql stable set search_path = '' as $$
  select t.ord::int, o.*
    from unnest(p_terminos, p_dims) with ordinality as t(termino, dim, ord)
    cross join lateral (
      with cand as (select * from public.candidatos(t.termino)),
      d as (select coalesce(t.dim, (select mode() within group (order by dim) from cand)) d),
      ult as (
        select distinct on (c.id) c.id, c.nombre, c.dim, c.cant_base, coalesce(pr.precio_promo, pr.precio) as ef, pr.fecha
          from cand c join d on c.dim = d.d
          join public.precios pr on pr.producto_id = c.id and pr.supermercado_id = p_super_id
         order by c.id, pr.fecha desc, pr.created_at desc
      )
      select u.id, u.nombre, u.dim, u.cant_base, u.ef, round(u.ef / nullif(u.cant_base, 0), 2), u.fecha
        from ult u order by u.ef / nullif(u.cant_base, 0) nulls last limit 1
    ) o;
$$;

grant execute on function public.candidatos(text) to authenticated;
grant execute on function public.opciones_termino2(text, text, integer) to authenticated;
grant execute on function public.opciones_lote_en_super2(text[], text[], uuid) to authenticated;
revoke execute on function public.analizar_terminos2(text[], text[]) from public, anon;
grant execute on function public.analizar_terminos2(text[], text[]) to authenticated;
