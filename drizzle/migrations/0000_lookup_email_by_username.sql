CREATE OR REPLACE FUNCTION public.lookup_email_by_username(p_nome text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM public.profiles
  WHERE lower(trim(nome)) = lower(trim(p_nome))
  ORDER BY created_at
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.lookup_email_by_username(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_email_by_username(text) TO anon, authenticated;