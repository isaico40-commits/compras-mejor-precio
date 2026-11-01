-- Se aplica en el proyecto Supabase de setto-web (vqgfckswnqoekotmsyam), NO en app-compras.
-- Solo lectura de los pendientes de caja_compras, protegida por token.
-- El token vive en public.integraciones de app-compras; acá solo va su hash SHA-256.
create or replace function public.compras_pendientes(p_token text)
returns table (id uuid, item text, cantidad text, donde text, urgente boolean, nota text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_token is null or encode(sha256(convert_to(p_token, 'UTF8')), 'hex') <> '<HASH_DEL_TOKEN>' then
    raise exception 'token inválido' using errcode = '42501';
  end if;
  return query
    select c.id, c.item, c.cantidad, c.donde, c.urgente, c.nota, c.created_at
      from public.caja_compras c
     where c.estado = 'pendiente'
     order by c.urgente desc nulls last, c.created_at;
end;
$$;

revoke execute on function public.compras_pendientes(text) from public;
grant execute on function public.compras_pendientes(text) to anon, authenticated;
