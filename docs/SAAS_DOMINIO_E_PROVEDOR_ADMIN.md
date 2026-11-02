# Domínio e identidade do painel administrativo SaaS

**Status:** proposta documentada; nenhuma configuração foi aplicada.

## Domínio proposto
- Painel da plataforma: `admin.centralos.tec.br`
- O domínio é uma proposta. DNS, domínio na Vercel e publicação ainda não foram configurados.
- O painel será separado do aplicativo de cada cliente e do papel Gestor Central.

## Acesso administrativo
- Acesso exclusivo a administradores autorizados da plataforma.
- Cadastro público desabilitado; criação e autorização de contas somente por procedimento administrativo.
- MFA obrigatório (preferencialmente TOTP por aplicativo autenticador).
- Sessões protegidas, recuperação de acesso controlada e registro de ações administrativas.
- Papéis administrativos distintos (por exemplo, administrador da plataforma e suporte com permissões limitadas).

## Identidade e banco de controle
- Identidade administrativa e banco de controle devem ser independentes dos bancos operacionais dos clientes.
- Nenhuma credencial privilegiada ou chave `service_role` deve chegar ao navegador.
- O painel não deve permitir que um operador escolha livremente URL/chave de banco de cliente.
- Cada ação de provisionamento ou alteração de empresa deve ser autorizada no backend e auditada.

## Provedor de identidade — decisão pendente
Alternativas para avaliação antes da implementação:
1. **Supabase Auth em projeto exclusivo de controle:** avaliar MFA TOTP, políticas de sessão e recuperação.
2. **Provedor dedicado de identidade:** avaliar MFA, gestão de organizações/administradores, recuperação e custos.

Não há provedor selecionado nem usuários administrativos criados neste momento.

## Próximos passos, antes de configurar
1. Escolher o provedor de identidade e validar MFA/recuperação.
2. Definir quem terá acesso inicial e quais papéis.
3. Criar projeto isolado de controle e políticas de segurança.
4. Só após autorização explícita, configurar DNS/domínio e publicar o painel.
5. Testar MFA, bloqueio de cadastro público, autorização e auditoria antes de liberar.

## Limites desta etapa
Este documento não cria domínio, DNS, projeto Supabase, usuário, segredo, configuração de autenticação nem deployment. Não altera o app oficial ou o ambiente operacional de teste.
