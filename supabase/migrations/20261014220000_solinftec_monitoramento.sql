-- Central OS: snapshot do monitoramento de conectividade da Solinftec.
-- Esta migration deve ser aplicada apenas no ambiente de teste, após revisão.
CREATE TABLE IF NOT EXISTS public.solinftec_monitoramento (
  codigo TEXT PRIMARY KEY,
  equipamento TEXT NOT NULL,
  regional TEXT,
  unidade TEXT,
  grupo TEXT,
  operacao TEXT,
  tipo TEXT,
  data_inicial TEXT,
  data_final TEXT,
  funcionario TEXT,
  tempo_sem_comunicacao TEXT NOT NULL DEFAULT '',
  horas_sem_comunicacao NUMERIC,
  coletado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_solinftec_monitoramento_horas
  ON public.solinftec_monitoramento (horas_sem_comunicacao DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_solinftec_monitoramento_coletado
  ON public.solinftec_monitoramento (coletado_em DESC);

ALTER TABLE public.solinftec_monitoramento ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.solinftec_monitoramento FROM anon;
REVOKE ALL ON TABLE public.solinftec_monitoramento FROM authenticated;
GRANT SELECT ON TABLE public.solinftec_monitoramento TO authenticated;
GRANT ALL ON TABLE public.solinftec_monitoramento TO service_role;

DROP POLICY IF EXISTS "Gestores consultam monitoramento Solinftec"
  ON public.solinftec_monitoramento;

CREATE POLICY "Gestores consultam monitoramento Solinftec"
  ON public.solinftec_monitoramento
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'gestor'::public.app_role));

DROP TRIGGER IF EXISTS update_solinftec_monitoramento_updated_at
  ON public.solinftec_monitoramento;

CREATE TRIGGER update_solinftec_monitoramento_updated_at
  BEFORE UPDATE ON public.solinftec_monitoramento
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
