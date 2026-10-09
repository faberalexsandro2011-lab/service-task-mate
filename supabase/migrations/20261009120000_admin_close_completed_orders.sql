-- Central OS: fechamento administrativo de ordens finalizadas.
ALTER TABLE public.ordens_servico
  ADD COLUMN IF NOT EXISTS fechada_em timestamptz,
  ADD COLUMN IF NOT EXISTS fechada_por_email text;

CREATE OR REPLACE FUNCTION public.proteger_fechamento_os()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.fechada_em IS DISTINCT FROM OLD.fechada_em
     AND NOT public.has_role(auth.uid(), 'gestor'::public.app_role) THEN
    RAISE EXCEPTION 'Somente o administrador pode fechar uma OS.';
  END IF;

  IF OLD.fechada_em IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'gestor'::public.app_role)
     AND (to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at') THEN
    RAISE EXCEPTION 'Esta OS está fechada e não pode mais ser editada pelo técnico.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_fechamento_os ON public.ordens_servico;
CREATE TRIGGER trg_proteger_fechamento_os
BEFORE UPDATE ON public.ordens_servico
FOR EACH ROW EXECUTE FUNCTION public.proteger_fechamento_os();
