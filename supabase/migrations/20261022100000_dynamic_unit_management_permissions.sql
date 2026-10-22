-- Gestão dinâmica de unidades e permissões globais.
-- Esta migration pertence exclusivamente à branch de teste.
create or replace function public.usuario_e_gestor_central()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios_unidades uu
    where uu.user_id = auth.uid()
      and uu.perfil = 'gestor_central'
      and uu.ativo = true
      and uu.unidade_id is null
  );
$$;

revoke all on function public.usuario_e_gestor_central() from public;
grant execute on function public.usuario_e_gestor_central() to authenticated;

-- Remove somente a restrição que limitava os códigos a três unidades fixas.
do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.unidades'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%codigo%'
  loop
    execute format('alter table public.unidades drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.unidades
  add constraint unidades_codigo_formato_check
  check (codigo ~ '^[a-z0-9][a-z0-9_-]{0,49}$');

drop policy if exists "gestor_central_le_unidades" on public.unidades;
create policy "gestor_central_le_unidades"
on public.unidades for select to authenticated
using (public.usuario_e_gestor_central());

drop policy if exists "gestor_central_cria_unidades" on public.unidades;
create policy "gestor_central_cria_unidades"
on public.unidades for insert to authenticated
with check (public.usuario_e_gestor_central());

drop policy if exists "gestor_central_atualiza_unidades" on public.unidades;
create policy "gestor_central_atualiza_unidades"
on public.unidades for update to authenticated
using (public.usuario_e_gestor_central())
with check (public.usuario_e_gestor_central());

grant select, insert, update on public.unidades to authenticated;

-- Somente o gestor central pode atribuir perfis e unidades.
drop policy if exists "gestor_central_gerencia_vinculos_unidade" on public.usuarios_unidades;
create policy "gestor_central_gerencia_vinculos_unidade"
on public.usuarios_unidades for all to authenticated
using (public.usuario_e_gestor_central())
with check (
  public.usuario_e_gestor_central()
  and (
    (perfil = 'gestor_central' and unidade_id is null)
    or
    (perfil <> 'gestor_central' and unidade_id is not null
      and exists (select 1 from public.unidades u where u.id = unidade_id))
  )
);

grant select, insert, update, delete on public.usuarios_unidades to authenticated;
