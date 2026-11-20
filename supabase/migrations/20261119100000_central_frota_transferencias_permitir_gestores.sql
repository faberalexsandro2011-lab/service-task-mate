-- Allow unit managers to perform Central Frotas stock transfers.
-- Authorization remains scoped to the source/destination unit and active membership.
create or replace function public.central_frota_enviar_transferencia(p_componente_id uuid,p_unidade_destino_id uuid,p_observacoes text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_item public.componentes_frota%rowtype; v_id uuid;
begin
 if v_user is null then raise exception 'Sessão não autenticada.'; end if;
 select * into v_item from public.componentes_frota where id=p_componente_id for update;
 if not found then raise exception 'Equipamento não encontrado.'; end if;
 if not exists(select 1 from public.usuarios_unidades uu where uu.user_id=v_user and uu.ativo and uu.unidade_id=v_item.unidade_id and uu.perfil in ('admin_unidade','gestor'))
 and not exists(select 1 from public.usuarios_unidades uu where uu.user_id=v_user and uu.ativo and uu.unidade_id is null and uu.perfil='gestor_central')
 then raise exception 'Somente ADM ou gestor da unidade de origem, ou gestor central, pode enviar equipamentos.'; end if;
 if p_unidade_destino_id=v_item.unidade_id then raise exception 'A unidade de destino deve ser diferente da origem.'; end if;
 if not exists(select 1 from public.unidades u where u.id=p_unidade_destino_id and u.ativa) then raise exception 'Unidade de destino inválida ou inativa.'; end if;
 if v_item.status not in ('disponivel','backup') then raise exception 'Somente equipamento disponível ou backup pode ser transferido.'; end if;
 if exists(select 1 from public.instalacoes_frota i where i.componente_id=v_item.id and i.retirado_em is null) then raise exception 'Retire o equipamento da frota antes de transferi-lo.'; end if;
 insert into public.transferencias_componentes_frota(componente_id,unidade_origem_id,unidade_destino_id,status_anterior,enviada_por,observacoes)
 values(v_item.id,v_item.unidade_id,p_unidade_destino_id,v_item.status,v_user,nullif(trim(p_observacoes),'')) returning id into v_id;
 update public.componentes_frota set status='transferencia_pendente',localizacao_estoque=null where id=v_item.id;
 return v_id;
end; $$;

create or replace function public.central_frota_confirmar_recebimento(p_transferencia_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_transfer public.transferencias_componentes_frota%rowtype;
begin
 if v_user is null then raise exception 'Sessão não autenticada.'; end if;
 select * into v_transfer from public.transferencias_componentes_frota where id=p_transferencia_id for update;
 if not found then raise exception 'Transferência não encontrada.'; end if;
 if v_transfer.status<>'enviada' then raise exception 'Esta transferência não está aguardando recebimento.'; end if;
 if not exists(select 1 from public.usuarios_unidades uu where uu.user_id=v_user and uu.ativo and uu.unidade_id=v_transfer.unidade_destino_id and uu.perfil in ('admin_unidade','gestor'))
 and not exists(select 1 from public.usuarios_unidades uu where uu.user_id=v_user and uu.ativo and uu.unidade_id is null and uu.perfil='gestor_central')
 then raise exception 'Somente ADM ou gestor da unidade de destino, ou gestor central, pode confirmar o recebimento.'; end if;
 update public.componentes_frota set unidade_id=v_transfer.unidade_destino_id,status=v_transfer.status_anterior,localizacao_estoque='Estoque geral'
 where id=v_transfer.componente_id and unidade_id=v_transfer.unidade_origem_id and status='transferencia_pendente';
 if not found then raise exception 'O equipamento mudou desde o envio; transferência não concluída.'; end if;
 update public.transferencias_componentes_frota set status='recebida',recebida_por=v_user,recebida_em=now() where id=v_transfer.id and status='enviada';
 if not found then raise exception 'A transferência já foi processada.'; end if;
end; $$;

create or replace function public.central_frota_recusar_recebimento(p_transferencia_id uuid,p_motivo text)
returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_transfer public.transferencias_componentes_frota%rowtype;
begin
 if v_user is null then raise exception 'Sessão não autenticada.'; end if;
 if nullif(trim(p_motivo),'') is null then raise exception 'Informe o motivo da recusa.'; end if;
 select * into v_transfer from public.transferencias_componentes_frota where id=p_transferencia_id for update;
 if not found then raise exception 'Transferência não encontrada.'; end if;
 if v_transfer.status<>'enviada' then raise exception 'Esta transferência não está aguardando recebimento.'; end if;
 if not exists(select 1 from public.usuarios_unidades uu where uu.user_id=v_user and uu.ativo and uu.unidade_id=v_transfer.unidade_destino_id and uu.perfil in ('admin_unidade','gestor'))
 and not exists(select 1 from public.usuarios_unidades uu where uu.user_id=v_user and uu.ativo and uu.unidade_id is null and uu.perfil='gestor_central')
 then raise exception 'Somente ADM ou gestor da unidade de destino, ou gestor central, pode recusar o recebimento.'; end if;
 update public.transferencias_componentes_frota set status='recusada',recusada_por=v_user,recusada_em=now(),motivo_recusa=trim(p_motivo) where id=v_transfer.id and status='enviada';
 if not found then raise exception 'A transferência já foi processada.'; end if;
 -- Equipamento permanece na origem, bloqueado, até resolução posterior da recusa.
end; $$;

revoke all on function public.central_frota_enviar_transferencia(uuid,uuid,text) from public,anon;
revoke all on function public.central_frota_confirmar_recebimento(uuid) from public,anon;
revoke all on function public.central_frota_recusar_recebimento(uuid,text) from public,anon;
grant execute on function public.central_frota_enviar_transferencia(uuid,uuid,text) to authenticated;
grant execute on function public.central_frota_confirmar_recebimento(uuid) to authenticated;
grant execute on function public.central_frota_recusar_recebimento(uuid,text) to authenticated;
