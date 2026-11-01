-- Conexión a la lista de Setto, alias de texto libre -> producto, tickets y comparación de productos sueltos.

create table public.integraciones (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  setto_url text,
  setto_key text,
  setto_token text,
  created_at timestamptz not null default now()
);
alter table public.integraciones enable row level security;
create policy "integraciones propias" on public.integraciones for select to authenticated
  using (user_id = (select auth.uid()));

create table public.alias_productos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  texto text not null,
  producto_id uuid references public.productos(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, texto)
);
create index alias_productos_producto_idx on public.alias_productos (producto_id);
alter table public.alias_productos enable row level security;
create policy "alias propios" on public.alias_productos for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  supermercado_id uuid references public.supermercados(id) on delete set null,
  comercio text,
  fecha date not null,
  total numeric(12,2),
  medio_pago text,
  notas text,
  created_at timestamptz not null default now()
);
create index tickets_user_fecha_idx on public.tickets (user_id, fecha desc);
create index tickets_super_idx on public.tickets (supermercado_id);

create table public.ticket_items (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  producto_id uuid references public.productos(id) on delete set null,
  descripcion text not null,
  cantidad numeric not null default 1,
  precio_unitario numeric(12,2),
  subtotal numeric(12,2),
  descuento numeric(12,2)
);
create index ticket_items_ticket_idx on public.ticket_items (ticket_id);
create index ticket_items_producto_idx on public.ticket_items (producto_id);

alter table public.tickets enable row level security;
alter table public.ticket_items enable row level security;
create policy "tickets propios" on public.tickets for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "items de tickets propios" on public.ticket_items for all to authenticated
  using (exists (select 1 from public.tickets t where t.id = ticket_id and t.user_id = (select auth.uid())))
  with check (exists (select 1 from public.tickets t where t.id = ticket_id and t.user_id = (select auth.uid())));

create or replace function public.sugerir_productos(p_texto text, p_limite int default 6)
returns table (id uuid, nombre text, marca text, cantidad numeric, unidad text, similitud real)
language sql stable security invoker set search_path = '' as $$
  with c as (
    select p.id, p.nombre, p.marca, p.cantidad, p.unidad,
           extensions.word_similarity(lower(p_texto), lower(p.nombre)) as sim,
           (lower(p.nombre) like lower(p_texto) || '%') as empieza
      from public.productos p
     where lower(p_texto) operator(extensions.<%) lower(p.nombre)
        or p.nombre ilike '%' || p_texto || '%'
     order by extensions.word_similarity(lower(p_texto), lower(p.nombre)) desc
     limit 200
  )
  select c.id, c.nombre, c.marca, c.cantidad, c.unidad, c.sim
    from c
    left join lateral (select count(*) n from public.precios pr where pr.producto_id = c.id) pop on true
   order by c.empieza desc, c.sim desc, pop.n desc, length(c.nombre)
   limit p_limite;
$$;

create or replace function public.comparar_productos(p_productos uuid[], p_super_id uuid)
returns table (producto_id uuid, precio_aca numeric, mejor_precio numeric, mejor_super text)
language sql stable security invoker set search_path = '' as $$
  select x.pid, aca.efectivo, otro.efectivo, s.nombre
  from unnest(p_productos) as x(pid)
  left join lateral (
    select coalesce(pr.precio_promo, pr.precio) as efectivo
      from public.precios pr
     where pr.producto_id = x.pid and pr.supermercado_id = p_super_id
     order by pr.fecha desc, pr.created_at desc limit 1
  ) aca on true
  left join lateral (
    select u.supermercado_id, u.efectivo from (
      select distinct on (pr.supermercado_id) pr.supermercado_id, coalesce(pr.precio_promo, pr.precio) as efectivo
        from public.precios pr
       where pr.producto_id = x.pid and pr.supermercado_id is distinct from p_super_id
       order by pr.supermercado_id, pr.fecha desc, pr.created_at desc
    ) u order by u.efectivo limit 1
  ) otro on true
  left join public.supermercados s on s.id = otro.supermercado_id;
$$;
