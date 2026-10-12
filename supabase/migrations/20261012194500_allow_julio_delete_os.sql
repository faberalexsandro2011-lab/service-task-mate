-- Permite exclusão permanente de OS pelo administrador Júlio Cesar.
-- A edição já é permitida pela política existente para gestores.
drop policy if exists "Administrador principal exclui OS" on public.ordens_servico;
create policy "Administradores autorizados excluem OS"
  on public.ordens_servico
  for delete
  to authenticated
  using (
    lower(coalesce(auth.jwt() ->> 'email', '')) in (
      'faber.alexsandro2011@gmail.com',
      'juliocesar@coa.com'
    )
  );
