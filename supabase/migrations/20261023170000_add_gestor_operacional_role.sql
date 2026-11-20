-- Exclusivo do projeto Supabase de testes Central OS multiunidade.
-- Perfil Gestor: acesso operacional global, sem gestão de unidades, usuários ou estoque.
alter table public.usuarios_unidades
  drop constraint if exists usuarios_unidades_perfil_check,
  drop constraint if exists perfis_locais_com_unidade;

alter table public.usuarios_unidades
  add constraint usuarios_unidades_perfil_check
    check (perfil = any (array['admin_unidade','tecnico','gestor_central','gestor','visualizador']::text[])),
  add constraint perfis_locais_com_unidade
    check ((perfil in ('gestor_central','gestor')) or unidade_id is not null);

create or replace function public.usuario_e_gestor_operacional()
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
      and uu.ativo = true
      and uu.perfil in ('gestor','gestor_central')
      and uu.unidade_id is null
  );
$$;

revoke all on function public.usuario_e_gestor_operacional() from public;
grant execute on function public.usuario_e_gestor_operacional() to authenticated;

-- Gestor pode consultar nomes das unidades para filtros e identificação das OS,
-- mas não recebe INSERT/UPDATE/DELETE em unidades.
drop policy if exists gestor_operacional_le_unidades on public.unidades;
create policy gestor_operacional_le_unidades
on public.unidades for select to authenticated
using (public.usuario_e_gestor_operacional());

-- O Gestor vê OS de todas as unidades. As políticas de escrita abaixo não dão
-- acesso a usuários nem a gestão de unidades.
drop policy if exists os_leitura_por_unidade_e_perfil on public.ordens_servico;
create policy os_leitura_por_unidade_e_perfil
on public.ordens_servico for select to authenticated
using (
  exists (
    select 1 from public.usuarios_unidades uu
    where uu.user_id = auth.uid()
      and uu.ativo = true
      and (
        (uu.perfil in ('gestor','gestor_central') and uu.unidade_id is null)
        or (
          uu.unidade_id = ordens_servico.unidade_id
          and (
            uu.perfil in ('admin_unidade','visualizador')
            or (
              uu.perfil = 'tecnico'
              and (
                ordens_servico.tecnico_id = auth.uid()
                or lower(coalesce(ordens_servico.tecnico_email, '')) =
                   lower(coalesce(auth.jwt() ->> 'email', ''))
              )
            )
          )
        )
      )
  )
);

drop policy if exists gestor_operacional_cria_os_todas_unidades on public.ordens_servico;
create policy gestor_operacional_cria_os_todas_unidades
on public.ordens_servico for insert to authenticated
with check (
  exists (
    select 1 from public.usuarios_unidades uu
    where uu.user_id = auth.uid() and uu.ativo = true
      and uu.perfil = 'gestor' and uu.unidade_id is null
  )
);

drop policy if exists gestor_operacional_atualiza_os_todas_unidades on public.ordens_servico;
create policy gestor_operacional_atualiza_os_todas_unidades
on public.ordens_servico for update to authenticated
using (
  exists (
    select 1 from public.usuarios_unidades uu
    where uu.user_id = auth.uid() and uu.ativo = true
      and uu.perfil = 'gestor' and uu.unidade_id is null
  )
)
with check (
  exists (
    select 1 from public.usuarios_unidades uu
    where uu.user_id = auth.uid() and uu.ativo = true
      and uu.perfil = 'gestor' and uu.unidade_id is null
  )
);

drop policy if exists gestor_operacional_exclui_os_todas_unidades on public.ordens_servico;
create policy gestor_operacional_exclui_os_todas_unidades
on public.ordens_servico for delete to authenticated
using (
  exists (
    select 1 from public.usuarios_unidades uu
    where uu.user_id = auth.uid() and uu.ativo = true
      and uu.perfil = 'gestor' and uu.unidade_id is null
  )
);
