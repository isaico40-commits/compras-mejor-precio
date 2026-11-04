-- Packs por unidad y rollo de cocina por paño (aplicada en Supabase el 2026-11-04 como
-- filtro_texto, packs_unidades_fn, packs_unidades_trigger, unidades_pack_nxm_familias).
--
-- * unidades_pack(nombre): "X 20 U", "PACK 6 X 10 UN", "4+4", "MAPLE 30", "x 12" al final.
--   "6 X 10" sin unidad solo cuenta en pañuelos y toallitas húmedas (en el resto suele ser una medida).
--   Se aplica a productos dim 'u' cuando da más unidades que las que ya tenía.
-- * Rollo de cocina: dim 'p' (paño). panos_rollo(): "3 X 40 PANOS", "1x200 paños", "3x50p", "X 200 PANOS".
-- * hoja_de(nombre): simple / doble / triple (papel higiénico y rollo de cocina).
-- * filtro_texto(termino): partes libres después de "|" que tienen que aparecer en el nombre:
--   "pañales | xg", "bolsas residuos | 60x90". Entran también en clave_sugerencia.
-- * rendimiento_manual.metros guarda paños para rollo de cocina y unidades para packs.
--
-- Backfill hecho: update productos set nombre = nombre where es_rollo_cocina(nombre)
--   or (dim = 'u' and unidades_pack(nombre) > cant_base)  -- 37 rollos en 'p', ~560 packs.
-- Definiciones finales (copiadas de la base con pg_get_functiondef):

create or replace function public.es_rollo_cocina(p_nombre text) returns boolean
language sql immutable parallel safe set search_path = '' as $$
  select public.texto_simple(p_nombre) ~ '^(rollos?|ro\.?) (de )?coc|\mrollos? (de )?cocina|\mtoallas? de cocina|\mpapel de cocina'
     and public.texto_simple(p_nombre) !~ '\m(porta|soporte|portarrollo)';
$$;

