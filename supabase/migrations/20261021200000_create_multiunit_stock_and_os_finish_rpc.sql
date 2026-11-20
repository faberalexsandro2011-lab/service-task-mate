-- Estoque multiunidade do Central OS: somente ambiente de teste.
create table if not exists public.pecas_catalogo (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades(id) on delete cascade,
  nome text not null,
  ativo boolean not null default true,
  estoque_atual integer not null default 0 check (estoque_atual >= 0),
  estoque_minimo integer not null default 0 check (estoque_minimo >= 0),
  criado_por_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unidade_id, nome)
);
create table if not exists public.estoque_movimentacoes (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades(id) on delete cascade,
  peca_id uuid not null references public.pecas_catalogo(id) on delete restrict,
  os_id uuid references public.ordens_servico(id) on delete set null,
  tipo text not null check (tipo in ('entrada','consumo_os','ajuste')),
  quantidade integer not null check (quantidade > 0),
  saldo_anterior integer not null check (saldo_anterior >= 0),
  saldo_posterior integer not null check (saldo_posterior >= 0),
  observacao text,
  usuario_id uuid references auth.users(id) on delete set null,
  usuario_email text,
  created_at timestamptz not null default now()
);
create index if not exists estoque_pecas_unidade_nome_idx on public.pecas_catalogo(unidade_id, nome);
create index if not exists estoque_movimentacoes_unidade_data_idx on public.estoque_movimentacoes(unidade_id, created_at desc);
create index if not exists estoque_movimentacoes_peca_data_idx on public.estoque_movimentacoes(peca_id, created_at desc);
alter table public.pecas_catalogo enable row level security;
alter table public.estoque_movimentacoes enable row level security;
drop policy if exists estoque_pecas_leitura_por_unidade on public.pecas_catalogo;
create policy estoque_pecas_leitura_por_unidade on public.pecas_catalogo for select to authenticated using (
 exists (select 1 from public.usuarios_unidades uu where uu.user_id=auth.uid() and uu.ativo=true and (uu.perfil='gestor_central' or uu.unidade_id=pecas_catalogo.unidade_id))
);
drop policy if exists estoque_pecas_admin_gerencia_unidade on public.pecas_catalogo;
create policy estoque_pecas_admin_gerencia_unidade on public.pecas_catalogo for all to authenticated using (
 exists (select 1 from public.usuarios_unidades uu where uu.user_id=auth.uid() and uu.ativo=true and (uu.perfil='gestor_central' or (uu.perfil='admin_unidade' and uu.unidade_id=pecas_catalogo.unidade_id)))
) with check (
 exists (select 1 from public.usuarios_unidades uu where uu.user_id=auth.uid() and uu.ativo=true and (uu.perfil='gestor_central' or (uu.perfil='admin_unidade' and uu.unidade_id=pecas_catalogo.unidade_id)))
);
drop policy if exists estoque_movimentacoes_leitura_por_unidade on public.estoque_movimentacoes;
create policy estoque_movimentacoes_leitura_por_unidade on public.estoque_movimentacoes for select to authenticated using (
 exists (select 1 from public.usuarios_unidades uu where uu.user_id=auth.uid() and uu.ativo=true and (uu.perfil='gestor_central' or uu.unidade_id=estoque_movimentacoes.unidade_id))
);
grant select, insert, update, delete on public.pecas_catalogo to authenticated;
grant select on public.estoque_movimentacoes to authenticated;
create or replace function public.finalizar_os_com_estoque(p_os_id uuid,p_notas text,p_pecas jsonb,p_classe_manutencao text default null)
returns void language plpgsql security definer set search_path=public as $$
declare
 v_os public.ordens_servico%rowtype; v_perfil public.usuarios_unidades%rowtype; v_item jsonb;
 v_peca_id uuid; v_nome text; v_qtd integer; v_saldo integer; v_resumo text:=''; v_now timestamptz:=now();
begin
 select * into v_os from public.ordens_servico where id=p_os_id for update;
 if not found then raise exception 'OS não encontrada.'; end if;
 if v_os.status<>'em_andamento' then raise exception 'A OS precisa estar em andamento para ser finalizada.'; end if;
 select * into v_perfil from public.usuarios_unidades where user_id=auth.uid() and ativo=true
 and (perfil='gestor_central' or (unidade_id=v_os.unidade_id and perfil in ('tecnico','admin_unidade'))) limit 1;
 if not found then raise exception 'Você não tem permissão para finalizar esta OS.'; end if;
 if v_perfil.perfil='tecnico' and v_os.tecnico_id is distinct from auth.uid()
 and lower(coalesce(v_os.tecnico_email,''))<>lower(coalesce(auth.jwt()->>'email','')) then
 raise exception 'Esta OS não está atribuída ao seu usuário.'; end if;
 if p_pecas is not null and jsonb_typeof(p_pecas)<>'array' then raise exception 'A lista de peças está em formato inválido.'; end if;
 for v_item in select value from jsonb_array_elements(coalesce(p_pecas,'[]'::jsonb)) loop
  v_peca_id:=nullif(v_item->>'id','')::uuid; v_nome:=nullif(trim(v_item->>'nome'),'');
  v_qtd:=coalesce(nullif(v_item->>'quantidade','')::integer,1);
  if v_qtd<=0 then raise exception 'A quantidade de cada peça deve ser maior que zero.'; end if;
  if v_peca_id is null then select id into v_peca_id from public.pecas_catalogo where unidade_id=v_os.unidade_id and lower(trim(nome))=lower(trim(coalesce(v_nome,''))) and ativo=true limit 1; end if;
  if v_peca_id is null then raise exception 'Uma das peças não está cadastrada no estoque desta unidade.'; end if;
  select estoque_atual,nome into v_saldo,v_nome from public.pecas_catalogo where id=v_peca_id and unidade_id=v_os.unidade_id and ativo=true for update;
  if not found then raise exception 'Peça não encontrada no estoque desta unidade.'; end if;
  if v_saldo<v_qtd then raise exception 'Estoque insuficiente para "%": disponível %, solicitado %.',v_nome,v_saldo,v_qtd; end if;
  update public.pecas_catalogo set estoque_atual=estoque_atual-v_qtd,updated_at=v_now where id=v_peca_id;
  insert into public.estoque_movimentacoes(unidade_id,peca_id,os_id,tipo,quantidade,saldo_anterior,saldo_posterior,observacao,usuario_id,usuario_email)
  values(v_os.unidade_id,v_peca_id,v_os.id,'consumo_os',v_qtd,v_saldo,v_saldo-v_qtd,'Consumo na OS '||coalesce(v_os.numero_os,'sem número'),auth.uid(),auth.jwt()->>'email');
  v_resumo:=v_resumo||case when v_resumo='' then '' else E'\n' end||v_nome||' x'||v_qtd;
 end loop;
 update public.ordens_servico set status='concluida',notas_fecho=p_notas,
 classe_manutencao=coalesce(nullif(trim(p_classe_manutencao),''),classe_manutencao),
 pecas_utilizadas=nullif(v_resumo,''),concluida_em=v_now,updated_at=v_now where id=v_os.id;
end; $$;
revoke all on function public.finalizar_os_com_estoque(uuid,text,jsonb,text) from public,anon;
grant execute on function public.finalizar_os_com_estoque(uuid,text,jsonb,text) to authenticated;
notify pgrst,'reload schema';