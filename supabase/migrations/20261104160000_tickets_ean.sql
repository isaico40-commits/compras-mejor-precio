-- Tickets por código de barras (aplicada en Supabase el 2026-11-04).
-- Si un ítem de ticket trae EAN, se vincula solo al producto exacto (sin adivinar por el nombre cortado).
alter table public.ticket_items add column if not exists ean text;

-- Producto por código de barras: acepta con o sin ceros adelante y con guiones/espacios (EAN-8/12/13/14)
create or replace function public.producto_por_ean(p_ean text) returns uuid
language sql stable set search_path = '' as $$
  with d as (select nullif(ltrim(regexp_replace(coalesce(p_ean, ''), '\D', '', 'g'), '0'), '') e)
  select p.id from public.productos p, d
   where d.e is not null and length(d.e) >= 7
     and p.ean in (d.e, lpad(d.e, 13, '0'), lpad(d.e, 14, '0'), lpad(d.e, 12, '0'), lpad(d.e, 8, '0'))
   limit 1;
$$;
grant execute on function public.producto_por_ean(text) to authenticated;

create or replace function public.ticket_items_ean_trg() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.ean is not null then
    new.ean := nullif(regexp_replace(new.ean, '\D', '', 'g'), '');
    if new.producto_id is null and new.ean is not null then
      new.producto_id := public.producto_por_ean(new.ean);
    end if;
  end if;
  return new;
end;
$$;

create trigger ticket_items_ean before insert or update of ean, producto_id on public.ticket_items
  for each row execute function public.ticket_items_ean_trg();

create index if not exists ticket_items_ean_idx on public.ticket_items (ean) where ean is not null;
