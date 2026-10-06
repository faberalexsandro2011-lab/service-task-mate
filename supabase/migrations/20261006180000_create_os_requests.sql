-- Solicitações de OS abertas pelos técnicos para trabalhos realizados que não estavam na fila.
-- A solicitação fica separada da OS oficial até o gestor registrar/reencaminhar.
CREATE TABLE IF NOT EXISTS public.solicitacoes_os (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_os text NOT NULL,
  frota text NOT NULL,
  localizacao text NULL,
  descricao text NULL,
  tecnico_id uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  tecnico_email text NOT NULL,
  tecnico_nome text NULL,
  solicitante_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  solicitante_email text NOT NULL,
  solicitante_nome text NULL,
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','atendida','cancelada')),
  ordem_id uuid NULL REFERENCES public.ordens_servico(id) ON DELETE SET NULL,
  detalhe_gestor text NULL,
  criada_em timestamptz NOT NULL DEFAULT now(),
  atendida_em timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_solicitacoes_os_status ON public.solicitacoes_os (status, criada_em DESC);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_os_tecnico_id ON public.solicitacoes_os (tecnico_id) WHERE tecnico_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_solicitacoes_os_solicitante_id ON public.solicitacoes_os (solicitante_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_solicitacoes_os_numero_pendente
  ON public.solicitacoes_os (numero_os)
  WHERE status = 'pendente';

DROP TRIGGER IF EXISTS update_solicitacoes_os_updated_at ON public.solicitacoes_os;
CREATE TRIGGER update_solicitacoes_os_updated_at
BEFORE UPDATE ON public.solicitacoes_os
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.solicitacoes_os ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tecnicos criam solicitacoes OS" ON public.solicitacoes_os;
CREATE POLICY "Tecnicos criam solicitacoes OS"
ON public.solicitacoes_os FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'tecnico'::public.app_role)
  AND solicitante_id = auth.uid()
  AND lower(trim(solicitante_email)) = lower(trim(coalesce(auth.email(), '')))
);

DROP POLICY IF EXISTS "Tecnicos veem suas solicitacoes OS" ON public.solicitacoes_os;
CREATE POLICY "Tecnicos veem suas solicitacoes OS"
ON public.solicitacoes_os FOR SELECT TO authenticated
USING (
  solicitante_id = auth.uid()
  OR public.has_role(auth.uid(), 'gestor'::public.app_role)
);

DROP POLICY IF EXISTS "Gestores atualizam solicitacoes OS" ON public.solicitacoes_os;
CREATE POLICY "Gestores atualizam solicitacoes OS"
ON public.solicitacoes_os FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'gestor'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'gestor'::public.app_role));

DROP POLICY IF EXISTS "Gestor principal exclui solicitacoes OS" ON public.solicitacoes_os;
CREATE POLICY "Gestor principal exclui solicitacoes OS"
ON public.solicitacoes_os FOR DELETE TO authenticated
USING (lower(coalesce(auth.jwt() ->> 'email', '')) = 'faber.alexsandro2011@gmail.com');

ALTER TABLE public.solicitacoes_os REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_rel pr
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_publication pub ON pub.oid = pr.prpubid
    WHERE pub.pubname = 'supabase_realtime'
      AND n.nspname = 'public'
      AND c.relname = 'solicitacoes_os'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.solicitacoes_os;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
