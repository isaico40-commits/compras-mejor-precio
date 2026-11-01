-- Lugar donde se compra un ítem de Setto (pisa el "donde" de la caja, solo en esta app)
alter table public.alias_productos add column if not exists lugar_id uuid references public.supermercados(id) on delete set null;
create index if not exists alias_productos_lugar_idx on public.alias_productos (lugar_id);
