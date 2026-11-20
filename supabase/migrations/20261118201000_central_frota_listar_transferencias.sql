create or replace function public.central_frota_listar_transferencias()
returns table(id uuid,componente_id uuid,numero_serie text,tipo text,fabricante text,modelo text,unidade_origem_id uuid,unidade_origem_nome text,unidade_destino_id uuid,unidade_destino_nome text,status text,status_anterior text,enviada_por uuid,enviada_em timestamptz,recebida_por uuid,recebida_em timestamptz,recusada_por uuid,recusada_em timestamptz,motivo_recusa text,observacoes text)
language sql stable security definer set search_path='' as $$
 select t.id,t.componente_id,c.numero_serie,c.tipo,c.fabricante,c.modelo,t.unidade_origem_id,uo.nome,t.unidade_destino_id,ud.nome,t.status,t.status_anterior,t.enviada_por,t.enviada_em,t.recebida_por,t.recebida_em,t.recusada_por,t.recusada_em,t.motivo_recusa,t.observacoes
 from public.transferencias_componentes_frota t join public.componentes_frota c on c.id=t.componente_id
 join public.unidades uo on uo.id=t.unidade_origem_id join public.unidades ud on ud.id=t.unidade_destino_id
 where auth.uid() is not null and (
 exists(select 1 from public.usuarios_unidades uu where uu.user_id=auth.uid() and uu.ativo and uu.perfil='gestor_central' and uu.unidade_id is null)
 or exists(select 1 from public.usuarios_unidades uu where uu.user_id=auth.uid() and uu.ativo and uu.unidade_id in(t.unidade_origem_id,t.unidade_destino_id)))
 order by t.enviada_em desc;
$$;
revoke all on function public.central_frota_listar_transferencias() from public,anon;
grant execute on function public.central_frota_listar_transferencias() to authenticated;