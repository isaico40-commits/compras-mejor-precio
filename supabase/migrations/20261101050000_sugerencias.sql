-- Análisis de mejor precio precalculado por término genérico ("azucar") y dimensión (kg/l/u).
-- La app lo lee en una sola consulta y lo recalcula en segundo plano.
create table if not exists public.sugerencias (
  clave text primary key,
  termino text not null,
  dim text,
  resultado jsonb,
  calculado_at timestamptz not null default now()
);
alter table public.sugerencias enable row level security;
create policy "sugerencias lectura" on public.sugerencias for select to authenticated using (true);

create or replace function public.clave_sugerencia(p_termino text, p_dim text)
returns text language sql immutable parallel safe set search_path = '' as $$
  select public.nombre_base(p_termino) || '|' || coalesce(p_dim, '');
$$;

create or replace function public.analizar_terminos(p_terminos text[], p_dims text[])
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  t text; v_d text; i int; n int := 0;
  res jsonb;
begin
  for i in 1 .. coalesce(array_length(p_terminos, 1), 0) loop
    t := p_terminos[i]; v_d := p_dims[i];
    if t is null or length(trim(t)) = 0 then continue; end if;

    with pats as (
      select coalesce(array_agg('\m' || w || '\M'), array[]::text[]) p
        from regexp_split_to_table(public.nombre_base(t), ' ') w where length(w) > 2
    ),
    cand as (
      select c.id, c.nombre, c.dim, c.cant_base
        from public.productos c, pats
       where cardinality(pats.p) > 0 and c.nombre_base ~ all (pats.p)
       limit 400
    ),
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
    top as (
      select m.*, s.nombre super from mejor m join public.supermercados s on s.id = m.supermercado_id
       order by m.pu nulls last, m.cant_base desc limit 4
    )
    select jsonb_build_object(
      'dim', (select dd_dim from dd),
      'n', (select count(*) from mejor),
      -- referencia "normal": nombres que empiezan con el término, sin premium (hasta 3x el mínimo)
      'mediana', (select percentile_cont(0.5) within group (order by m.pu) from mejor m
                   where m.pu is not null
                     and m.pu <= 3 * (select min(pu) from mejor)
                     and public.nombre_base(m.nombre) like public.nombre_base(t) || '%'),
      'chica', (select min(cant_base) from mejor),
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

revoke execute on function public.analizar_terminos(text[], text[]) from public, anon;
grant execute on function public.analizar_terminos(text[], text[]) to authenticated;

-- Lee los análisis guardados para una lista de términos (una sola consulta)
create or replace function public.leer_sugerencias(p_terminos text[], p_dims text[])
returns table (orden int, resultado jsonb, calculado_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select t.ord::int, s.resultado, s.calculado_at
    from unnest(p_terminos, p_dims) with ordinality as t(termino, dim, ord)
    join public.sugerencias s on s.clave = public.clave_sugerencia(t.termino, t.dim);
$$;
