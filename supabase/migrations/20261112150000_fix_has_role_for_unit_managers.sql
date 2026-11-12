-- Reconhece gestores locais vinculados a uma unidade em verificações de papel.
-- O Gestor Central continua sendo o único perfil global.
create or replace function public.has_role(_role text, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select _user_id is not null
    and _user_id = auth.uid()
    and exists (
      select 1
      from public.usuarios_unidades uu
      where uu.user_id = auth.uid()
        and uu.ativo = true
        and uu.perfil = _role
        and (
          (_role = 'gestor_central' and uu.unidade_id is null)
          or (_role = 'gestor' and uu.unidade_id is not null)
          or (_role not in ('gestor', 'gestor_central') and uu.unidade_id is not null)
        )
    );
$$;

revoke all on function public.has_role(text, uuid) from public, anon;
grant execute on function public.has_role(text, uuid) to authenticated;

notify pgrst, 'reload schema';
