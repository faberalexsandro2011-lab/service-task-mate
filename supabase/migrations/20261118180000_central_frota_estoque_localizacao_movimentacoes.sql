-- Central Frota: endereçamento físico do estoque e trilha de movimentações.
-- Aplicar somente no banco de testes da branch.

alter table public.componentes_frota
  add column if not exists localizacao_estoque text default 'Estoque geral';

alter table public.componentes_frota
  drop constraint if exists componentes_frota_localizacao_estoque_check;
alter table public.componentes_frota
  add constraint componentes_frota_localizacao_estoque_check
  check (localizacao_estoque is null or length(trim(localizacao_estoque)) between 1 and 120);

create table if not exists public.movimentacoes_componentes_frota (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades(id) on delete restrict,
  componente_id uuid not null references public.componentes_frota(id) on delete restrict,
  tipo text not null check (tipo in ('entrada','instalacao','retirada','transferencia','manutencao','descarte')),
  localizacao_origem text,
  localizacao_destino text,
  frota_id uuid references public.frotas(id) on delete restrict,
  responsavel_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  responsavel_email text,
  ocorrido_em timestamptz not null default now(),
  observacoes text,
  constraint movimentacao_local_valida check (
    localizacao_origem is null or length(trim(localizacao_origem)) between 1 and 120
  ),
  constraint movimentacao_destino_valida check (
    localizacao_destino is null or length(trim(localizacao_destino)) between 1 and 120
  )
);

create index if not exists movimentacoes_componentes_frota_unidade_data_idx
  on public.movimentacoes_componentes_frota (unidade_id, ocorrido_em desc);
create index if not exists movimentacoes_componentes_frota_componente_data_idx
  on public.movimentacoes_componentes_frota (componente_id, ocorrido_em desc);

alter table public.movimentacoes_componentes_frota enable row level security;
grant select, insert on public.movimentacoes_componentes_frota to authenticated;

drop policy if exists central_frota_movimentacoes_select on public.movimentacoes_componentes_frota;
create policy central_frota_movimentacoes_select
on public.movimentacoes_componentes_frota
for select to authenticated
using (public.central_frota_tem_acesso(unidade_id, false));

drop policy if exists central_frota_movimentacoes_insert on public.movimentacoes_componentes_frota;
create policy central_frota_movimentacoes_insert
on public.movimentacoes_componentes_frota
for insert to authenticated
with check (
  responsavel_id = auth.uid()
  and public.central_frota_tem_acesso(unidade_id, true)
  and exists (
    select 1 from public.componentes_frota c
    where c.id = componente_id and c.unidade_id = unidade_id
  )
);

create or replace function public.central_frota_registrar_movimentacao_manual()
returns trigger
language plpgsql
security invoker
set search_path = public, auth
as $$
begin
  if new.localizacao_estoque is distinct from old.localizacao_estoque
     or new.status is distinct from old.status then
    insert into public.movimentacoes_componentes_frota (
      unidade_id, componente_id, tipo, localizacao_origem, localizacao_destino,
      responsavel_id, responsavel_email, observacoes
    ) values (
      new.unidade_id,
      new.id,
      case
        when new.status = 'manutencao' then 'manutencao'
        when new.status = 'descartado' then 'descarte'
        else 'transferencia'
      end,
      old.localizacao_estoque,
      new.localizacao_estoque,
      auth.uid(),
      coalesce(auth.jwt() ->> 'email', ''),
      'Atualização de localização/status do estoque'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists central_frota_registrar_movimentacao_manual on public.componentes_frota;
create trigger central_frota_registrar_movimentacao_manual
after update of localizacao_estoque, status on public.componentes_frota
for each row execute function public.central_frota_registrar_movimentacao_manual();

create or replace function public.central_frota_sincronizar_status_componente()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_localizacao text;
begin
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
  end if;
  return new;
end;
$$;

create or replace function public.central_frota_registrar_movimentacao_instalacao()
returns trigger
language plpgsql
security invoker
set search_path = public, auth
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.movimentacoes_componentes_frota (
      unidade_id, componente_id, tipo, localizacao_origem, localizacao_destino,
      frota_id, responsavel_id, responsavel_email, observacoes
    )
    select new.unidade_id, new.componente_id, 'instalacao',
           c.localizacao_estoque, null, new.frota_id, auth.uid(),
           coalesce(auth.jwt() ->> 'email', ''), 'Instalação em frota'
    from public.componentes_frota c where c.id = new.componente_id;
  elsif tg_op = 'UPDATE' and old.retirado_em is null and new.retirado_em is not null then
    insert into public.movimentacoes_componentes_frota (
      unidade_id, componente_id, tipo, localizacao_origem, localizacao_destino,
      frota_id, responsavel_id, responsavel_email, observacoes
    ) values (
      new.unidade_id, new.componente_id, 'retirada', null,
      case when coalesce(new.status_apos_retirada, 'disponivel') = 'disponivel'
           then 'Estoque geral' else 'Fora do estoque' end,
      new.frota_id, auth.uid(), coalesce(auth.jwt() ->> 'email', ''),
      coalesce(nullif(trim(new.motivo_retirada), ''), 'Retirada de frota')
    );
  end if;
  return new;
end;
$$;

drop trigger if exists central_frota_registrar_movimentacao_instalacao on public.instalacoes_frota;
create trigger central_frota_registrar_movimentacao_instalacao
after insert or update on public.instalacoes_frota
for each row execute function public.central_frota_registrar_movimentacao_instalacao();

comment on column public.componentes_frota.localizacao_estoque is
  'Local físico atual do componente quando não está instalado; nulo durante instalação.';
comment on table public.movimentacoes_componentes_frota is
  'Trilha auditável de entradas, instalações, retiradas, transferências e mudanças de estado do estoque.';
