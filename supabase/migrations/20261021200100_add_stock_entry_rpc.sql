create or replace function public.registrar_entrada_estoque(p_peca_id uuid, p_quantidade integer, p_observacao text default null)
returns integer language plpgsql security definer set search_path=public as $$
declare v_peca public.pecas_catalogo%rowtype; v_perfil public.usuarios_unidades%rowtype; v_saldo integer;
begin
 if p_quantidade is null or p_quantidade<=0 then raise exception 'Informe uma quantidade maior que zero.'; end if;
 select * into v_peca from public.pecas_catalogo where id=p_peca_id for update;
 if not found then raise exception 'Peça não encontrada.'; end if;
 select * into v_perfil from public.usuarios_unidades where user_id=auth.uid() and ativo=true
 and (perfil='gestor_central' or (perfil='admin_unidade' and unidade_id=v_peca.unidade_id)) limit 1;
 if not found then raise exception 'Somente o ADM da unidade ou Gestor Geral pode registrar entrada no estoque.'; end if;
 v_saldo:=v_peca.estoque_atual;
 update public.pecas_catalogo set estoque_atual=estoque_atual+p_quantidade,updated_at=now() where id=p_peca_id returning estoque_atual into v_saldo;
 insert into public.estoque_movimentacoes(unidade_id,peca_id,tipo,quantidade,saldo_anterior,saldo_posterior,observacao,usuario_id,usuario_email)
 values(v_peca.unidade_id,p_peca_id,'entrada',p_quantidade,v_peca.estoque_atual,v_saldo,nullif(trim(p_observacao),''),auth.uid(),auth.jwt()->>'email');
 return v_saldo;
end; $$;
revoke all on function public.registrar_entrada_estoque(uuid,integer,text) from public,anon;
grant execute on function public.registrar_entrada_estoque(uuid,integer,text) to authenticated;
notify pgrst,'reload schema';