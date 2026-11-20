create table public.ordens_servico (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades(id),
  numero_os text not null,
  frota text not null,
  entrada text,
  descricao text,
  localizacao text,
  tecnico_email text,
  tecnico_id uuid references auth.users(id) on delete set null,
  tecnico_nome text,
  setor text,
  sequencia integer,
  status text not null default 'pendente'
    check (status in ('pendente','em_andamento','concluida','cancelada')),
  data_inicio timestamptz,
  concluida_em timestamptz,
  classe_manutencao text,
  pecas_utilizadas text,
  notas_fecho text,
  valor_total numeric,
  criado_por_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ordens_servico_unidade_status_idx
  on public.ordens_servico (unidade_id, status);
create index ordens_servico_unidade_created_idx
  on public.ordens_servico (unidade_id, created_at desc);

alter table public.ordens_servico enable row level security;

create policy "os_leitura_por_unidade_e_perfil"
on public.ordens_servico for select to authenticated
using (
  exists (
    select 1 from public.usuarios_unidades uu
    where uu.user_id = auth.uid()
      and uu.ativo = true
      and (
        uu.perfil = 'gestor_central'
        or (
          uu.unidade_id = ordens_servico.unidade_id
          and (
            uu.perfil = 'admin_unidade'
            or (
              uu.perfil = 'tecnico'
              and (
                ordens_servico.tecnico_id = auth.uid()
                or lower(coalesce(ordens_servico.tecnico_email,'')) =
                   lower(coalesce(auth.jwt() ->> 'email',''))
              )
            )
            or uu.perfil = 'visualizador'
          )
        )
      )
  )
);

create policy "admin_local_cria_os_na_propria_unidade"
on public.ordens_servico for insert to authenticated
with check (
  exists (
    select 1 from public.usuarios_unidades uu
    where uu.user_id = auth.uid()
      and uu.ativo = true
      and uu.perfil = 'admin_unidade'
      and uu.unidade_id = ordens_servico.unidade_id
  )
);

create policy "admin_local_atualiza_os_da_propria_unidade"
on public.ordens_servico for update to authenticated
using (
  exists (
    select 1 from public.usuarios_unidades uu
    where uu.user_id = auth.uid()
      and uu.ativo = true
      and uu.perfil = 'admin_unidade'
      and uu.unidade_id = ordens_servico.unidade_id
  )
)
with check (
  exists (
    select 1 from public.usuarios_unidades uu
    where uu.user_id = auth.uid()
      and uu.ativo = true
      and uu.perfil = 'admin_unidade'
      and uu.unidade_id = ordens_servico.unidade_id
  )
);

create policy "admin_local_exclui_os_da_propria_unidade"
on public.ordens_servico for delete to authenticated
using (
  exists (
    select 1 from public.usuarios_unidades uu
    where uu.user_id = auth.uid()
      and uu.ativo = true
      and uu.perfil = 'admin_unidade'
      and uu.unidade_id = ordens_servico.unidade_id
  )
);

create policy "tecnico_atualiza_os_atribuida"
on public.ordens_servico for update to authenticated
using (
  exists (
    select 1 from public.usuarios_unidades uu
    where uu.user_id = auth.uid()
      and uu.ativo = true
      and uu.perfil = 'tecnico'
      and uu.unidade_id = ordens_servico.unidade_id
      and (
        ordens_servico.tecnico_id = auth.uid()
        or lower(coalesce(ordens_servico.tecnico_email,'')) =
           lower(coalesce(auth.jwt() ->> 'email',''))
      )
  )
)
with check (
  exists (
    select 1 from public.usuarios_unidades uu
    where uu.user_id = auth.uid()
      and uu.ativo = true
      and uu.perfil = 'tecnico'
      and uu.unidade_id = ordens_servico.unidade_id
      and (
        ordens_servico.tecnico_id = auth.uid()
        or lower(coalesce(ordens_servico.tecnico_email,'')) =
           lower(coalesce(auth.jwt() ->> 'email',''))
      )
  )
);

grant select, insert, update, delete on public.ordens_servico to authenticated;
