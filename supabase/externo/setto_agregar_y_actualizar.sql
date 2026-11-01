-- Se aplica en el proyecto Supabase de setto-web (vqgfckswnqoekotmsyam), NO en app-compras.
-- Pedido por Isaias el 2026-11-01: manejar una sola lista desde la app de compras.
-- Las dos validan el token con compras_pendientes (tira error si no coincide).

-- Agrega un ítem a caja_compras si no hay uno pendiente con el mismo nombre (no duplica).
create or replace function public.agregar_compra(p_token text, p_item text, p_cantidad text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_item text := btrim(regexp_replace(p_item, '\s+', ' ', 'g'));
begin
  perform 1 from public.compras_pendientes(p_token) limit 1;
  if v_item is null or length(v_item) = 0 then raise exception 'item vacío'; end if;
  select id into v_id from public.caja_compras
   where estado = 'pendiente' and lower(btrim(regexp_replace(item, '\s+', ' ', 'g'))) = lower(v_item)
   limit 1;
  if v_id is not null then return v_id; end if;
  insert into public.caja_compras (item, cantidad, creada_por) values (v_item, p_cantidad, 'Isa') returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.agregar_compra(text, text, text) from public;
grant execute on function public.agregar_compra(text, text, text) to anon, authenticated;

-- Pasa ítems pendientes a 'comprado' o 'quitada'. No toca nada más.
create or replace function public.actualizar_compras(p_token text, p_ids uuid[], p_estado text)
returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  perform 1 from public.compras_pendientes(p_token) limit 1;
  if p_estado not in ('comprado', 'quitada') then raise exception 'estado inválido'; end if;
  update public.caja_compras
     set estado = p_estado,
         comprada_por = case when p_estado = 'comprado' then 'Isa' else comprada_por end,
         comprada_at = case when p_estado = 'comprado' then now() else comprada_at end
   where id = any(p_ids) and estado = 'pendiente';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.actualizar_compras(text, uuid[], text) from public;
grant execute on function public.actualizar_compras(text, uuid[], text) to anon, authenticated;
