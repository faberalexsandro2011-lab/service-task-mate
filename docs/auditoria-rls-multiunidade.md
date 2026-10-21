# Auditoria preliminar de RLS — isolamento por unidade

Data: 21/10/2026. Escopo: projeto isolado `central-os-multiunidade-teste` (ref `idqegjtqvrxytscwsqgc`). Nenhuma alteração na produção.

## Estrutura aplicada no banco de teste

- `public.unidades`: três unidades de teste — Vale do Paraná, Nova Londrina e Jussara.
- `public.usuarios_unidades`: vínculo de usuário, unidade, perfil e status ativo.
- `public.ordens_servico`: tabela de OS com `unidade_id`, campos básicos do painel e índices por unidade/status.
- RLS habilitado nas três tabelas.
- Migrações versionadas na branch `test/painel-consolidado-unidades`:
  - `supabase/migrations/20261021190000_multiunit_foundation.sql`
  - `supabase/migrations/20261021190100_multiunit_service_orders.sql`
- Dados demonstrativos (6 OS fictícias e 4 identidades sintéticas sem senha) carregados exclusivamente no projeto de teste. O seed versionado é `supabase/seed.multiunidade-teste.sql`; nunca aplicar na produção.

## Testes de leitura executados

Com a role PostgreSQL `authenticated` e claims de sessão de teste:
- Admin Vale do Paraná: 2 OS visíveis, 0 OS de outras unidades.
- Admin Nova Londrina: 2 OS visíveis, 0 OS de outras unidades.
- Admin Jussara: 2 OS visíveis, 0 OS de outras unidades.
- Gestor central: 6 OS visíveis (as três unidades).

Tentativas de atualização por admin Vale em uma OS da Nova Londrina e pelo gestor central em uma OS de Vale foram executadas em transações de teste. A inspeção posterior confirmou que as descrições originais permaneceram intactas. Como a ferramenta de consulta não retornou o conjunto de linhas afetadas para essas instruções multi-statement, registrar esse resultado como verificação preliminar, não como prova completa de todos os caminhos de escrita.

## Limitações e próximos testes

- Não foram testados todos os caminhos de INSERT/UPDATE/DELETE via API autenticada nem sessões de login reais.
- As identidades sintéticas do seed não têm senha e não podem fazer login; servem para testar RLS simulando claims no banco.
- O gestor central não possui políticas de escrita na tabela de OS, mas isso ainda deve ser verificado por teste explícito de escrita com resultado mensurável.
- Ainda é necessário revisar tabelas relacionadas (solicitações, histórico, peças, monitoramento e localização), criar o fluxo administrativo seguro de associação de usuários e conectar a rota visual ao banco de teste.
- O painel atual ainda contém números fictícios e não foi implantado/conectado ao novo banco.

## Proteções de escopo

- Não aplicar essas migrações nem o seed no banco oficial.
- Não importar OS reais da produção para este ambiente.
- Não implantar mudanças na produção sem aprovação explícita.
