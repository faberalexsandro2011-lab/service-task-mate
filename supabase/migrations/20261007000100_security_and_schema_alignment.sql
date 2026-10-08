-- Central OS: hardening de RPCs e alinhamento de segurança.
-- Acesso administrativo de usuários continua sendo protegido no server function.
-- Restringe execução de RPCs sensíveis ao papel authenticated.

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

REVOKE ALL ON FUNCTION public.finalizar_os_com_estoque(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalizar_os_com_estoque(uuid, text, jsonb) TO authenticated;

-- lookup_email_by_username é mantida pública apenas porque o fluxo de login por nome
-- pode precisar resolver o e-mail antes da autenticação. Ela não deve expor outros dados.
