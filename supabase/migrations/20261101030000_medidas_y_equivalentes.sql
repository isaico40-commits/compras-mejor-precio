-- Tamaño normalizado de cada producto (kg / l / u) y búsqueda de presentaciones equivalentes.

alter table public.productos
  add column if not exists dim text,
  add column if not exists cant_base numeric,
  add column if not exists nombre_base text;

create or replace function public.texto_simple(t text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select lower(translate(coalesce(t, ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'));
$$;

create or replace function public.medida_producto(p_nombre text, p_cantidad numeric, p_unidad text, out dim text, out cant numeric)
language plpgsql immutable parallel safe set search_path = '' as $$
declare
  n text := public.texto_simple(p_nombre);
  u text := regexp_replace(public.texto_simple(p_unidad), '[^a-z0-9]', '', 'g');
  m text[];
  num numeric;
  mult numeric := 1;
  un text;
begin
  m := regexp_match(n, '(\d{1,3})\s*x\s*(\d+(?:[.,]\d+)?)\s*(kgm|kg|kilos?|grs?|grm|g|ltr|lts?|l|ml|cc|cm3)\M');
  if m is not null then
    mult := m[1]::numeric; num := replace(m[2], ',', '.')::numeric; un := m[3];
  else
    m := regexp_match(n, '.*\m(\d+(?:[.,]\d+)?)\s*-?\s*(kgm|kg|kilos?|grs?|grm|g|ltr|lts?|l|ml|cc|cm3)\M');
    if m is not null then num := replace(m[1], ',', '.')::numeric; un := m[2]; end if;
  end if;

  if num is null and p_cantidad is not null and p_cantidad > 0 then
    num := p_cantidad; un := u;
  end if;

  if num is null or num <= 0 then
    dim := 'u'; cant := 1; return;
  end if;

  if un in ('kg','kgm','kilo','kilos') then dim := 'kg'; cant := num * mult;
  elsif un in ('g','gr','grs','grm') then dim := 'kg'; cant := num * mult / 1000;
  elsif un in ('l','lt','lts','ltr') then dim := 'l'; cant := num * mult;
  elsif un in ('ml','cc','cm3','cmq') then dim := 'l'; cant := num * mult / 1000;
  elsif un in ('u','un','uni','unidad','unidades','pck') then dim := 'u'; cant := greatest(num, 1);
  else dim := 'u'; cant := 1;
  end if;

  if (dim in ('kg','l') and (cant < 0.005 or cant > 100)) or (dim = 'u' and cant > 500) then
    dim := 'u'; cant := 1;
  end if;
end;
$$;

create or replace function public.nombre_base(p_nombre text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select trim(regexp_replace(regexp_replace(regexp_replace(
    public.texto_simple(p_nombre),
    '\m(paq|doy|bot|pot|cja|pck|lat|bsa|est|sob|bid|bdj|frs|tbt|x|un|uni|unid|kgm|kg|grs?|grm|g|ltr|lts?|l|ml|cc|cm3)\M', ' ', 'g'),
    '[0-9]+([.,][0-9]+)?|[^a-z ]', ' ', 'g'),
    '\s+', ' ', 'g'));
$$;

create or replace function public.productos_medida_trg() returns trigger
language plpgsql set search_path = '' as $$
declare r record;
begin
  r := public.medida_producto(new.nombre, new.cantidad, new.unidad);
  new.dim := r.dim; new.cant_base := r.cant;
  new.nombre_base := public.nombre_base(new.nombre);
  return new;
end;
$$;

drop trigger if exists productos_medida on public.productos;
create trigger productos_medida before insert or update of nombre, cantidad, unidad on public.productos
  for each row execute function public.productos_medida_trg();

create index if not exists productos_nombre_base_trgm_idx on public.productos using gin (nombre_base extensions.gin_trgm_ops);
create index if not exists productos_dim_idx on public.productos (dim);

-- Backfill (se corrió en lotes): update public.productos set nombre = nombre where dim is null;

-- Ítems genéricos ("Azúcar") sin producto fijo y término de búsqueda por ítem
alter table public.lista_items alter column producto_id drop not null;
alter table public.lista_items add column if not exists nombre text;
alter table public.lista_items add column if not exists termino text;
alter table public.alias_productos add column if not exists termino text;

-- Funciones opciones_termino, opciones_lote y opciones_lote_en_super: aplicadas desde Supabase
-- (opciones más baratas por kg / litro / unidad, todas las marcas y presentaciones).
