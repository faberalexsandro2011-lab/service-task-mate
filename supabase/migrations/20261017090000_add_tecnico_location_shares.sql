-- Registro pontual de localizações compartilhadas voluntariamente pelos técnicos.
-- Esta tabela é aditiva: não altera nem remove ordens de serviço ou dados existentes.
CREATE TABLE IF NOT EXISTS public.tecnico_localizacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  latitude double precision NOT NULL CHECK (latitude >= -90 AND latitude <= 90),
  longitude double precision NOT NULL CHECK (longitude >= -180 AND longitude <= 180),
  accuracy_m double precision CHECK (accuracy_m IS NULL OR accuracy_m >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tecnico_localizacoes_user_created
  ON public.tecnico_localizacoes (user_id, created_at DESC);

ALTER TABLE public.tecnico_localizacoes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.tecnico_localizacoes FROM anon;
GRANT SELECT, INSERT ON TABLE public.tecnico_localizacoes TO authenticated;

DROP POLICY IF EXISTS "Usuários veem suas próprias localizações ou gestores veem todas" ON public.tecnico_localizacoes;
CREATE POLICY "Usuários veem suas próprias localizações ou gestores veem todas"
  ON public.tecnico_localizacoes
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'gestor'::public.app_role)
    OR public.has_role(auth.uid(), 'gestor_os'::public.app_role)
  );

DROP POLICY IF EXISTS "Usuários autenticados compartilham somente sua própria localização" ON public.tecnico_localizacoes;
CREATE POLICY "Usuários autenticados compartilham somente sua própria localização"
  ON public.tecnico_localizacoes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      public.has_role(auth.uid(), 'tecnico'::public.app_role)
      OR public.has_role(auth.uid(), 'gestor'::public.app_role)
      OR public.has_role(auth.uid(), 'gestor_os'::public.app_role)
    )
  );
