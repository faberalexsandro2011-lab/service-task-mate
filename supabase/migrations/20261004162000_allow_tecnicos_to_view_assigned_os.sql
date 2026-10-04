-- Allow technicians to see and update the service orders assigned to them.
-- Unassigned pending orders remain visible for the general queue.

create policy "Tecnicos podem visualizar suas OS"
on public.ordens_servico
for select
to authenticated
using (
  has_role(auth.uid(), 'gestor'::app_role)
  or tecnico_id = auth.uid()
  or (tecnico_id is null and tecnico_email is null and status = 'pendente')
  or (tecnico_id is null and lower(trim(tecnico_email)) = lower(trim(coalesce(auth.email(), ''))))
);

create policy "Tecnicos podem atualizar suas OS"
on public.ordens_servico
for update
to authenticated
using (
  has_role(auth.uid(), 'gestor'::app_role)
  or tecnico_id = auth.uid()
  or (tecnico_id is null and tecnico_email is null and status = 'pendente')
)
with check (
  has_role(auth.uid(), 'gestor'::app_role)
  or (
    tecnico_id = auth.uid()
    and lower(trim(coalesce(tecnico_email, ''))) = lower(trim(coalesce(auth.email(), '')))
  )
);