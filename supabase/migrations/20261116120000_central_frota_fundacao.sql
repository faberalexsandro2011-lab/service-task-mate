-- Central Frota: cadastro de ativos, componentes e trilha de instalação.
-- Esta migration é versionada na branch de desenvolvimento; não executar no banco de produção.

create table if not exists public.frotas (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades(id) on delete restrict,
  numero text not null,
  tipo text not null check (tipo in ('trator','colheitadeira','caminhao','veiculo')),
  marca text,
  modelo text,
  identificacao text,
  status text not null default 'ativa' check (status in ('ativa','inativa','manutencao')),
  observacoes text,
  criado_por uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unidade_id, numero)
);

create table if not exists public.componentes_frota (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades(id) on delete restrict,
  tipo text not null check (tipo in ('monitor','receptor','bordo_solinftec','tela_solinftec','rastreador','radio','outro')),
  fabricante text,
  modelo text,
  numero_serie text not null,
  status text not null default 'disponivel' check (status in ('disponivel','instalado','manutencao','descartado')),
  observacoes text,
  criado_por uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists componentes_frota_numero_serie_unique
  on public.componentes_frota (lower(trim(numero_serie)));

create table if not exists public.instalacoes_frota (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades(id) on delete restrict,
  frota_id uuid not null references public.frotas(id) on delete restrict,
  componente_id uuid not null references public.componentes_frota(id) on delete restrict,
  instalado_em timestamptz not null default now(),
  instalado_por uuid not null default auth.uid() references auth.users(id) on delete restrict,
  instalado_por_email text,
  retirado_em timestamptz,
  retirado_por uuid references auth.users(id) on delete set null,
  retirado_por_email text,
  motivo_retirada text,
  status_apos_retirada text check (status_apos_retirada in ('disponivel','manutencao','descartado')),
  observacoes text,
  created_at timestamptz not null default now(),
  constraint instalacao_frota_mesma_unidade check (unidade_id is not null)
);

create unique index if not exists componente_frota_instalacao_ativa_unique
  on public.instalacoes_frota (componente_id)
  where retirado_em is null;

create index if not exists frotas_unidade_numero_idx on public.frotas (unidade_id, numero);
create index if not exists componentes_frota_unidade_status_idx on public.componentes_frota (unidade_id, status);
create index if not exists instalacoes_frota_unidade_data_idx on public.instalacoes_frota (unidade_id, instalado_em desc);
create index if not exists instalacoes_frota_frota_data_idx on public.instalacoes_frota (frota_id, instalado_em desc);
create index if not exists instalacoes_frota_serie_data_idx on public.instalacoes_frota (componente_id, instalado_em desc);

create or replace function public.central_frota_tem_acesso(p_unidade_id uuid, p_gerenciar boolean default false)
returns boolean
language sql
stable
security invoker
set search_path = public, auth
as $$
  select
    public.has_role(auth.uid(), 'gestor'::public.app_role)
    or exists (
      select 1
      from public.usuarios_unidades uu
      where uu.user_id = auth.uid()
        and uu.ativo = true
        and (
          (uu.perfil in ('gestor','gestor_central') and uu.unidade_id is null)
          or (
            uu.unidade_id = p_unidade_id
            and (
              not p_gerenciar
              or uu.perfil in ('gestor','admin_unidade')
            )
          )
        )
    );
$$;

revoke all on function public.central_frota_tem_acesso(uuid, boolean) from public, anon;
grant execute on function public.central_frota_tem_acesso(uuid, boolean) to authenticated;

alter table public.frotas enable row level security;
alter table public.componentes_frota enable row level security;
alter table public.instalacoes_frota enable row level security;

grant select, insert, update on public.frotas to authenticated;
grant select, insert, update on public.componentes_frota to authenticated;
grant select, insert, update on public.instalacoes_frota to authenticated;

drop policy if exists central_frota_frotas_select on public.frotas;
create policy central_frota_frotas_select on public.frotas
for select to authenticated using (public.central_frota_tem_acesso(unidade_id, false));
drop policy if exists central_frota_frotas_insert on public.frotas;
create policy central_frota_frotas_insert on public.frotas
for insert to authenticated with check (
  criado_por = auth.uid() and public.central_frota_tem_acesso(unidade_id, true)
);
drop policy if exists central_frota_frotas_update on public.frotas;
create policy central_frota_frotas_update on public.frotas
for update to authenticated using (public.central_frota_tem_acesso(unidade_id, true))
with check (public.central_frota_tem_acesso(unidade_id, true));

drop policy if exists central_frota_componentes_select on public.componentes_frota;
create policy central_frota_componentes_select on public.componentes_frota
for select to authenticated using (public.central_frota_tem_acesso(unidade_id, false));
drop policy if exists central_frota_componentes_insert on public.componentes_frota;
create policy central_frota_componentes_insert on public.componentes_frota
for insert to authenticated with check (
  criado_por = auth.uid() and public.central_frota_tem_acesso(unidade_id, true)
);
drop policy if exists central_frota_componentes_update on public.componentes_frota;
create policy central_frota_componentes_update on public.componentes_frota
for update to authenticated using (public.central_frota_tem_acesso(unidade_id, true))
with check (public.central_frota_tem_acesso(unidade_id, true));

drop policy if exists central_frota_instalacoes_select on public.instalacoes_frota;
create policy central_frota_instalacoes_select on public.instalacoes_frota
for select to authenticated using (public.central_frota_tem_acesso(unidade_id, false));
drop policy if exists central_frota_instalacoes_insert on public.instalacoes_frota;
create policy central_frota_instalacoes_insert on public.instalacoes_frota
for insert to authenticated with check (
  instalado_por = auth.uid()
  and public.central_frota_tem_acesso(unidade_id, true)
  and exists (select 1 from public.frotas f where f.id = frota_id and f.unidade_id = unidade_id)
  and exists (select 1 from public.componentes_frota c where c.id = componente_id and c.unidade_id = unidade_id)
);
drop policy if exists central_frota_instalacoes_update on public.instalacoes_frota;
create policy central_frota_instalacoes_update on public.instalacoes_frota
for update to authenticated using (public.central_frota_tem_acesso(unidade_id, true))
with check (public.central_frota_tem_acesso(unidade_id, true));

create or replace function public.central_frota_auditar_instalacao()
returns trigger
language plpgsql
security invoker
set search_path = public, auth
as $$
begin
  if tg_op = 'INSERT' then
    new.instalado_em := now();
    new.instalado_por := auth.uid();
    new.instalado_por_email := coalesce(auth.jwt() ->> 'email', '');
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

  if old.retirado_em is not null then
    raise exception 'O histórico de instalação já foi encerrado e não pode ser alterado.';
  end if;
  if new.frota_id <> old.frota_id
    or new.componente_id <> old.componente_id
    or new.unidade_id <> old.unidade_id
    or new.instalado_em <> old.instalado_em
    or new.instalado_por <> old.instalado_por
    or new.instalado_por_email is distinct from old.instalado_por_email then
    raise exception 'Os dados originais da instalação são imutáveis.';
  end if;
  if new.retirado_em is not null then
    new.retirado_em := now();
    new.retirado_por := auth.uid();
    new.retirado_por_email := coalesce(auth.jwt() ->> 'email', '');
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

create or replace function public.central_frota_sincronizar_status_componente()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.componentes_frota set status = 'instalado', updated_at = now()
    where id = new.componente_id;
  elsif tg_op = 'UPDATE' and old.retirado_em is null and new.retirado_em is not null then
    update public.componentes_frota
    set status = coalesce(new.status_apos_retirada, 'disponivel'), updated_at = now()
    where id = new.componente_id;
  end if;
  return new;
end;
$$;

drop trigger if exists central_frota_auditar_instalacao on public.instalacoes_frota;
create trigger central_frota_auditar_instalacao
before insert or update on public.instalacoes_frota
for each row execute function public.central_frota_auditar_instalacao();

drop trigger if exists central_frota_sincronizar_status on public.instalacoes_frota;
create trigger central_frota_sincronizar_status
after insert or update on public.instalacoes_frota
for each row execute function public.central_frota_sincronizar_status_componente();

create or replace function public.central_frota_impedir_exclusao_historico()
returns trigger language plpgsql set search_path = public
as $$
begin
  raise exception 'O histórico de instalações não pode ser excluído.';
end;
$$;
drop trigger if exists central_frota_proteger_historico on public.instalacoes_frota;
create trigger central_frota_proteger_historico
before delete on public.instalacoes_frota
for each row execute function public.central_frota_impedir_exclusao_historico();

create or replace function public.central_frota_atualizar_updated_at()
returns trigger language plpgsql set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists central_frota_frotas_updated_at on public.frotas;
create trigger central_frota_frotas_updated_at before update on public.frotas
for each row execute function public.central_frota_atualizar_updated_at();
drop trigger if exists central_frota_componentes_updated_at on public.componentes_frota;
create trigger central_frota_componentes_updated_at before update on public.componentes_frota
for each row execute function public.central_frota_atualizar_updated_at();

comment on table public.frotas is 'Cadastro de máquinas e veículos controlados pelo Central Frota.';
comment on table public.componentes_frota is 'Cadastro individual de equipamentos eletrônicos por número de série.';
comment on table public.instalacoes_frota is 'Histórico imutável de instalações, retiradas e substituições por frota.';
