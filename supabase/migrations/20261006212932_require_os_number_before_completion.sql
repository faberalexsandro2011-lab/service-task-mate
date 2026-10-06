alter table public.ordens_servico
  drop constraint if exists ordens_servico_concluida_numero_os_check;

alter table public.ordens_servico
  add constraint ordens_servico_concluida_numero_os_check
  check (
    status <> 'concluida'
    or nullif(trim(numero_os), '') is not null
  );

drop policy if exists "Tecnicos podem atualizar suas OS" on public.ordens_servico;

create policy "Tecnicos podem atualizar suas OS"
on public.ordens_servico
for update
to authenticated
using (
  has_role(auth.uid(), 'gestor'::app_role)
  or (tecnico_id = auth.uid())
  or ((tecnico_id is null) and (tecnico_email is null) and (status = 'pendente'))
)
with check (
  has_role(auth.uid(), 'gestor'::app_role)
  or (
    tecnico_id = auth.uid()
    and lower(trim(coalesce(tecnico_email, ''))) = lower(trim(coalesce(auth.email(), '')))
    and (
      nullif(trim(numero_os), '') is not null
      or (
        solicitacao_os = true
        and solicitacao_status = 'aguardando_os'
      )
    )
    and (
      status <> 'concluida'
      or nullif(trim(numero_os), '') is not null
    )
  )
);

comment on constraint ordens_servico_concluida_numero_os_check on public.ordens_servico
is 'Uma OS somente pode ser concluida depois de possuir numero_os.';
