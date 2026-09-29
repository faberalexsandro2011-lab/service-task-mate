ALTER TABLE public.ordens_servico
  ADD COLUMN IF NOT EXISTS data_inicio timestamptz,
  ADD COLUMN IF NOT EXISTS tecnico_nome text,
  ADD COLUMN IF NOT EXISTS pecas_utilizadas text,
  ADD COLUMN IF NOT EXISTS valor_total numeric(12,2);

UPDATE public.ordens_servico SET status = 'pendente' WHERE status NOT IN ('pendente','em_andamento','concluida','cancelada');
ALTER TABLE public.ordens_servico ALTER COLUMN status SET DEFAULT 'pendente';
ALTER TABLE public.ordens_servico ADD CONSTRAINT ordens_servico_status_check CHECK (status IN ('pendente','em_andamento','concluida','cancelada'));

CREATE POLICY "Tecnicos veem fila geral" ON public.ordens_servico FOR SELECT TO authenticated
  USING (tecnico_id IS NULL AND status = 'pendente' AND public.has_role(auth.uid(), 'tecnico'));

CREATE POLICY "Tecnicos assumem OS da fila" ON public.ordens_servico FOR UPDATE TO authenticated
  USING (tecnico_id IS NULL AND status = 'pendente' AND public.has_role(auth.uid(), 'tecnico'))
  WITH CHECK (tecnico_id = auth.uid());