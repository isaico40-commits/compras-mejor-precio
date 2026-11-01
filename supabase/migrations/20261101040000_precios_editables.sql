-- Editar precios propios, productos creados a mano y nombre corregido de ítems de Setto.
create policy "precios editar propios" on public.precios for update to authenticated
  using (cargado_por = (select auth.uid())) with check (cargado_por = (select auth.uid()));
create index if not exists precios_cargado_por_idx on public.precios (cargado_por, created_at desc);

alter table public.alias_productos add column if not exists nombre text;

alter table public.productos add column if not exists creado_por uuid references auth.users(id) on delete set null default auth.uid();
create index if not exists productos_creado_por_idx on public.productos (creado_por);
create policy "productos editar propios" on public.productos for update to authenticated
  using (creado_por = (select auth.uid())) with check (creado_por = (select auth.uid()));
