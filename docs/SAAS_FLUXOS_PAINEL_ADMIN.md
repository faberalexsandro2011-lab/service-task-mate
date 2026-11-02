# Fluxos de navegação do painel administrativo SaaS

**Status:** especificação de navegação; não implementada na aplicação.

## Menu principal
1. **Visão geral** — empresas ativas/suspensas, assinaturas, provisionamentos e auditoria recente.
2. **Empresas** — pesquisar, abrir ficha e cadastrar empresa como rascunho.
3. **Planos** — consultar limites e histórico/versionamento de alterações.
4. **Assinaturas** — vincular empresa a plano, consultar vigência e suspender/reativar com confirmação e auditoria.
5. **Instâncias** — identificador, estado, migração e versão de schema; nunca exibir chaves privilegiadas.
6. **Provisionamento** — fila, etapas, logs sanitizados, tentativas e erros; reexecutar somente ações idempotentes autorizadas.
7. **Auditoria** — filtros por administrador, empresa, ação e período; eventos imutáveis e sem dados sensíveis.
8. **Configurações da plataforma** — políticas globais, acesso restrito e confirmação de operações críticas.

## Fluxo de cadastro de empresa
1. Administrador inicia cadastro e salva como rascunho.
2. Informa dados mínimos e plano pretendido.
3. Backend valida campos e limites.
4. Empresa fica pendente.
5. Provisionamento é solicitado e acompanhado em tela própria.
6. Após validações técnicas e aprovação, empresa pode ser ativada.
7. Convite do primeiro Gestor Central é enviado por fluxo seguro.

## Ficha da empresa
Abas: Resumo; Plano e assinatura; Instância e saúde; Usuários/convites (metadados, sem senhas); Provisionamento; Auditoria.

## Regras de UX e segurança
- Mostrar claramente ambiente e empresa selecionada.
- Ações críticas exigem confirmação; suspensão, reativação, cancelamento e reprovisionamento exigem motivo e auditoria.
- Nunca mostrar senha; usar convite ou recuperação segura.
- Logs não podem expor tokens, chaves ou dados pessoais desnecessários.
- Estados claros: rascunho, pendente, provisionando, ativo, suspenso, falha e encerrado.

## Fora do escopo desta etapa
Nenhuma tela foi criada, nenhum cliente cadastrado, nenhuma instância provisionada e nenhum deployment foi realizado.
