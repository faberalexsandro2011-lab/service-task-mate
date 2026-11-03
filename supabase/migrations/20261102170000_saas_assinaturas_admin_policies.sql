-- Acesso do administrador SaaS à gestão de assinaturas.
-- Restrito à identidade administrativa já autorizada no projeto de controle.

GRANT SELECT, INSERT, UPDATE ON TABLE public.assinaturas TO authenticated;

CREATE POLICY "saas_admin_select_assinaturas"
  ON public.assinaturas
  FOR SELECT
  TO authenticated
  USING (auth.uid() = 'e03a79a1-e4f3-44a1-b22c-c258463a936e'::uuid);

CREATE POLICY "saas_admin_insert_assinaturas"
  ON public.assinaturas
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = 'e03a79a1-e4f3-44a1-b22c-c258463a936e'::uuid);

CREATE POLICY "saas_admin_update_assinaturas"
  ON public.assinaturas
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = 'e03a79a1-e4f3-44a1-b22c-c258463a936e'::uuid)
  WITH CHECK (auth.uid() = 'e03a79a1-e4f3-44a1-b22c-c258463a936e'::uuid);