create or replace function public.hoja_de(p_nombre text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select case
    when n ~ '\mtriple' then 'triple'
    when n ~ '\m(dob|dobl|doble|dh)\M|\md/h|\md\.?\s*hoja|\mh\.?\s*dob' then 'doble'
    when n ~ '\m(sim|simp|simple|sh|hs)\M|\ms/h|\mh/s|\mh\.?\s*s\M|\mhoj\w*\s*simp' then 'simple'
  end from (select public.texto_simple(p_nombre) n) x;
$$;

create or replace function public.filtro_texto(p_termino text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select case when count(*) = 0 then null
              else '^' || string_agg('(?=.*\m' || x.f || '\M)', '' order by x.ord) end
    from (
      select trim(regexp_replace(public.texto_simple(s), '[^a-z0-9 ]', ' ', 'g')) f, ord
        from unnest((string_to_array(coalesce(p_termino, ''), '|'))[2:]) with ordinality as t(s, ord)
    ) x
   where x.f <> '' and x.f !~ '^(simple|doble|triple|\d{1,3}\s*m)$';
$$;

create or replace function public.clave_sugerencia(p_termino text, p_dim text)
returns text language sql immutable parallel safe set search_path = '' as $$
  select public.nombre_base(split_part(p_termino, '|', 1))
      || coalesce(' #' || public.filtro_hoja(p_termino), '')
      || coalesce(' #' || public.filtro_min_rollo(p_termino) || 'm', '')
      || coalesce(' #' || (select string_agg(trim(regexp_replace(public.texto_simple(s), '[^a-z0-9 ]', ' ', 'g')), ' #')
                            from unnest((string_to_array(p_termino, '|'))[2:]) s
                           where trim(regexp_replace(public.texto_simple(s), '[^a-z0-9 ]', ' ', 'g')) !~ '^(simple|doble|triple|\d{1,3}\s*m|)$'), '')
      || '|' || coalesce(p_dim, '');
$$;

create or replace function public.panos_rollo(p_nombre text, p_cantidad numeric, p_unidad text) returns numeric
language plpgsql immutable parallel safe set search_path = '' as $$
declare
  n text := public.texto_simple(p_nombre);
  u text := regexp_replace(public.texto_simple(p_unidad), '[^a-z0-9]', '', 'g');
  m text[]; r numeric;
begin
  m := regexp_match(n, '\m(\d{1,2})\s*(rollos?|r|u|un|uni)?\s*x\s*(\d{2,3})\s*(p|pan|panos|panios|hojas|ps)?\M');
  if m is not null then r := m[1]::numeric * m[3]::numeric;
  else
    m := regexp_match(n, '\m(\d{2,4})\s*(p|pan|panos|panios|hojas|ps)\M');
    if m is not null then r := m[1]::numeric;
      m := regexp_match(n, '\m(\d{1,2})\s*(rollos?|uni|un|u)\M|\mx\s*(\d{1,2})\s*(rollos?|uni|un|u)?\M');
      if m is not null and coalesce(m[1], m[3])::numeric between 2 and 12 and r < 150 then r := r * coalesce(m[1], m[3])::numeric; end if;
    elsif u in ('u','un','uni','unidad','unidades') and p_cantidad >= 20 then r := p_cantidad;
    end if;
  end if;
  if r is not null and (r < 20 or r > 3000) then r := null; end if;
  return r;
end;
$$;

create or replace function public.unidades_pack(p_nombre text) returns numeric
language plpgsql immutable parallel safe set search_path = '' as $$
declare
  n text := public.texto_simple(p_nombre);
  m text[]; r numeric;
begin
  m := regexp_match(n, '\m(\d{1,2})\s*x\s*(\d{1,3})\s*(u|un|ud|uds|uni|unid|unidades|panuelos|toallitas)\M');
  if m is not null and m[1]::int between 2 and 24 then return m[1]::numeric * m[2]::numeric; end if;
  -- "6 X 10" sin unidad: solo pañuelos y toallitas húmedas (en el resto suele ser una medida)
  if n ~ '^(panuelos?|toallitas?|toallas? hum|toall hum)' then
    m := regexp_match(n, '\m(\d{1,2})\s*x\s*(\d{1,3})\M(?!\s*(cm|mm|mts?|m|g|gr|grs|kg|ml|l|lt|cc|oz))');
    if m is not null and m[1]::int between 2 and 24 and m[2]::int between 5 and 100 then return m[1]::numeric * m[2]::numeric; end if;
  end if;
  m := regexp_match(n, '\m(\d{1,2})\s*\+\s*(\d{1,2})\M');
  if m is not null and n !~ '\m\d{1,2}\s*\+\s*\d{1,2}\s*(anos|meses|kg)' then return m[1]::numeric + m[2]::numeric; end if;
  m := regexp_match(n, '\m(?:x\s*)?(\d{1,4})\s*(u|un|ud|uds|uni|unid|unidades)\M');
  if m is not null then r := m[1]::numeric;
  else
    m := regexp_match(n, '\mx\s*(\d{1,2})\s*$|\mmaple\s*(?:x\s*)?(\d{1,2})\M');
    if m is not null then r := coalesce(m[1], m[2])::numeric; end if;
  end if;
  if r is not null and (r < 2 or r > 500) then r := null; end if;
  return r;
end;
$$;

create or replace function public.productos_medida_trg() returns trigger
language plpgsql set search_path = '' as $$
declare r record; p record; man record; v numeric;
begin
  r := public.medida_producto(new.nombre, new.cantidad, new.unidad);
  new.dim := r.dim; new.cant_base := r.cant;
  new.nombre_base := public.nombre_base(new.nombre);
  new.rollos := null; new.hoja := null;
  select * into man from public.rendimiento_manual where producto_id = new.id;
  if public.es_papel_higienico(new.nombre) then
    p := public.rendimiento_papel(new.nombre, new.cantidad, new.unidad);
    new.rollos := coalesce(man.rollos, p.rollos);
    new.hoja := coalesce(man.hoja, p.hoja);
    if coalesce(man.metros, p.metros) is not null then
      new.dim := 'm'; new.cant_base := coalesce(man.metros, p.metros);
    end if;
  elsif public.es_rollo_cocina(new.nombre) then
    new.hoja := coalesce(man.hoja, public.hoja_de(new.nombre));
    v := coalesce(man.metros, public.panos_rollo(new.nombre, new.cantidad, new.unidad));
    if v is not null then new.dim := 'p'; new.cant_base := v; end if;
  elsif new.dim = 'u' then
    v := coalesce(man.metros, public.unidades_pack(new.nombre));
    if v is not null and (man.metros is not null or v > coalesce(new.cant_base, 1)) then new.cant_base := v; end if;
  end if;
  return new;
end;
$$;

create or replace function public.candidatos(p_termino text)
returns table (id uuid, nombre text, dim text, cant_base numeric)
language sql stable set search_path = '' as $$
  with base as (select public.nombre_base(split_part(p_termino, '|', 1)) b,
                       public.filtro_hoja(p_termino) fh, public.filtro_min_rollo(p_termino) fm,
                       public.filtro_texto(p_termino) ft,
                       public.es_papel_higienico(split_part(p_termino, '|', 1)) papel,
                       public.es_rollo_cocina(split_part(p_termino, '|', 1)) rollo),
  pats as (
    select coalesce(array_agg('\m' || w || '\M'), array[]::text[]) p
      from base, regexp_split_to_table(base.b, ' ') w where length(w) > 2
  ),
  todos as (
    select c.id, c.nombre, c.dim, c.cant_base, c.nombre_base,
           (c.nombre_base like (select b from base) || '%' or (base.papel and c.dim = 'm') or (base.rollo and c.dim = 'p')) frase,
           (c.nombre_base ~ ('^' || (select b from base) || ' (de|con|sabor|para|tipo|en|sin)\M')) compuesto,
           (c.nombre_base ~ ('^' || split_part((select b from base), ' ', 1) || '\M')) primera
      from public.productos c, pats, base
     where ((cardinality(pats.p) > 0 and c.nombre_base ~ all (pats.p))
            or (base.papel and c.dim = 'm') or (base.rollo and c.dim = 'p'))
       and (base.fh is null or c.hoja = base.fh or (base.fh = 'doble' and c.hoja = 'triple'))
       and (base.fm is null or (c.dim = 'm' and c.cant_base / nullif(c.rollos, 0) >= base.fm))
       and (base.ft is null or public.texto_simple(c.nombre) ~ base.ft)
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
