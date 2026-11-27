-- Central Frota: permissões administrativas exclusivas, edição de histórico e auditoria.
-- Escopo limitado às tabelas do módulo Central Frota; não altera políticas do Central OS.

create or replace function public.central_frota_e_admin()
returns boolean
language sql
stable
security invoker
set search_path = public, auth
as $$
  select (select auth.uid()) = '053fa1b6-f9ab-42b2-a726-ed5849170258'::uuid;
$$;

revoke all on function public.central_frota_e_admin() from public, anon;
grant execute on function public.central_frota_e_admin() to authenticated;

create table if not exists public.central_frota_auditoria (
  id uuid primary key default gen_random_uuid(),
  tabela text not null,
  registro_id uuid not null,
  acao text not null check (acao in ('UPDATE', 'DELETE')),
  dados_anteriores jsonb,
  dados_novos jsonb,
  usuario_id uuid references auth.users(id) on delete set null,
  usuario_email text,
  ocorrido_em timestamptz not null default now()
);

create index if not exists central_frota_auditoria_data_idx
  on public.central_frota_auditoria (ocorrido_em desc);
create index if not exists central_frota_auditoria_registro_idx
  on public.central_frota_auditoria (tabela, registro_id, ocorrido_em desc);

alter table public.central_frota_auditoria enable row level security;
revoke all on public.central_frota_auditoria from public, anon;
grant select on public.central_frota_auditoria to authenticated;
drop policy if exists central_frota_auditoria_admin_select on public.central_frota_auditoria;
create policy central_frota_auditoria_admin_select
  on public.central_frota_auditoria
  for select to authenticated
  using (public.central_frota_e_admin());

create or replace function public.central_frota_gravar_auditoria_admin()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  insert into public.central_frota_auditoria (
    tabela, registro_id, acao, dados_anteriores, dados_novos,
    usuario_id, usuario_email, ocorrido_em
  )
  values (
    tg_table_name,
    case when tg_op = 'DELETE' then old.id else new.id end,
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op = 'UPDATE' then to_jsonb(new) else null end,
    auth.uid(),
    coalesce(auth.jwt() ->> 'email', ''),
    now()
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.central_frota_gravar_auditoria_admin() from public, anon, authenticated;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'frotas',
    'componentes_frota',
    'instalacoes_frota',
    'movimentacoes_componentes_frota',
    'transferencias_componentes_frota'
  ] loop
    execute format('drop trigger if exists central_frota_admin_auditoria on public.%I', v_table);
    execute format(
      'create trigger central_frota_admin_auditoria after update or delete on public.%I for each row execute function public.central_frota_gravar_auditoria_admin()',
      v_table
    );
  end loop;
end;
$$;

-- A exclusão e a edição adicional ficam restritas à conta administradora principal.
grant update, delete on public.frotas, public.componentes_frota,
  public.instalacoes_frota, public.movimentacoes_componentes_frota,
  public.transferencias_componentes_frota to authenticated;

drop policy if exists central_frota_admin_frotas_delete on public.frotas;
create policy central_frota_admin_frotas_delete on public.frotas
  for delete to authenticated using (public.central_frota_e_admin());

drop policy if exists central_frota_admin_componentes_delete on public.componentes_frota;
create policy central_frota_admin_componentes_delete on public.componentes_frota
  for delete to authenticated using (public.central_frota_e_admin());

drop policy if exists central_frota_admin_instalacoes_delete on public.instalacoes_frota;
create policy central_frota_admin_instalacoes_delete on public.instalacoes_frota
  for delete to authenticated using (public.central_frota_e_admin());

drop policy if exists central_frota_admin_movimentacoes_update on public.movimentacoes_componentes_frota;
create policy central_frota_admin_movimentacoes_update on public.movimentacoes_componentes_frota
  for update to authenticated
  using (public.central_frota_e_admin())
  with check (public.central_frota_e_admin());

drop policy if exists central_frota_admin_movimentacoes_delete on public.movimentacoes_componentes_frota;
create policy central_frota_admin_movimentacoes_delete on public.movimentacoes_componentes_frota
  for delete to authenticated using (public.central_frota_e_admin());

drop policy if exists central_frota_admin_transferencias_update on public.transferencias_componentes_frota;
create policy central_frota_admin_transferencias_update on public.transferencias_componentes_frota
  for update to authenticated
  using (public.central_frota_e_admin())
  with check (public.central_frota_e_admin());

drop policy if exists central_frota_admin_transferencias_delete on public.transferencias_componentes_frota;
create policy central_frota_admin_transferencias_delete on public.transferencias_componentes_frota
  for delete to authenticated using (public.central_frota_e_admin());

