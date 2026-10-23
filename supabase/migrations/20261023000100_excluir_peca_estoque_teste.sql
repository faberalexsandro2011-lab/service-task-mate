create or replace function public.excluir_peca_estoque_teste(p_peca_id uuid, p_confirmacao text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_peca public.pecas_catalogo%rowtype;
  v_movimentacoes integer := 0;
  v_movimentacoes_com_os integer := 0;
begin
  if v_user_id is null or v_email <> 'faber.alexsandro2011@gmail.com' then
    raise exception 'Apenas a conta principal do Gestor Geral pode excluir peças no ambiente de teste.';
  end if;

  if not exists (
    select 1 from public.usuarios_unidades uu
    where uu.user_id = v_user_id
      and uu.perfil = 'gestor_central'
      and uu.ativo = true
  ) then
    raise exception 'O perfil Gestor Geral ativo não foi encontrado para esta conta no ambiente de teste.';
  end if;

  select * into v_peca
  from public.pecas_catalogo
  where id = p_peca_id
  for update;

  if not found then
    raise exception 'A peça não existe ou já foi removida.';
  end if;

  if coalesce(p_confirmacao, '') <> v_peca.nome then
    raise exception 'Confirmação cancelada: o nome digitado não corresponde exatamente ao nome da peça.';
  end if;

  select count(*), count(*) filter (where os_id is not null)
    into v_movimentacoes, v_movimentacoes_com_os
  from public.estoque_movimentacoes
  where peca_id = p_peca_id;

  if v_movimentacoes_com_os > 0 then
    raise exception 'Esta peça possui movimentações vinculadas a ordens de serviço. O histórico não será apagado; regularize essas referências antes de excluir a peça.';
  end if;

  delete from public.estoque_movimentacoes
  where peca_id = p_peca_id and os_id is null;

  delete from public.pecas_catalogo
  where id = p_peca_id;

  return jsonb_build_object(
    'deleted', true,
    'peca', v_peca.nome,
    'movimentacoes_removidas', v_movimentacoes
  );
end;
$$;

revoke all on function public.excluir_peca_estoque_teste(uuid, text) from public;
grant execute on function public.excluir_peca_estoque_teste(uuid, text) to authenticated;
