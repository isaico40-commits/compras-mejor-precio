create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- Suscripciones push de cada usuario (un registro por dispositivo)
create table if not exists public.push_suscripciones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_suscripciones enable row level security;
create policy "suscripciones propias" on public.push_suscripciones for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create index if not exists push_suscripciones_user_idx on public.push_suscripciones (user_id);

-- Qué ya se avisó (para no repetir la misma alerta todos los días)
create table if not exists public.push_enviados (
  user_id uuid not null references auth.users(id) on delete cascade,
  clave text not null,
  precio numeric(12,2),
  enviado_at timestamptz not null default now(),
  primary key (user_id, clave)
);
alter table public.push_enviados enable row level security;
create policy "enviados propios" on public.push_enviados for select to authenticated using (user_id = (select auth.uid()));

-- Claves VAPID: las genera la función de envío la primera vez; nadie de afuera puede leer la privada
create schema if not exists privado;
revoke all on schema privado from public, anon, authenticated;
create table if not exists privado.push_claves (
  id int primary key default 1 check (id = 1),
  publica text not null,
  privada text not null,
  created_at timestamptz not null default now()
);
revoke all on privado.push_claves from public, anon, authenticated;

create or replace function public.vapid_publica() returns text
language sql stable security definer set search_path = '' as $$
  select publica from privado.push_claves where id = 1;
$$;
grant execute on function public.vapid_publica() to anon, authenticated;

create or replace function public.push_claves_leer() returns table (publica text, privada text)
language sql stable security definer set search_path = '' as $$
  select publica, privada from privado.push_claves where id = 1;
$$;
create or replace function public.push_claves_guardar(p_publica text, p_privada text) returns void
language sql security definer set search_path = '' as $$
  insert into privado.push_claves (id, publica, privada) values (1, p_publica, p_privada) on conflict (id) do nothing;
$$;
revoke execute on function public.push_claves_leer() from public, anon, authenticated;
revoke execute on function public.push_claves_guardar(text, text) from public, anon, authenticated;
grant execute on function public.push_claves_leer() to service_role;
grant execute on function public.push_claves_guardar(text, text) to service_role;

-- Precio actual vs. anterior de cada producto (todas las cadenas): actual = mínimo de lo último de cada súper,
-- anterior = mínimo de lo penúltimo de cada súper. Más mínimo/máximo de 30 días.
create or replace function public.variacion_precios(p_productos uuid[])
returns table (producto_id uuid, actual numeric, anterior numeric, minimo numeric, maximo numeric, fechas int, super_actual text)
language sql stable set search_path = '' as $$
  with h as (
    select pr.producto_id, pr.supermercado_id, pr.fecha, coalesce(pr.precio_promo, pr.precio) ef,
           row_number() over (partition by pr.producto_id, pr.supermercado_id order by pr.fecha desc, pr.created_at desc) rn
      from public.precios pr
     where pr.producto_id = any (p_productos)
       and pr.fecha >= (now() at time zone 'America/Argentina/Buenos_Aires')::date - 30
  ),
  act as (
    select distinct on (h.producto_id) h.producto_id, h.ef, s.nombre
      from h join public.supermercados s on s.id = h.supermercado_id
     where h.rn = 1 order by h.producto_id, h.ef
  )
  select h.producto_id, min(h.ef) filter (where h.rn = 1), min(h.ef) filter (where h.rn = 2),
         min(h.ef), max(h.ef), count(distinct h.fecha)::int, (select a.nombre from act a where a.producto_id = h.producto_id)
    from h group by h.producto_id;
$$;
grant execute on function public.variacion_precios(uuid[]) to authenticated, service_role;

