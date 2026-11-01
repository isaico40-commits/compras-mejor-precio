-- Descuentos por día, súper y medio de pago (los busca Claude en internet o los carga Isaias a mano)
create table if not exists public.descuentos (
  id uuid primary key default gen_random_uuid(),
  supermercado_id uuid not null references public.supermercados(id) on delete cascade,
  dias smallint[] not null,               -- 0 = domingo … 6 = sábado
  medio text not null,                    -- Mercado Pago | MODO | BBVA | Santander | Brubank | Otro
  porcentaje numeric(5,2) not null check (porcentaje > 0 and porcentaje < 100),
  tope numeric(12,2),                     -- tope de reintegro en pesos (null = sin tope o no se sabe)
  tope_periodo text,                      -- compra | semana | mes
  minimo numeric(12,2),
  detalle text,
  fuente text,                            -- URL o "manual"
  verificado date,
  hasta date,                             -- vigente hasta (inclusive)
  creado_por uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists descuentos_super_idx on public.descuentos (supermercado_id);
alter table public.descuentos enable row level security;
create policy "descuentos lectura" on public.descuentos for select to authenticated using (true);
create policy "descuentos alta" on public.descuentos for insert to authenticated with check (true);
create policy "descuentos cambio" on public.descuentos for update to authenticated using (true) with check (true);
create policy "descuentos baja" on public.descuentos for delete to authenticated using (true);

-- Carga inicial verificada el 2026-11-01: guía de Mercado Pago para noviembre 2026
-- (calcularsueldo.com.ar, actualizada 30/10/2026). Topes y mínimos: la fuente no los dice.
insert into public.descuentos (supermercado_id, dias, medio, porcentaje, detalle, fuente, verificado, hasta)
select s.id, v.dias, 'Mercado Pago', v.pct, v.detalle,
       'https://calcularsueldo.com.ar/finanzas/16359/supermercados-mercado-pago-la-guia-completa-de-descuentos-y-cuotas-por-dia.html',
       date '2026-11-01', date '2026-11-30'
  from (values
    ('Vea', array[1]::smallint[], 20, 'Pagando con QR de Mercado Pago'),
    ('Carrefour Hiper', array[1,4]::smallint[], 15, 'Escaneando el QR en la caja'),
    ('Carrefour Market', array[1,4]::smallint[], 15, 'Escaneando el QR en la caja'),
    ('La Anónima', array[1]::smallint[], 15, 'Pagando con QR'),
    ('ChangoMás', array[2]::smallint[], 15, 'Presencial y online'),
    ('Toledo', array[2,6,0]::smallint[], 15, 'Pagando con QR de Mercado Pago'),
    ('Día', array[3]::smallint[], 15, 'Sucursales y Día Online'),
    ('Coto', array[5]::smallint[], 25, 'Pagando con QR de Mercado Pago'),
    ('Coto', array[6,0]::smallint[], 20, 'Pagando con QR de Mercado Pago'),
    ('Makro', array[5,6]::smallint[], 10, 'Con dinero en cuenta. En octubre excluía carnes, aves y embutidos')
  ) as v(nombre, dias, pct, detalle)
  join public.supermercados s on s.nombre = v.nombre
 where not exists (select 1 from public.descuentos);
