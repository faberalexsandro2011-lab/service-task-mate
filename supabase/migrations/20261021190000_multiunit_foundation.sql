create extension if not exists pgcrypto;

create table public.unidades (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique check (codigo in ('vale_parana','nova_londrina','jussara')),
  nome text not null,
  ativa boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.unidades (codigo, nome) values
  ('vale_parana', 'Vale do Paraná'),
  ('nova_londrina', 'Nova Londrina'),
  ('jussara', 'Jussara')
on conflict (codigo) do update set nome = excluded.nome;

create table public.usuarios_unidades (
  user_id uuid primary key references auth.users(id) on delete cascade,
  unidade_id uuid references public.unidades(id),
  perfil text not null check (perfil in ('admin_unidade','tecnico','gestor_central','visualizador')),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  constraint gestor_central_sem_unidade check (perfil <> 'gestor_central' or unidade_id is null),
  constraint perfis_locais_com_unidade check (perfil = 'gestor_central' or unidade_id is not null)
);

alter table public.unidades enable row level security;
alter table public.usuarios_unidades enable row level security;

create policy "usuarios_unidades_leem_proprio_perfil"
on public.usuarios_unidades for select to authenticated
using (user_id = auth.uid());

create policy "gestor_central_le_unidades"
on public.unidades for select to authenticated
using (
  exists (
    select 1 from public.usuarios_unidades uu
    where uu.user_id = auth.uid()
      and uu.perfil = 'gestor_central'
      and uu.ativo = true
  )
);

create policy "usuario_local_le_sua_unidade"
on public.unidades for select to authenticated
using (
  exists (
    select 1 from public.usuarios_unidades uu
    where uu.user_id = auth.uid()
      and uu.unidade_id = unidades.id
      and uu.ativo = true
  )
);

revoke all on public.unidades from anon, authenticated;
grant select on public.unidades to authenticated;
revoke all on public.usuarios_unidades from anon, authenticated;
grant select on public.usuarios_unidades to authenticated;
