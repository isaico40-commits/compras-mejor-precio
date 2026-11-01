-- Lugar donde se piensa comprar cada ítem (ej: Makro, Camoga, Feria) y lugares no-súper.
alter table public.lista_items add column lugar_id uuid references public.supermercados(id) on delete set null;
create index lista_items_lugar_idx on public.lista_items (lugar_id);

insert into public.supermercados (nombre, cadena)
select v.n, v.n from (values ('Camoga'),('Feria'),('Multienvases'),('Chinos'),('Mayorista'),('New Garden')) v(n)
where not exists (select 1 from public.supermercados s where lower(s.nombre) = lower(v.n));
