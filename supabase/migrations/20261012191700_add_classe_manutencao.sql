alter table public.ordens_servico
  add column if not exists classe_manutencao text;

alter table public.ordens_servico
  drop constraint if exists ordens_servico_classe_manutencao_check;

alter table public.ordens_servico
  add constraint ordens_servico_classe_manutencao_check
  check (classe_manutencao is null or classe_manutencao in (
    'GPS', 'SOLINFTEC', 'RÁDIO', 'RASTREADOR', 'AUTM. IRR', 'AUTM. PLANT'
  ));

create or replace function public.finalizar_os_com_estoque(
  p_os_id uuid,
  p_notas text,
  p_pecas jsonb,
  p_classe_manutencao text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_role public.app_role;
  v_order public.ordens_servico%rowtype;
  v_item jsonb;
  v_piece_id uuid;
  v_qty integer;
  v_piece_name text;
  v_stock integer;
  v_names text[] := '{}';
  v_finished_at timestamptz := now();
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado';
  end if;

  if p_classe_manutencao is null or p_classe_manutencao not in (
    'GPS', 'SOLINFTEC', 'RÁDIO', 'RASTREADOR', 'AUTM. IRR', 'AUTM. PLANT'
  ) then
    raise exception 'Selecione uma classe de manutenção válida';
  end if;

  select role into v_role
  from public.user_roles
  where user_id = v_user_id
  limit 1;

  if v_role is null or v_role not in ('tecnico', 'gestor') then
    raise exception 'Usuário sem permissão para finalizar OS';
  end if;

  select * into v_order
  from public.ordens_servico
  where id = p_os_id
  for update;

  if not found then
    raise exception 'OS não encontrada';
  end if;

  if v_order.status <> 'em_andamento' then
    raise exception 'A OS não está em andamento';
  end if;

  if not (v_order.tecnico_id = v_user_id or lower(trim(coalesce(v_order.tecnico_email, ''))) = v_email) then
    raise exception 'Esta OS não pertence ao usuário';
  end if;

  if nullif(trim(coalesce(v_order.numero_os, '')), '') is null then
    raise exception 'A OS ainda não possui número';
  end if;

  if nullif(trim(coalesce(p_notas, '')), '') is null then
    raise exception 'Informe o serviço realizado';
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_pecas, '[]'::jsonb))
  loop
    v_piece_id := nullif(v_item->>'id', '')::uuid;
    v_qty := coalesce((v_item->>'quantidade')::integer, 1);

    if v_piece_id is null or v_qty < 1 then
      raise exception 'Peça ou quantidade inválida';
    end if;

    select nome, estoque_atual
      into v_piece_name, v_stock
    from public.pecas_catalogo
    where id = v_piece_id
      and ativo = true
    for update;

    if not found then
      raise exception 'Peça não encontrada ou inativa';
    end if;

    if v_stock < v_qty then
      raise exception 'Estoque insuficiente para "%": disponível %, solicitado %', v_piece_name, v_stock, v_qty;
    end if;

    update public.pecas_catalogo
    set estoque_atual = estoque_atual - v_qty,
        updated_at = now()
    where id = v_piece_id;

    v_names := array_append(v_names, v_piece_name || ' x' || v_qty);
  end loop;

  update public.ordens_servico
  set status = 'concluida',
      notas_fecho = trim(p_notas),
      classe_manutencao = p_classe_manutencao,
      pecas_utilizadas = case when cardinality(v_names) > 0 then array_to_string(v_names, E'\\n') else null end,
      concluida_em = v_finished_at,
      updated_at = v_finished_at
  where id = p_os_id;

  insert into public.historico_edicoes (
    os_id, acao, detalhe, usuario_id, usuario_email
  ) values (
    p_os_id,
    'finalizada',
    'Finalizada por ' || v_email || ' (' || p_classe_manutencao || '): ' || trim(p_notas),
    v_user_id,
    v_email
  );

  return jsonb_build_object(
    'ok', true,
    'os_id', p_os_id,
    'concluida_em', v_finished_at,
    'classe_manutencao', p_classe_manutencao,
    'pecas', to_jsonb(v_names)
  );
end;
$function$;

revoke all on function public.finalizar_os_com_estoque(uuid, text, jsonb, text) from public;
grant execute on function public.finalizar_os_com_estoque(uuid, text, jsonb, text) to authenticated;
