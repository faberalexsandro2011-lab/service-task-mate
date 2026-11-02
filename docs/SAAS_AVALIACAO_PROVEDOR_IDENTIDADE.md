# Avaliação do provedor de identidade — painel SaaS

**Status:** análise preliminar; escolha ainda não aprovada nem implementada.

## Recomendação para MVP
Avaliar primeiro **Supabase Auth em um projeto Supabase exclusivo do plano de controle**, sem reutilizar o projeto operacional ou bancos de clientes.

Motivos:
- reduz a quantidade de componentes no MVP;
- mantém identidade administrativa isolada dos clientes;
- permite centralizar políticas e auditoria no backend do controle.

Essa recomendação depende de validar, na configuração escolhida, MFA TOTP, recuperação segura, proteção de sessão, rate limits e trilha de auditoria. Não considerar aprovado antes desses testes.

## Comparação resumida

| Critério | Supabase Auth isolado | Provedor dedicado |
|---|---|---|
| Separação dos clientes | Projeto de controle exclusivo | Tenant/organização própria |
| MFA e recuperação | Validar recursos e configuração | Validar recursos e configuração |
| Operação inicial | Menos componentes | Mais integração/configuração |
| Custos | Avaliar plano e limites | Avaliar plano e usuários ativos |
| Dependência | Ecossistema Supabase | Provedor externo |

## Critérios obrigatórios para decisão
- MFA obrigatório para todos os administradores.
- Sem cadastro público.
- Convite/criação de conta somente por administrador autorizado.
- Recuperação de conta com verificação reforçada.
- Proteção contra tentativas repetidas e sessões revogáveis.
- Papéis e permissões aplicados no servidor, nunca apenas na interface.
- Registro de login, alterações críticas, provisionamento e ações de suporte.
- Segredos privilegiados exclusivamente no backend.
- Plano de contingência para perda do autenticador e indisponibilidade do provedor.

## Decisão pendente
Confirmar o provedor após validar os critérios acima. Nenhum usuário, projeto, configuração de MFA ou integração foi criado nesta etapa.
