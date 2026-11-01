-- "Borrar" un lugar cargado por error: se oculta (no tiene que tener precios ni descuentos).
alter table public.supermercados add column if not exists oculto boolean not null default false;
create or replace function public.ocultar_lugar(p_id uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sin sesión'; end if;
  if exists (select 1 from public.precios where supermercado_id = p_id)
     or exists (select 1 from public.descuentos where supermercado_id = p_id) then
    raise exception 'Ese lugar tiene precios o descuentos cargados';
  end if;
  update public.supermercados set oculto = true where id = p_id;
  return found;
end;
$$;
revoke execute on function public.ocultar_lugar(uuid) from public, anon;
grant execute on function public.ocultar_lugar(uuid) to authenticated;
