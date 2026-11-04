-- Comprar por volumen (aplicada en Supabase el 2026-11-04 como analizar_pu_chico).
-- El análisis guarda pu_chico: $/unidad típico de las presentaciones chicas, para saber si conviene el pack grande.

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
                     and public.nombre_base(m.nombre) like public.nombre_base(split_part(t, '|', 1)) || '%'),
      'chica', (select min(cant_base) from mejor),
      -- $/unidad típico de las presentaciones chicas (para saber si conviene el pack grande)
      'pu_chico', (select percentile_cont(0.5) within group (order by m.pu) from mejor m
                    where m.pu is not null
                      and m.cant_base <= 1.5 * (select min(cant_base) from mejor)
                      and m.pu <= 3 * (select min(pu) from mejor)),
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
