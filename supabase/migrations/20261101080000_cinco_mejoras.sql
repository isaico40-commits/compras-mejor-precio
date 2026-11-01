-- 1) Historial de compras (al tildar en el súper o al cargar tickets) -> recompra
create table if not exists public.compras_historial (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  clave text not null,                -- nombre normalizado ("azucar comun")
  nombre text not null,
  producto_id uuid references public.productos(id) on delete set null,
  supermercado_id uuid references public.supermercados(id) on delete set null,
  precio numeric(12,2),
  fecha date not null default (now() at time zone 'America/Argentina/Buenos_Aires')::date,
  origen text not null default 'lista', -- lista | setto | ticket
  created_at timestamptz not null default now()
);
create index if not exists compras_historial_user_clave_idx on public.compras_historial (user_id, clave, fecha desc);
alter table public.compras_historial enable row level security;
create policy "historial propio" on public.compras_historial for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 2) Fotos de tickets subidas desde la app (las procesa Claude a mano)
create table if not exists public.ticket_fotos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  foto bytea not null,
  tipo text not null default 'image/jpeg',
  nota text,
  estado text not null default 'pendiente', -- pendiente | cargado
  ticket_id uuid references public.tickets(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists ticket_fotos_user_idx on public.ticket_fotos (user_id, created_at desc);
alter table public.ticket_fotos enable row level security;
create policy "fotos propias" on public.ticket_fotos for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 3) El análisis guarda también el mejor precio de cada súper (para el plan del viaje)
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
