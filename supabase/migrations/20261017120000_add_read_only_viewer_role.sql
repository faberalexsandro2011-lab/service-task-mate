-- Perfil somente visualização: leitura global de OS e histórico, sem conceder escrita.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'visualizador';

CREATE POLICY "Visualizadores consultam todas as OS"
ON public.ordens_servico FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'visualizador'));

CREATE POLICY "Visualizadores consultam todo o histórico"
ON public.historico_edicoes FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'visualizador'));

-- Nenhuma política de INSERT, UPDATE ou DELETE é criada para visualizadores.
