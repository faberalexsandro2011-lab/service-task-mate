-- Central Frotas: cancelamento auditável de transferências ainda não recebidas.
alter table public.transferencias_componentes_frota
  drop constraint if exists transferencias_componentes_frota_status_check;
alter table public.transferencias_componentes_frota
  add constraint transferencias_componentes_frota_status_check
  check (status in ('enviada','recebida','recusada','cancelada'));

alter table public.transferencias_componentes_frota
  add column if not exists cancelada_por uuid references auth.users(id) on delete restrict,
  add column if not exists cancelada_em timestamptz;

create or replace function public.central_frota_cancelar_transferencia(p_transferencia_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_transfer public.transferencias_componentes_frota%rowtype;
begin
  if v_user is null then
    raise exception 'Sessão não autenticada.';
  end if;

  select * into v_transfer
  from public.transferencias_componentes_frota
  where id = p_transferencia_id
  for update;

  if not found then
    raise exception 'Transferência não encontrada.';
  end if;

  if v_transfer.status <> 'enviada' then
    raise exception 'Somente transferências aguardando recebimento podem ser canceladas.';
  end if;

  if v_transfer.enviada_por <> v_user
    and not exists (
      select 1 from public.usuarios_unidades uu
      where uu.user_id = v_user and uu.ativo
        and uu.unidade_id = v_transfer.unidade_origem_id
        and uu.perfil in ('admin_unidade','gestor')
    )
    and not exists (
      select 1 from public.usuarios_unidades uu
      where uu.user_id = v_user and uu.ativo
        and uu.unidade_id is null and uu.perfil = 'gestor_central'
    )
  then
    raise exception 'Somente quem enviou, ADM/gestor da origem ou gestor central pode cancelar.';
  end if;

  update public.componentes_frota
  set status = v_transfer.status_anterior,
      localizacao_estoque = coalesce(localizacao_estoque, 'Estoque geral')
  where id = v_transfer.componente_id
    and unidade_id = v_transfer.unidade_origem_id
    and status = 'transferencia_pendente';

  if not found then
    raise exception 'O equipamento mudou desde o envio; cancelamento não concluído.';
  end if;

  update public.transferencias_componentes_frota
  set status = 'cancelada',
      cancelada_por = v_user,
      cancelada_em = now()
  where id = v_transfer.id and status = 'enviada';

  if not found then
    raise exception 'A transferência já foi processada.';
  end if;
end;
$$;

revoke all on function public.central_frota_cancelar_transferencia(uuid) from public, anon;
grant execute on function public.central_frota_cancelar_transferencia(uuid) to authenticated;
