-- Vínculo de cada insumo de la app con su insumo del panel de costos de Setto
alter table public.setto_insumos
  add column if not exists panel_id uuid,
  add column if not exists panel_nombre text,
  add column if not exists exportado_precio numeric,
  add column if not exists exportado_fecha date,
  add column if not exists exportado_at timestamptz;
