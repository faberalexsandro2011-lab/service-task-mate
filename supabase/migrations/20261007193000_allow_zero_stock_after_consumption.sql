-- Stock can legitimately reach zero after the last unit is consumed.
-- The application prevents selecting/cadatring unavailable stock; the database must not block a valid consumption to zero.
ALTER TABLE public.pecas_catalogo
  DROP CONSTRAINT IF EXISTS pecas_catalogo_estoque_positivo_check;

ALTER TABLE public.pecas_catalogo
  ADD CONSTRAINT pecas_catalogo_estoque_nao_negativo_check
  CHECK (estoque_atual >= 0);
