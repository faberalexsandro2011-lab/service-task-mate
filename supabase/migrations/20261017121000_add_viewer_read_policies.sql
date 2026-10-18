-- Read-only access: global OS and history SELECT only.
CREATE POLICY "Visualizadores consultam todas as OS"
ON public.ordens_servico FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'visualizador'));

CREATE POLICY "Visualizadores consultam todo o histórico"
ON public.historico_edicoes FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'visualizador'));

-- No INSERT, UPDATE or DELETE policy is granted to the viewer role.
