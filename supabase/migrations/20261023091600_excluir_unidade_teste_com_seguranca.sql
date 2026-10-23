-- Exclusão definitiva de unidade vazia, restrita à conta principal no ambiente de teste.
-- Não remove OS, vínculos de usuários nem itens de estoque: se houver dependências, bloqueia.
create or replace function public.excluir_unidade_teste(p_unidade_id uuid, p_confirmacao text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unidade public.unidades%rowtype;
  v_os bigint := 0;
  v_usuarios bigint := 0;
  v_pecas bigint := 0;
begin
  if lower(coalesce(auth.jwt() ->> 'email', '')) <> 'faber.alexsandro2011@gmail.com' then
    raise exception 'Ação permitida somente à conta principal autorizada.';
  end if;
  if not public.usuario_e_gestor_central() then
    raise exception 'É necessário ter o perfil Gestor Geral ativo no ambiente de teste.';
  end if;
  select * into v_unidade from public.unidades where id = p_unidade_id for update;
  if not found then raise exception 'Unidade não encontrada.'; end if;
  if p_confirmacao is distinct from v_unidade.nome then
    raise exception 'Confirmação não corresponde exatamente ao nome da unidade.';
  end if;

  select count(*) into v_os from public.ordens_servico where unidade_id = p_unidade_id;
  select count(*) into v_usuarios from public.usuarios_unidades where unidade_id = p_unidade_id;
  select count(*) into v_pecas from public.pecas_catalogo where unidade_id = p_unidade_id;

  if v_os > 0 or v_usuarios > 0 or v_pecas > 0 then
    return jsonb_build_object('deleted', false, 'unidade', v_unidade.nome,
      'ordens_servico', v_os, 'usuarios_vinculados', v_usuarios, 'pecas_catalogo', v_pecas,
      'message', 'Exclusão bloqueada: existem registros vinculados. Nenhum dado foi apagado.');
  end if;

  begin
    delete from public.unidades where id = p_unidade_id;
  exception when foreign_key_violation then
    return jsonb_build_object('deleted', false, 'unidade', v_unidade.nome,
      'ordens_servico', v_os, 'usuarios_vinculados', v_usuarios, 'pecas_catalogo', v_pecas,
      'message', 'Exclusão bloqueada: há outros registros vinculados. Nenhum dado foi apagado.');
  end;
  return jsonb_build_object('deleted', true, 'unidade', v_unidade.nome,
    'ordens_servico', v_os, 'usuarios_vinculados', v_usuarios, 'pecas_catalogo', v_pecas,
    'message', 'Unidade vazia excluída do ambiente de teste.');
end;
$$;

revoke all on function public.excluir_unidade_teste(uuid, text) from public, anon;
grant execute on function public.excluir_unidade_teste(uuid, text) to authenticated;
