-- Producto genérico por rendimiento (prueba: papel higiénico).
-- Lee rollos × metros y tipo de hoja de la descripción de Precios Claros con reglas de texto
-- y compara por $/metro (dim = 'm'). Lo que no se puede leer se completa a mano (rendimiento_manual).
-- Filtros en el término: "papel higienico | doble | 30m" (hoja y metros mínimos por rollo).

alter table public.productos
  add column if not exists rollos int,
  add column if not exists hoja text;

create or replace function public.es_papel_higienico(p_nombre text) returns boolean
language sql immutable parallel safe set search_path = '' as $$
  select public.texto_simple(p_nombre) ~ '(\mpapel|\mpap|\mp\.)\s*higien|^ph |\mpapel higienol'
     and public.texto_simple(p_nombre) !~ '\m(palito|porta|toalla|toallas|humedas?|servilleta)';
$$;

create or replace function public.rendimiento_papel(p_nombre text, p_cantidad numeric, p_unidad text,
  out metros numeric, out rollos int, out hoja text)
language plpgsql immutable parallel safe set search_path = '' as $$
declare
  n text := public.texto_simple(p_nombre);
  u text := regexp_replace(public.texto_simple(p_unidad), '[^a-z0-9]', '', 'g');
  m text[];
  mpr numeric;
begin
  if not public.es_papel_higienico(p_nombre) then return; end if;

  if n ~ '\mtriple' then hoja := 'triple';
  elsif n ~ '\m(dob|dobl|doble|dh)\M|\md/h|\md\.?\s*hoja|\mh\.?\s*dob' then hoja := 'doble';
  elsif n ~ '\m(sim|simp|simple|sh|hs)\M|\ms/h|\mh/s|\mh\.?\s*s\M|\mhoj\w*\s*simp' then hoja := 'simple';
  end if;

  -- 4x30m, 4 x 30 mts, 4R X 30 M, 12X30MT, 24 X50M
  m := regexp_match(n, '\m(\d{1,2})\s*r?\s*x\s*(\d{2,3})\s*(m|mt|mts|mtr|mtrs|metros)?\M');
  if m is not null then rollos := m[1]::int; mpr := m[2]::numeric; end if;
  -- 4ROLL 80MT
  if mpr is null then
    m := regexp_match(n, '\m(\d{1,2})\s*roll\w*\s*(\d{2,3})\s*(m|mt|mts|mtr)\M');
    if m is not null then rollos := m[1]::int; mpr := m[2]::numeric; end if;
  end if;
  -- PAQ X4 50 MTRS, PAQ X6 UNI 30 MTR
  if mpr is null then
    m := regexp_match(n, '\mx\s*(\d{1,2})\s*(uni|un|u)?\s+(\d{2,3})\s*(m|mt|mts|mtr|mtrs)\M');
    if m is not null then rollos := m[1]::int; mpr := m[3]::numeric; end if;
  end if;
  -- 50M X 4 UNI, 30 MTS X 8 UNI
  if mpr is null then
    m := regexp_match(n, '\m(\d{2,3})\s*(m|mt|mts|mtr)\s*x\s*(\d{1,2})\s*(uni|un|u|rollos?)\M');
    if m is not null then rollos := m[3]::int; mpr := m[1]::numeric; end if;
  end if;
  -- MEGAMAX X 120 MTS (un rollo)
  if mpr is null then
    m := regexp_match(n, '\mx\s*(\d{2,3})\s*(m|mt|mts|mtr)\M');
    if m is not null then rollos := 1; mpr := m[1]::numeric; end if;
  end if;

  if mpr is not null then
    metros := rollos * mpr;
    -- "40 M2 ... 4ROLL 10MT": si los m2 informados dan mucho más, mandan los m2
    if u in ('m2','mt2','mts2') and p_cantidad * 10 > 3 * metros then metros := p_cantidad * 10; end if;
  else
    -- Precios Claros informa m2 con rollos de ~10 cm de ancho: 1 m2 = 10 m
    if u in ('m2','mt2','mts2') and p_cantidad > 1 then metros := p_cantidad * 10;
    else
      m := regexp_match(n, '\m(\d{1,3})\s*(m2|mt2|mts2)\M');
      if m is not null then metros := m[1]::numeric * 10;
      elsif u in ('m','mt','mts','mtr','mtrs','metros') and p_cantidad >= 20 then metros := p_cantidad;
      end if;
    end if;
    if rollos is null then
      m := regexp_match(n, '\m(\d{1,2})\s*(roll\w*|r|uni|un)\M|\mx\s*(\d{1,2})\s*(uni|un|u)?\M');
      if m is not null then rollos := coalesce(m[1], m[3])::int; end if;
    end if;
  end if;

  if metros is not null and (metros < 10 or metros > 5000) then metros := null; end if;
  if rollos is not null and (rollos < 1 or rollos > 96) then rollos := null; end if;
end;
$$;

