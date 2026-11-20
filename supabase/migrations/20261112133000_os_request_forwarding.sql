-- Vincula solicitações a OS pendentes sem duplicar o registro original.
alter table public.ordens_servico
  add column if not exists numero_os_referencia text,
  add column if not exists os_vinculada_id uuid references public.ordens_servico(id) on delete set null;

create index if not exists ordens_servico_os_vinculada_id_idx
  on public.ordens_servico(os_vinculada_id);

create unique index if not exists ordens_servico_os_vinculada_id_unique
  on public.ordens_servico(os_vinculada_id)
  where os_vinculada_id is not null;

create or replace function public.encaminhar_solicitacao_os_existente(
  p_solicitacao_id uuid,
  p_os_id uuid
)
returns text
language plpgsql
security invoker
set search_path = public, auth
as $$
declare
  v_request public.ordens_servico%rowtype;
  v_existing public.ordens_servico%rowtype;
  v_actor uuid := auth.uid();
  v_email text := coalesce(auth.jwt() ->> 'email', '');
begin
  if v_actor is null or not public.has_role(v_actor, 'gestor') then
    raise exception 'Apenas gestor autorizado pode encaminhar solicitações de OS.';
  end if;

  select * into v_request
  from public.ordens_servico
  where id = p_solicitacao_id and solicitacao_os = true
  for update;

  if not found then
    raise exception 'Solicitação não encontrada ou já tratada.';
  end if;

  select * into v_existing
  from public.ordens_servico
  where id = p_os_id
    and frota = v_request.frota
    and status = 'pendente'
    and coalesce(solicitacao_os, false) = false
    and nullif(trim(numero_os), '') is not null
  for update;

  if not found then
    raise exception 'A OS selecionada não está mais pendente ou não corresponde à frota solicitada.';
  end if;

  update public.ordens_servico
  set tecnico_id = v_request.tecnico_id,
      tecnico_email = v_request.tecnico_email,
      tecnico_nome = v_request.tecnico_nome,
      updated_at = now()
  where id = v_existing.id;

  update public.ordens_servico
  set os_vinculada_id = v_existing.id,
      numero_os_referencia = v_existing.numero_os,
      status = 'cancelada',
      solicitacao_os = false,
      solicitacao_status = 'regularizada',
      regularizada_em = now(),
      regularizada_por_email = v_email,
      updated_at = now()
  where id = v_request.id;

  insert into public.historico_edicoes (os_id, acao, detalhe, usuario_id, usuario_email)
  values
    (v_request.id, 'os_existente_encaminhada',
      'OS ' || v_existing.numero_os || ' da frota ' || v_request.frota ||
      ' vinculada à solicitação e encaminhada para ' ||
      coalesce(v_request.tecnico_nome, v_request.tecnico_email, 'técnico') ||
      '. A OS original foi preservada.', v_actor, v_email),
    (v_existing.id, 'os_reaproveitada_encaminhada',
      'OS encaminhada ao técnico por meio da solicitação ' || v_request.id::text ||
      '. Número e dados originais preservados.', v_actor, v_email);

  return v_existing.numero_os;
end;
$$;

create or replace function public.encaminhar_solicitacao_numero_os(
  p_solicitacao_id uuid,
  p_numero_os text
)
returns text
language plpgsql
security invoker
set search_path = public, auth
as $$
declare
  v_request public.ordens_servico%rowtype;
  v_duplicate public.ordens_servico%rowtype;
  v_actor uuid := auth.uid();
  v_email text := coalesce(auth.jwt() ->> 'email', '');
  v_number text := trim(coalesce(p_numero_os, ''));
begin
  if v_actor is null or not public.has_role(v_actor, 'gestor') then
    raise exception 'Apenas gestor autorizado pode encaminhar solicitações de OS.';
  end if;

  if v_number = '' then
    raise exception 'Informe o número da OS.';
  end if;

  select * into v_request
  from public.ordens_servico
  where id = p_solicitacao_id and solicitacao_os = true
  for update;

  if not found then
    raise exception 'Solicitação não encontrada ou já tratada.';
  end if;

  select * into v_duplicate
  from public.ordens_servico
  where numero_os = v_number and id <> v_request.id
  limit 1;

  if found then
    if v_duplicate.frota = v_request.frota then
      raise exception 'Esse número já existe para esta frota. Selecione a OS pendente na opção de reaproveitamento.';
    else
      raise exception 'Esse número de OS já está cadastrado para outra frota. Confira o número antes de enviar.';
    end if;
  end if;

  update public.ordens_servico
  set numero_os = v_number,
      solicitacao_os = false,
      solicitacao_status = 'regularizada',
      regularizada_em = now(),
      regularizada_por_email = v_email,
      updated_at = now()
  where id = v_request.id;

  insert into public.historico_edicoes (os_id, acao, detalhe, usuario_id, usuario_email)
  values (
    v_request.id,
    'numero_os_informado',
    'O gestor informou somente o número ' || v_number ||
    ' e encaminhou a OS ao técnico, preservando os demais dados da solicitação.',
    v_actor,
    v_email
  );

  return v_number;
end;
$$;

grant execute on function public.encaminhar_solicitacao_os_existente(uuid, uuid) to authenticated;
grant execute on function public.encaminhar_solicitacao_numero_os(uuid, text) to authenticated;
