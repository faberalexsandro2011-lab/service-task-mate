-- Gestores normais: consulta global, escrita de OS e estoque restritos à unidade cadastrada.
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
      and (
        uu.perfil = 'gestor_central'
        or (uu.perfil = 'gestor' and uu.unidade_id is not null)
      )
  );
$$;

revoke all on function public.usuario_e_gestor_operacional() from public, anon;
grant execute on function public.usuario_e_gestor_operacional() to authenticated;

drop policy if exists os_leitura_por_unidade_e_perfil on public.ordens_servico;
create policy os_leitura_por_unidade_e_perfil
on public.ordens_servico for select to authenticated
using (
  exists (
    select 1 from public.usuarios_unidades uu
    where uu.user_id = auth.uid()
      and uu.ativo = true
      and (
        uu.perfil in ('gestor_central', 'gestor')
        or (
          uu.unidade_id = ordens_servico.unidade_id
          and (
            uu.perfil in ('admin_unidade', 'visualizador')
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
    where uu.user_id = auth.uid()
      and uu.ativo = true
      and uu.perfil = 'gestor'
      and uu.unidade_id is not null
      and uu.unidade_id = ordens_servico.unidade_id
  )
);

drop policy if exists gestor_operacional_atualiza_os_todas_unidades on public.ordens_servico;
create policy gestor_operacional_atualiza_os_todas_unidades
on public.ordens_servico for update to authenticated
using (
  exists (
    select 1 from public.usuarios_unidades uu
    where uu.user_id = auth.uid()
      and uu.ativo = true
      and uu.perfil = 'gestor'
      and uu.unidade_id is not null
      and uu.unidade_id = ordens_servico.unidade_id
  )
)
with check (
  exists (
    select 1 from public.usuarios_unidades uu
    where uu.user_id = auth.uid()
      and uu.ativo = true
      and uu.perfil = 'gestor'
      and uu.unidade_id is not null
      and uu.unidade_id = ordens_servico.unidade_id
  )
);

drop policy if exists gestor_operacional_exclui_os_todas_unidades on public.ordens_servico;
create policy gestor_operacional_exclui_os_todas_unidades
on public.ordens_servico for delete to authenticated
using (
  exists (
    select 1 from public.usuarios_unidades uu
    where uu.user_id = auth.uid()
      and uu.ativo = true
      and uu.perfil = 'gestor'
      and uu.unidade_id is not null
      and uu.unidade_id = ordens_servico.unidade_id
  )
);

drop policy if exists estoque_pecas_gestor_gerencia_unidade on public.pecas_catalogo;
create policy estoque_pecas_gestor_insere_unidade
on public.pecas_catalogo for insert to authenticated
with check (
  exists (
    select 1 from public.usuarios_unidades uu
    where uu.user_id = auth.uid()
      and uu.ativo = true
      and uu.perfil = 'gestor'
      and uu.unidade_id = pecas_catalogo.unidade_id
  )
);

create policy estoque_pecas_gestor_atualiza_unidade
on public.pecas_catalogo for update to authenticated
using (
  exists (
    select 1 from public.usuarios_unidades uu
    where uu.user_id = auth.uid()
      and uu.ativo = true
      and uu.perfil = 'gestor'
      and uu.unidade_id = pecas_catalogo.unidade_id
  )
)
with check (
  exists (
    select 1 from public.usuarios_unidades uu
    where uu.user_id = auth.uid()
      and uu.ativo = true
      and uu.perfil = 'gestor'
      and uu.unidade_id = pecas_catalogo.unidade_id
  )
);

grant select, insert, update, delete on public.ordens_servico to authenticated;
grant select, insert, update, delete on public.pecas_catalogo to authenticated;
