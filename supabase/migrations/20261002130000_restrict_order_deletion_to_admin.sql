-- Restringe a exclusão de ordens de serviço ao administrador principal.
-- Gestores continuam podendo consultar, criar e atualizar OS, mas somente o
-- administrador principal pode excluir registros.

DROP POLICY IF EXISTS "Gestores gerenciam OS" ON public.ordens_servico;

CREATE POLICY "Gestores leem OS"
ON public.ordens_servico
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'gestor'::public.app_role)
);

CREATE POLICY "Gestores criam OS"
ON public.ordens_servico
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'gestor'::public.app_role)
);

CREATE POLICY "Gestores atualizam OS"
ON public.ordens_servico
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'gestor'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'gestor'::public.app_role)
);

DROP POLICY IF EXISTS "Administrador principal exclui OS" ON public.ordens_servico;

CREATE POLICY "Administrador principal exclui OS"
ON public.ordens_servico
FOR DELETE
TO authenticated
USING (
  lower(coalesce(auth.jwt() ->> 'email', '')) = 'faber.alexsandro2011@gmail.com'
);