-- Correcciones a mano (cuando la descripción no dice los metros, o los lee mal)
create table if not exists public.rendimiento_manual (
  producto_id uuid primary key references public.productos(id) on delete cascade,
  metros numeric check (metros > 0),
  rollos int check (rollos > 0),
  hoja text check (hoja in ('simple','doble','triple')),
  cargado_por uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now()
);
alter table public.rendimiento_manual enable row level security;
create policy "rendimiento lectura" on public.rendimiento_manual for select to authenticated using (true);

create or replace function public.productos_medida_trg() returns trigger
language plpgsql set search_path = '' as $$
declare r record; p record; man record;
begin
  r := public.medida_producto(new.nombre, new.cantidad, new.unidad);
  new.dim := r.dim; new.cant_base := r.cant;
  new.nombre_base := public.nombre_base(new.nombre);
  new.rollos := null; new.hoja := null;
  if public.es_papel_higienico(new.nombre) then
    p := public.rendimiento_papel(new.nombre, new.cantidad, new.unidad);
    select * into man from public.rendimiento_manual where producto_id = new.id;
    new.rollos := coalesce(man.rollos, p.rollos);
    new.hoja := coalesce(man.hoja, p.hoja);
    if coalesce(man.metros, p.metros) is not null then
      new.dim := 'm'; new.cant_base := coalesce(man.metros, p.metros);
    end if;
  end if;
  return new;
end;
$$;

-- Guarda una corrección a mano y recalcula el producto
create or replace function public.guardar_rendimiento(p_producto uuid, p_metros numeric, p_rollos int, p_hoja text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'sin sesión'; end if;
  insert into public.rendimiento_manual (producto_id, metros, rollos, hoja, cargado_por, updated_at)
  values (p_producto, nullif(p_metros, 0), nullif(p_rollos, 0), nullif(p_hoja, ''), auth.uid(), now())
  on conflict (producto_id) do update set metros = excluded.metros, rollos = excluded.rollos,
    hoja = excluded.hoja, cargado_por = excluded.cargado_por, updated_at = now();
  update public.productos set nombre = nombre where id = p_producto;
end;
$$;
revoke execute on function public.guardar_rendimiento(uuid, numeric, int, text) from public, anon;
grant execute on function public.guardar_rendimiento(uuid, numeric, int, text) to authenticated;

-- Filtros dentro del término: "papel higienico | doble | 30m"
create or replace function public.filtro_hoja(p_termino text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select (regexp_match(lower(coalesce(p_termino, '')), '\|.*\m(simple|doble|triple)\M'))[1];
$$;
create or replace function public.filtro_min_rollo(p_termino text) returns numeric
language sql immutable parallel safe set search_path = '' as $$
  select (regexp_match(lower(coalesce(p_termino, '')), '\|[^|]*?(\d{1,3})\s*m\M'))[1]::numeric;
$$;

create or replace function public.clave_sugerencia(p_termino text, p_dim text)
returns text language sql immutable parallel safe set search_path = '' as $$
  select public.nombre_base(split_part(p_termino, '|', 1))
      || coalesce(' #' || public.filtro_hoja(p_termino), '')
      || coalesce(' #' || public.filtro_min_rollo(p_termino) || 'm', '')
      || '|' || coalesce(p_dim, '');
$$;

create or replace function public.candidatos(p_termino text)
returns table (id uuid, nombre text, dim text, cant_base numeric)
language sql stable set search_path = '' as $$
  with base as (select public.nombre_base(split_part(p_termino, '|', 1)) b,
                       public.filtro_hoja(p_termino) fh, public.filtro_min_rollo(p_termino) fm,
                       public.es_papel_higienico(split_part(p_termino, '|', 1)) papel),
  pats as (
    select coalesce(array_agg('\m' || w || '\M'), array[]::text[]) p
      from base, regexp_split_to_table(base.b, ' ') w where length(w) > 2
  ),
  todos as (
    select c.id, c.nombre, c.dim, c.cant_base, c.nombre_base,
           (c.nombre_base like (select b from base) || '%' or (base.papel and c.dim = 'm')) frase,
           (c.nombre_base ~ ('^' || (select b from base) || ' (de|con|sabor|para|tipo|en|sin)\M')) compuesto,
           (c.nombre_base ~ ('^' || split_part((select b from base), ' ', 1) || '\M')) primera
      from public.productos c, pats, base
     where ((cardinality(pats.p) > 0 and c.nombre_base ~ all (pats.p))
            -- "papel higienic CAMPANITA…", "P. HIGIENICO…": Precios Claros corta las palabras
            or (base.papel and c.dim = 'm'))
       and (base.fh is null or c.hoja = base.fh or (base.fh = 'doble' and c.hoja = 'triple'))
       and (base.fm is null or (c.dim = 'm' and c.cant_base / nullif(c.rollos, 0) >= base.fm))
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
                     and public.nombre_base(m.nombre) like public.nombre_base(split_part(t, '|', 1)) || '%'),
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
