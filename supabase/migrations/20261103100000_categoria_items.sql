-- Categoría elegida para agrupar la lista (null = se detecta por el nombre). Ej: verduleria, carniceria, dietetica.
alter table public.lista_items add column if not exists categoria text;
alter table public.alias_productos add column if not exists categoria text;
