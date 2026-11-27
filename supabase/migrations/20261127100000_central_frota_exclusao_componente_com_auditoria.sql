-- Exclusão de componente com remoção ordenada dos vínculos e auditoria por trigger.
-- A função só pode ser executada pelo administrador principal do Central Frota.
create or replace function public.central_frota_excluir_componente_admin(p_componente_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if (select auth.uid()) is distinct from '053fa1b6-f9ab-42b2-a726-ed5849170258'::uuid then
    raise exception 'Somente o administrador principal pode excluir componentes.';
  end if;

  if not exists (select 1 from public.componentes_frota where id = p_componente_id) then
    raise exception 'Componente não encontrado.';
  end if;

  delete from public.transferencias_componentes_frota where componente_id = p_componente_id;
  delete from public.movimentacoes_componentes_frota where componente_id = p_componente_id;
  delete from public.instalacoes_frota where componente_id = p_componente_id;
  delete from public.componentes_frota where id = p_componente_id;
end;
$$;

revoke all on function public.central_frota_excluir_componente_admin(uuid) from public, anon;
grant execute on function public.central_frota_excluir_componente_admin(uuid) to authenticated;
