-- Qualquer usuário ativo vinculado a uma unidade pode cadastrar e editar os ativos daquela unidade.
-- O parâmetro p_gerenciar é mantido por compatibilidade com as policies existentes.
create or replace function public.central_frota_tem_acesso(p_unidade_id uuid, p_gerenciar boolean default false)
returns boolean
language sql
stable
security invoker
set search_path = public, auth
as $$
  select
    exists (
      select 1 from public.usuarios_unidades uu
      where uu.user_id = (select auth.uid())
        and uu.ativo = true
        and uu.perfil = 'gestor_central'
        and uu.unidade_id is null
    )
    or exists (
      select 1 from public.usuarios_unidades uu
      where uu.user_id = (select auth.uid())
        and uu.ativo = true
        and uu.unidade_id = p_unidade_id
    );
$$;
revoke all on function public.central_frota_tem_acesso(uuid, boolean) from public, anon;
grant execute on function public.central_frota_tem_acesso(uuid, boolean) to authenticated;
