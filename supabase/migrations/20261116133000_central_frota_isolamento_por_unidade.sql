-- Central Frota: restringe o acesso operacional à unidade vinculada ao usuário.
-- O perfil gestor_central mantém a visão administrativa global; gestores locais ficam limitados à própria unidade.

create or replace function public.central_frota_tem_acesso(p_unidade_id uuid, p_gerenciar boolean default false)
returns boolean
language sql
stable
security invoker
set search_path = public, auth
as $$
  select
    exists (
      select 1
      from public.usuarios_unidades uu
      where uu.user_id = (select auth.uid())
        and uu.ativo = true
        and uu.perfil = 'gestor_central'
        and uu.unidade_id is null
    )
    or exists (
      select 1
      from public.usuarios_unidades uu
      where uu.user_id = (select auth.uid())
        and uu.ativo = true
        and uu.unidade_id = p_unidade_id
        and (
          not p_gerenciar
          or uu.perfil in ('gestor', 'admin_unidade')
        )
    );
$$;

revoke all on function public.central_frota_tem_acesso(uuid, boolean) from public, anon;
grant execute on function public.central_frota_tem_acesso(uuid, boolean) to authenticated;

-- Uma frota ou componente não pode ser transferido de unidade por edição.
create or replace function public.central_frota_impedir_troca_unidade()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.unidade_id is distinct from old.unidade_id then
    raise exception 'Não é permitido transferir registros entre unidades. Faça a movimentação pelo processo administrativo autorizado.';
  end if;
  if new.criado_por is distinct from old.criado_por then
    raise exception 'O usuário que criou o registro não pode ser alterado.';
  end if;
  return new;
end;
$$;

drop trigger if exists central_frota_frotas_unidade_imutavel on public.frotas;
create trigger central_frota_frotas_unidade_imutavel
before update on public.frotas
for each row execute function public.central_frota_impedir_troca_unidade();

drop trigger if exists central_frota_componentes_unidade_imutavel on public.componentes_frota;
create trigger central_frota_componentes_unidade_imutavel
before update on public.componentes_frota
for each row execute function public.central_frota_impedir_troca_unidade();

-- Reafirma políticas de leitura e gravação usando a verificação por unidade.
drop policy if exists central_frota_frotas_select on public.frotas;
create policy central_frota_frotas_select on public.frotas
for select to authenticated
using (public.central_frota_tem_acesso(unidade_id, false));

drop policy if exists central_frota_frotas_insert on public.frotas;
create policy central_frota_frotas_insert on public.frotas
for insert to authenticated
with check (criado_por = (select auth.uid()) and public.central_frota_tem_acesso(unidade_id, true));

drop policy if exists central_frota_frotas_update on public.frotas;
create policy central_frota_frotas_update on public.frotas
for update to authenticated
using (public.central_frota_tem_acesso(unidade_id, true))
with check (public.central_frota_tem_acesso(unidade_id, true));

drop policy if exists central_frota_componentes_select on public.componentes_frota;
create policy central_frota_componentes_select on public.componentes_frota
for select to authenticated
using (public.central_frota_tem_acesso(unidade_id, false));

drop policy if exists central_frota_componentes_insert on public.componentes_frota;
create policy central_frota_componentes_insert on public.componentes_frota
for insert to authenticated
with check (criado_por = (select auth.uid()) and public.central_frota_tem_acesso(unidade_id, true));

drop policy if exists central_frota_componentes_update on public.componentes_frota;
create policy central_frota_componentes_update on public.componentes_frota
for update to authenticated
using (public.central_frota_tem_acesso(unidade_id, true))
with check (public.central_frota_tem_acesso(unidade_id, true));

drop policy if exists central_frota_instalacoes_select on public.instalacoes_frota;
create policy central_frota_instalacoes_select on public.instalacoes_frota
for select to authenticated
using (public.central_frota_tem_acesso(unidade_id, false));

drop policy if exists central_frota_instalacoes_insert on public.instalacoes_frota;
create policy central_frota_instalacoes_insert on public.instalacoes_frota
for insert to authenticated
with check (
  instalado_por = (select auth.uid())
  and public.central_frota_tem_acesso(unidade_id, true)
  and exists (select 1 from public.frotas f where f.id = instalacoes_frota.frota_id and f.unidade_id = instalacoes_frota.unidade_id)
  and exists (select 1 from public.componentes_frota c where c.id = instalacoes_frota.componente_id and c.unidade_id = instalacoes_frota.unidade_id)
);

drop policy if exists central_frota_instalacoes_update on public.instalacoes_frota;
create policy central_frota_instalacoes_update on public.instalacoes_frota
for update to authenticated
using (public.central_frota_tem_acesso(unidade_id, true))
with check (public.central_frota_tem_acesso(unidade_id, true));
