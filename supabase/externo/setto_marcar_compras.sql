-- Se aplica en el proyecto Supabase de setto-web (vqgfckswnqoekotmsyam), NO en app-compras.
-- Autorizado por Isaias el 2026-11-01: al terminar la compra en el súper, marca como comprados
-- los ítems de caja_compras tildados. Solo pasa ítems 'pendiente' a 'comprado'; no hace nada más.
-- El token se valida con la misma función de lectura (compras_pendientes tira error si no coincide).
create or replace function public.marcar_compras(p_token text, p_ids uuid[])
returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  perform 1 from public.compras_pendientes(p_token) limit 1;
  update public.caja_compras
     set estado = 'comprado', comprada_por = 'Isa', comprada_at = now()
   where id = any(p_ids) and estado = 'pendiente';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.marcar_compras(text, uuid[]) from public;
grant execute on function public.marcar_compras(text, uuid[]) to anon, authenticated;
