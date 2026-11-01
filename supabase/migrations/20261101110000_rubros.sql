-- Rubro de cada ítem: súper, verdulería, bazar u otro comercio.
-- null = se detecta solo por el nombre. Lo que no es de súper no se compara con Precios Claros.
alter table public.lista_items add column if not exists rubro text
  check (rubro in ('super', 'verduleria', 'bazar', 'otro'));
alter table public.alias_productos add column if not exists rubro text
  check (rubro in ('super', 'verduleria', 'bazar', 'otro'));

-- Comercio habitual por rubro ("mi verdulería")
create table if not exists public.rubros_habituales (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  rubro text not null check (rubro in ('verduleria', 'bazar', 'otro')),
  lugar_id uuid not null references public.supermercados(id) on delete cascade,
  primary key (user_id, rubro)
);
alter table public.rubros_habituales enable row level security;
create policy "habituales propios" on public.rubros_habituales for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
