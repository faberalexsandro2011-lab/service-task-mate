-- Ajustes de índices e políticas do Central Frota após a primeira revisão dos Advisors.
create index if not exists frotas_criado_por_idx on public.frotas (criado_por);
create index if not exists componentes_frota_criado_por_idx on public.componentes_frota (criado_por);
create index if not exists instalacoes_frota_instalado_por_idx on public.instalacoes_frota (instalado_por);
create index if not exists instalacoes_frota_retirado_por_idx on public.instalacoes_frota (retirado_por);

drop policy if exists central_frota_frotas_insert on public.frotas;
create policy central_frota_frotas_insert on public.frotas
for insert to authenticated with check (
  criado_por = (select auth.uid())
  and public.central_frota_tem_acesso(unidade_id, true)
);

drop policy if exists central_frota_componentes_insert on public.componentes_frota;
create policy central_frota_componentes_insert on public.componentes_frota
for insert to authenticated with check (
  criado_por = (select auth.uid())
  and public.central_frota_tem_acesso(unidade_id, true)
);

drop policy if exists central_frota_instalacoes_insert on public.instalacoes_frota;
create policy central_frota_instalacoes_insert on public.instalacoes_frota
for insert to authenticated with check (
  instalado_por = (select auth.uid())
  and public.central_frota_tem_acesso(unidade_id, true)
  and exists (
    select 1 from public.frotas f
    where f.id = instalacoes_frota.frota_id
      and f.unidade_id = instalacoes_frota.unidade_id
  )
  and exists (
    select 1 from public.componentes_frota c
    where c.id = instalacoes_frota.componente_id
      and c.unidade_id = instalacoes_frota.unidade_id
  )
);
