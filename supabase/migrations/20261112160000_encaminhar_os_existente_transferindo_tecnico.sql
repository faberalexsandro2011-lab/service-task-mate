-- Reaproveita uma OS pendente existente e transfere o técnico de forma atômica.
-- A solicitação provisória recebe apenas uma referência ao número, sem duplicar numero_os.
alter table public.ordens_servico
  add column if not exists numero_os_referencia text;

create or replace function public.encaminhar_solicitacao_os_existente(
  p_solicitacao_id uuid,
  p_os_id uuid,
  p_tecnico_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_request public.ordens_servico%rowtype;
  v_existing public.ordens_servico%rowtype;
  v_technician public.profiles%rowtype;
begin
  if v_actor is null then
    raise exception 'Usuário não autenticado';
  end if;

  if not (
    public.has_role(v_actor, 'gestor'::public.app_role)
    or public.has_role(v_actor, 'gestor_os'::public.app_role)
  ) then
    raise exception 'Somente gestores podem encaminhar solicitações de OS';
  end if;

  select * into v_request
  from public.ordens_servico
  where id = p_solicitacao_id
  for update;

  if not found or coalesce(v_request.solicitacao_os, false) is not true
     or v_request.solicitacao_status <> 'aguardando_os' then
    raise exception 'A solicitação não está mais aguardando atendimento';
  end if;

  select * into v_existing
  from public.ordens_servico
  where id = p_os_id
  for update;

  if not found then
    raise exception 'OS existente não encontrada';
  end if;

  if v_existing.status <> 'pendente' then
    raise exception 'Somente uma OS pendente pode ser transferida';
  end if;

  if lower(trim(coalesce(v_existing.frota, ''))) <> lower(trim(coalesce(v_request.frota, ''))) then
    raise exception 'A OS existente pertence a outra frota';
  end if;

  if nullif(trim(coalesce(v_existing.numero_os, '')), '') is null then
    raise exception 'A OS existente ainda não possui número';
  end if;

  select * into v_technician
  from public.profiles
  where id = p_tecnico_id;

  if not found then
    raise exception 'Técnico de destino não encontrado';
  end if;

  if not public.has_role(p_tecnico_id, 'tecnico'::public.app_role) then
    raise exception 'O usuário selecionado não possui perfil de técnico';
  end if;

  update public.ordens_servico
  set tecnico_id = v_technician.id,
      tecnico_email = v_technician.email,
      tecnico_nome = v_technician.nome,
      updated_at = now()
  where id = v_existing.id;

  update public.ordens_servico
  set solicitacao_os = false,
      solicitacao_status = 'regularizada',
      numero_os_referencia = v_existing.numero_os,
      regularizada_em = now(),
      regularizada_por_email = v_email,
      updated_at = now()
  where id = v_request.id;

  insert into public.historico_edicoes (
    os_id, acao, detalhe, usuario_id, usuario_email
  ) values
  (
    v_existing.id,
    'transferencia_tecnico',
    'OS ' || v_existing.numero_os || ' transferida de ' ||
      coalesce(v_existing.tecnico_nome, v_existing.tecnico_email, 'técnico não identificado') ||
      ' para ' || coalesce(v_technician.nome, v_technician.email) ||
      ' após solicitação da frota ' || v_request.frota || '.',
    v_actor,
    v_email
  ),
  (
    v_request.id,
    'regularizada',
    'Solicitação atendida com a OS existente ' || v_existing.numero_os ||
      '; técnico responsável transferido para ' ||
      coalesce(v_technician.nome, v_technician.email) || '.',
    v_actor,
    v_email
  );

  return v_existing.numero_os;
end;
$$;

revoke all on function public.encaminhar_solicitacao_os_existente(uuid, uuid, uuid) from public;
grant execute on function public.encaminhar_solicitacao_os_existente(uuid, uuid, uuid) to authenticated;