-- Permite que o administrador corrija os campos descritivos da retirada sem
-- alterar a identidade da instalação nem o responsável original.
create or replace function public.central_frota_auditar_instalacao()
returns trigger
language plpgsql
set search_path = public, auth
as $$
begin
  if tg_op = 'INSERT' then
    new.instalado_em := now();
    new.instalado_por := auth.uid();
    new.instalado_por_email := coalesce(auth.jwt() ->> 'email', '');
    select coalesce(
      nullif(trim(auth.jwt() -> 'user_metadata' ->> 'nome'), ''),
      nullif(trim(auth.jwt() -> 'user_metadata' ->> 'full_name'), ''),
      nullif(split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1), '')
    ) into new.instalado_por_nome;

    if new.instalado_por is null then
      raise exception 'É necessário estar autenticado para registrar uma instalação.';
    end if;
    if not exists (
      select 1 from public.frotas f
      where f.id = new.frota_id and f.unidade_id = new.unidade_id
    ) or not exists (
      select 1 from public.componentes_frota c
      where c.id = new.componente_id and c.unidade_id = new.unidade_id and c.status = 'disponivel'
    ) then
      raise exception 'Frota ou componente indisponível ou pertencente a outra unidade.';
    end if;
    return new;
  end if;

  if public.central_frota_e_admin() then
    if new.id is distinct from old.id
      or new.unidade_id is distinct from old.unidade_id
      or new.frota_id is distinct from old.frota_id
      or new.componente_id is distinct from old.componente_id
      or new.instalado_em is distinct from old.instalado_em
      or new.instalado_por is distinct from old.instalado_por
      or new.instalado_por_email is distinct from old.instalado_por_email
      or new.instalado_por_nome is distinct from old.instalado_por_nome
      or new.created_at is distinct from old.created_at then
      raise exception 'Os vínculos e dados originais da instalação não podem ser alterados.';
    end if;
    if new.retirado_em is distinct from old.retirado_em and new.retirado_em is not null then
      new.retirado_por := auth.uid();
      new.retirado_por_email := coalesce(auth.jwt() ->> 'email', '');
      select coalesce(
        nullif(trim(auth.jwt() -> 'user_metadata' ->> 'nome'), ''),
        nullif(trim(auth.jwt() -> 'user_metadata' ->> 'full_name'), ''),
        nullif(split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1), '')
      ) into new.retirado_por_nome;
    end if;
    return new;
  end if;

  if old.retirado_em is not null then
    raise exception 'O histórico de instalação já foi encerrado e não pode ser alterado.';
  end if;
  if new.frota_id <> old.frota_id
    or new.componente_id <> old.componente_id
    or new.unidade_id <> old.unidade_id
    or new.instalado_em <> old.instalado_em
    or new.instalado_por <> old.instalado_por
    or new.instalado_por_email is distinct from old.instalado_por_email
    or new.instalado_por_nome is distinct from old.instalado_por_nome then
    raise exception 'Os dados originais da instalação são imutáveis.';
  end if;
  if new.retirado_em is not null then
    new.retirado_em := now();
    new.retirado_por := auth.uid();
    new.retirado_por_email := coalesce(auth.jwt() ->> 'email', '');
    select coalesce(
      nullif(trim(auth.jwt() -> 'user_metadata' ->> 'nome'), ''),
      nullif(trim(auth.jwt() -> 'user_metadata' ->> 'full_name'), ''),
      nullif(split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1), '')
    ) into new.retirado_por_nome;
    if new.retirado_por is null then
      raise exception 'É necessário estar autenticado para registrar uma retirada.';
    end if;
    if nullif(trim(coalesce(new.motivo_retirada, '')), '') is null then
      raise exception 'Informe o motivo da retirada.';
    end if;
    if new.status_apos_retirada is null then
      new.status_apos_retirada := 'disponivel';
    end if;
  else
    raise exception 'Só é permitido encerrar uma instalação; não é permitido editar o histórico.';
  end if;
  return new;
end;
$$;

-- Remove a trava antiga de exclusão; o RLS continua bloqueando qualquer
-- exclusão que não seja feita pela conta administradora.
drop trigger if exists central_frota_proteger_historico on public.instalacoes_frota;

-- Mantém o status do componente coerente ao apagar ou corrigir um registro de instalação.
create or replace function public.central_frota_sincronizar_status_componente()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_localizacao text;
  v_status text;
  v_componente_id uuid;
begin
  if tg_op = 'DELETE' then
    v_componente_id := old.componente_id;
    v_status := coalesce(old.status_apos_retirada, 'disponivel');
    if not exists (
      select 1 from public.instalacoes_frota i
      where i.componente_id = v_componente_id and i.retirado_em is null
    ) then
      update public.componentes_frota
      set status = v_status,
          localizacao_estoque = case when v_status = 'disponivel' then 'Estoque geral' else 'Fora do estoque' end
      where id = v_componente_id and status = 'instalado';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    update public.componentes_frota
    set status = 'instalado', localizacao_estoque = null
    where id = new.componente_id;
  elsif tg_op = 'UPDATE' and old.retirado_em is null and new.retirado_em is not null then
    v_localizacao := case
      when coalesce(new.status_apos_retirada, 'disponivel') = 'disponivel'
        then 'Estoque geral'
      else 'Fora do estoque'
    end;
    update public.componentes_frota
    set status = coalesce(new.status_apos_retirada, 'disponivel'),
        localizacao_estoque = v_localizacao
    where id = new.componente_id;
  elsif tg_op = 'UPDATE'
    and old.retirado_em is not null
    and new.status_apos_retirada is distinct from old.status_apos_retirada
    and not exists (
      select 1 from public.instalacoes_frota i
      where i.componente_id = new.componente_id and i.retirado_em is null
    ) then
    v_status := coalesce(new.status_apos_retirada, 'disponivel');
    update public.componentes_frota
    set status = v_status,
        localizacao_estoque = case when v_status = 'disponivel' then 'Estoque geral' else 'Fora do estoque' end
    where id = new.componente_id and status = coalesce(old.status_apos_retirada, 'disponivel');
  end if;
  return new;
end;
$$;