-- Alertas a mandar por push (solo la función de envío): tope, mínimo del mes y baja de más de 5%
-- para lo que está en la lista y lo que comprás seguido (2+ compras en 120 días).
create or replace function public.alertas_push()
returns table (user_id uuid, clave text, tipo text, titulo text, texto text, precio numeric, url text)
language sql stable security definer set search_path = '' as $$
  with items as (
    select l.user_id, li.id item_id, coalesce(li.nombre, p.nombre) titulo, li.precio_alerta, li.producto_id fijo,
           coalesce(nullif(li.termino, ''), lower(li.nombre)) termino
      from public.lista_items li
      join public.listas l on l.id = li.lista_id
      left join public.productos p on p.id = li.producto_id
     where (li.ultima_compra is null or (li.frecuencia_dias is not null and li.ultima_compra + li.frecuencia_dias <= current_date))
       and coalesce(li.rubro, 'super') = 'super'
  ),
  mejor as (   -- producto más barato de cada ítem: el fijado, o el primero del análisis guardado
    select i.*, coalesce(i.fijo, (s.resultado->'opciones'->0->>'producto_id')::uuid) producto_id
      from items i
      left join public.sugerencias s on i.fijo is null and s.clave = public.clave_sugerencia(i.termino, null)
  ),
  frecuentes as (   -- lo que comprás seguido y no está en la lista
    select h.user_id, max(h.nombre) titulo, h.producto_id
      from public.compras_historial h
     where h.producto_id is not null and h.fecha >= current_date - 120
     group by h.user_id, h.producto_id having count(*) >= 2
  ),
  todos as (
    select m.user_id, m.titulo, m.producto_id, m.precio_alerta, '/item/mio/' || m.item_id url, 'lista' origen from mejor m where m.producto_id is not null
    union all
    select f.user_id, f.titulo, f.producto_id, null, '/', 'frecuente' from frecuentes f
     where not exists (select 1 from mejor m where m.user_id = f.user_id and m.producto_id = f.producto_id)
  ),
  v as (
    select t.*, x.actual, x.anterior, x.minimo, x.maximo, x.fechas, x.super_actual
      from todos t
      join lateral (select * from public.variacion_precios(array[t.producto_id])) x on true
  ),
  alertas as (
    select v.user_id, 'tope:' || v.producto_id clave, 'tope' tipo, '🔔 ' || v.titulo titulo,
           'Bajó a $' || to_char(round(v.actual), 'FM999G999G999') || ' en ' || v.super_actual || ' (tu tope $' || to_char(round(v.precio_alerta), 'FM999G999G999') || ')' texto,
           v.actual precio, v.url
      from v where v.precio_alerta is not null and v.actual <= v.precio_alerta
    union all
    select v.user_id, 'baja:' || v.producto_id, 'baja', '📉 ' || v.titulo,
           'Bajó ' || round((1 - v.actual / v.anterior) * 100) || '%: $' || to_char(round(v.actual), 'FM999G999G999') || ' en ' || v.super_actual
             || case when v.origen = 'frecuente' then ' (lo comprás seguido)' else '' end,
           v.actual, v.url
      from v where v.anterior is not null and v.actual <= v.anterior * 0.95
       and not (v.precio_alerta is not null and v.actual <= v.precio_alerta)
    union all
    select v.user_id, 'minimo:' || v.producto_id, 'minimo', '📉 ' || v.titulo,
           'Está en su precio más bajo del mes: $' || to_char(round(v.actual), 'FM999G999G999') || ' en ' || v.super_actual,
           v.actual, v.url
      from v where v.fechas >= 2 and v.maximo >= v.minimo * 1.08 and v.actual <= v.minimo * 1.01
       and not (v.anterior is not null and v.actual <= v.anterior * 0.95)
       and not (v.precio_alerta is not null and v.actual <= v.precio_alerta)
  )
  -- no repetir: solo si nunca se avisó, si bajó otra vez (1%+) o pasó una semana
  select a.* from alertas a
   where not exists (
     select 1 from public.push_enviados e
      where e.user_id = a.user_id and e.clave = a.clave
        and (a.precio >= e.precio * 0.99) and e.enviado_at > now() - interval '7 days'
   );
$$;
revoke execute on function public.alertas_push() from public, anon, authenticated;
grant execute on function public.alertas_push() to service_role;

-- Envío diario (aplicado aparte con execute_sql): pg_cron 'avisar-precios' a las 14:30 UTC (11:30 ART),
-- net.http_post a /functions/v1/avisar-precios con la anon key como Bearer y body '{}'.
