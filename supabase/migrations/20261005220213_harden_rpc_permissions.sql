-- Harden RPC privileges used by Central OS.
-- RLS needs authenticated users to execute has_role(), but these helpers
-- should not be callable anonymously.

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.lookup_email_by_username(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.lookup_email_by_username(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_email_by_username(text) TO anon;
