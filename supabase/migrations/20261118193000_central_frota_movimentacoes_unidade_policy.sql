-- Keep stock movement records bound to a component from the same unit.
drop policy if exists central_frota_movimentacoes_insert
  on public.movimentacoes_componentes_frota;

create policy central_frota_movimentacoes_insert
  on public.movimentacoes_componentes_frota
  for insert
  to authenticated
  with check (
    responsavel_id = auth.uid()
    and public.central_frota_tem_acesso(unidade_id, true)
    and exists (
      select 1
      from public.componentes_frota c
      where c.id = movimentacoes_componentes_frota.componente_id
        and c.unidade_id = movimentacoes_componentes_frota.unidade_id
    )
  );
