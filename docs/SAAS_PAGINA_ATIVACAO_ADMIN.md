# Página de ativação do administrador SaaS

## Implementação nesta branch

- Rota: `/admin-auth` (`src/routes/admin-auth.tsx`).
- Projeto de identidade esperado: Supabase descartável `kjdkciptyrgarhfvmzxq`.
- A página cria um cliente Supabase independente e não importa o cliente operacional do Central OS.
- A identidade aceita nesta primeira etapa é `faber.alexsandro2011@gmail.com`.
- O fluxo valida o link de convite (OTP/hash ou PKCE), confere a identidade e permite definir a senha.
- Não existe cadastro público nesta página.
- Nenhuma chave `service_role` é utilizada no navegador.

## Variáveis necessárias no ambiente de preview isolado

Configurar somente no ambiente de preview da branch SaaS:

- `VITE_SAAS_CONTROL_SUPABASE_URL=https://kjdkciptyrgarhfvmzxq.supabase.co`
- `VITE_SAAS_CONTROL_SUPABASE_PUBLISHABLE_KEY=<publishable key do projeto descartável>`

A chave publicável pode estar no navegador; nunca configurar `service_role`, secret key ou senha de banco em variável `VITE_*`.

Não reutilizar as variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` do Central OS operacional para esta página.

## Configuração do Supabase Auth — ainda depende do deploy de preview

O endereço `https://kjdkciptyrgarhfvmzxq.supabase.co` é o endpoint da API Supabase, não é o site da aplicação e não deve ser usado como destino de navegação do convite.

Depois de existir uma URL HTTPS real para o preview da branch:

1. Definir **Site URL** para a origem HTTPS do preview SaaS.
2. Adicionar em **Redirect URLs** a URL exata do callback, por exemplo `https://<host-do-preview>/admin-auth`.
3. Garantir que o template de convite redirecione para essa rota (ou que o convite seja enviado com esse `redirectTo`).
4. Somente então reenviar o convite e testar a ativação.

Não usar `localhost`, domínio do Central OS operacional ou domínio de produção nesta etapa. Não adicionar curingas amplos à allowlist.

## MFA — etapa posterior obrigatória

A página ainda não habilita MFA. Após a ativação da conta:
- implementar tela de cadastro e desafio TOTP;
- exigir AAL2 antes de abrir o painel administrativo;
- aplicar autorização no servidor e no banco de controle;
- manter RLS fechada até concluir a política de autorização;
- testar recuperação, revogação de sessão e auditoria.

## Status

Código adicionado à branch `feature/comercial-multiempresa`. Nenhum deploy, domínio, DNS, alteração de produção, política RLS ou configuração de MFA foi executado.
