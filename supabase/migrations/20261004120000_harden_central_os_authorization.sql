-- Endurecimento de autorização da Central OS.
-- Esta migration remove dependência de e-mail para autorização no frontend/backend
-- e adiciona índices para os caminhos de RLS mais usados.

-- Índices para consultas de atribuição de OS e RLS.
CREATE INDEX IF NOT EXISTS idx_ordens_servico_tecnico_id
  ON public.ordens_servico (tecnico_id)
  WHERE tecnico_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ordens_servico_tecnico_email_lower
  ON public.ordens_servico (lower(tecnico_email))
  WHERE tecnico_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id_role
  ON public.user_roles (user_id, role);

CREATE INDEX IF NOT EXISTS idx_historico_edicoes_os_id
  ON public.historico_edicoes (os_id);

-- Garante que novas contas não recebam papel privilegiado por metadata editável.
-- A autorização da aplicação deve usar public.user_roles + has_role().

-- Mantém o lookup legado para o fluxo de login, mas evita execução por usuários
-- autenticados para reduzir a superfície de enumeração após o login.
REVOKE EXECUTE ON FUNCTION public.lookup_email_by_username(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_email_by_username(text) TO anon;
