-- Catálogo de peças administrado pelo administrador principal.
CREATE TABLE IF NOT EXISTS public.pecas_catalogo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_por_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pecas_catalogo_nome_lower_unique
  ON public.pecas_catalogo (lower(trim(nome)));

ALTER TABLE public.pecas_catalogo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Peças podem ser consultadas por autenticados" ON public.pecas_catalogo;
CREATE POLICY "Peças podem ser consultadas por autenticados"
  ON public.pecas_catalogo
  FOR SELECT TO authenticated
  USING (ativo = true OR lower(coalesce(auth.jwt()->>'email', '')) = 'faber.alexsandro2011@gmail.com');

DROP POLICY IF EXISTS "Somente administrador principal adiciona peças" ON public.pecas_catalogo;
CREATE POLICY "Somente administrador principal adiciona peças"
  ON public.pecas_catalogo
  FOR INSERT TO authenticated
  WITH CHECK (lower(coalesce(auth.jwt()->>'email', '')) = 'faber.alexsandro2011@gmail.com');

DROP POLICY IF EXISTS "Somente administrador principal altera peças" ON public.pecas_catalogo;
CREATE POLICY "Somente administrador principal altera peças"
  ON public.pecas_catalogo
  FOR UPDATE TO authenticated
  USING (lower(coalesce(auth.jwt()->>'email', '')) = 'faber.alexsandro2011@gmail.com')
  WITH CHECK (lower(coalesce(auth.jwt()->>'email', '')) = 'faber.alexsandro2011@gmail.com');

DROP POLICY IF EXISTS "Somente administrador principal exclui peças" ON public.pecas_catalogo;
CREATE POLICY "Somente administrador principal exclui peças"
  ON public.pecas_catalogo
  FOR DELETE TO authenticated
  USING (lower(coalesce(auth.jwt()->>'email', '')) = 'faber.alexsandro2011@gmail.com');

GRANT SELECT ON public.pecas_catalogo TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.pecas_catalogo TO authenticated;

-- A coluna já existe em ordens_servico; passa a receber a lista selecionada pelo técnico.
COMMENT ON COLUMN public.ordens_servico.pecas_utilizadas IS 'Lista de peças substituídas, separadas por linha, selecionadas no catálogo.';
