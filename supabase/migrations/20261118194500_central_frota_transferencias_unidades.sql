-- Central Frotas: transferências entre unidades com recebimento/recusa auditáveis.
-- Exclusivo do banco de testes da branch test/central-frotas-qr-piloto.
alter table public.componentes_frota drop constraint if exists componentes_frota_status_check;
alter table public.componentes_frota add constraint componentes_frota_status_check check (status in ('disponivel','instalado','manutencao','descartado','backup','transferencia_pendente'));
create table public.transferencias_componentes_frota (
 id uuid primary key default gen_random_uuid(),
 componente_id uuid not null references public.componentes_frota(id) on delete restrict,
 unidade_origem_id uuid not null references public.unidades(id) on delete restrict,
 unidade_destino_id uuid not null references public.unidades(id) on delete restrict,
 status_anterior text not null check (status_anterior in ('disponivel','backup')),
 status text not null default 'enviada' check (status in ('enviada','recebida','recusada')),
 enviada_por uuid not null references auth.users(id) on delete restrict,
 enviada_em timestamptz not null default now(),
 recebida_por uuid references auth.users(id) on delete restrict,
 recebida_em timestamptz,
 recusada_por uuid references auth.users(id) on delete restrict,
 recusada_em timestamptz,
 motivo_recusa text,
 observacoes text,
 constraint transferencia_unidades_distintas check (unidade_origem_id <> unidade_destino_id),
 constraint transferencia_recusa_motivo check (status <> 'recusada' or (motivo_recusa is not null and length(trim(motivo_recusa)) > 0))
);
create index transferencias_componentes_origem_idx on public.transferencias_componentes_frota(unidade_origem_id, enviada_em desc);
create index transferencias_componentes_destino_idx on public.transferencias_componentes_frota(unidade_destino_id, enviada_em desc);
create unique index transferencias_componentes_aberta_idx on public.transferencias_componentes_frota(componente_id) where status in ('enviada','recusada');
alter table public.transferencias_componentes_frota enable row level security;
grant select on public.transferencias_componentes_frota to authenticated;
drop policy if exists central_frota_transferencias_select on public.transferencias_componentes_frota;
create policy central_frota_transferencias_select on public.transferencias_componentes_frota for select to authenticated using (public.central_frota_tem_acesso(unidade_origem_id,false) or public.central_frota_tem_acesso(unidade_destino_id,false));

create or replace function public.central_frota_enviar_transferencia(p_componente_id uuid,p_unidade_destino_id uuid,p_observacoes text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_item public.componentes_frota%rowtype; v_id uuid;
begin
 if v_user is null then raise exception 'Sessão não autenticada.'; end if;
 select * into v_item from public.componentes_frota where id=p_componente_id for update;
 if not found then raise exception 'Equipamento não encontrado.'; end if;
 if not exists(select 1 from public.usuarios_unidades uu where uu.user_id=v_user and uu.ativo and uu.unidade_id=v_item.unidade_id and uu.perfil in ('admin_unidade','gestor_central'))
 and not exists(select 1 from public.usuarios_unidades uu where uu.user_id=v_user and uu.ativo and uu.unidade_id is null and uu.perfil='gestor_central')
 then raise exception 'Somente ADM da unidade de origem ou gestor central pode enviar equipamentos.'; end if;
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
 if not exists(select 1 from public.usuarios_unidades uu where uu.user_id=v_user and uu.ativo and uu.unidade_id=v_transfer.unidade_destino_id and uu.perfil in ('admin_unidade','gestor_central'))
 and not exists(select 1 from public.usuarios_unidades uu where uu.user_id=v_user and uu.ativo and uu.unidade_id is null and uu.perfil='gestor_central')
 then raise exception 'Somente um ADM da unidade de destino pode confirmar o recebimento.'; end if;
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
 if not exists(select 1 from public.usuarios_unidades uu where uu.user_id=v_user and uu.ativo and uu.unidade_id=v_transfer.unidade_destino_id and uu.perfil in ('admin_unidade','gestor_central'))
 and not exists(select 1 from public.usuarios_unidades uu where uu.user_id=v_user and uu.ativo and uu.unidade_id is null and uu.perfil='gestor_central')
 then raise exception 'Somente um ADM da unidade de destino pode recusar o recebimento.'; end if;
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
