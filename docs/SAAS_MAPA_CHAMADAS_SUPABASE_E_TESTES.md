# Inventário textual de chamadas Supabase — SaaS Central OS

Branch: `feature/comercial-multiempresa`

## Escopo desta varredura

Foi feita busca textual nos módulos de integração, bibliotecas de aplicação, rotas autenticadas, login, layout raiz e Edge Function. Também foram consultados os arquivos de UI compartilhados na árvore do repositório; os componentes genéricos de interface não apresentaram uso funcional do cliente Supabase nesta varredura. A busca automatizada do GitHub não retornou resultados; por isso, a confirmação abaixo vem da leitura dos módulos de aplicação listados.

## Realtime identificado

Foram localizados canais Realtime em:

- `src/routes/_authenticated/analises.tsx` — canal `analises_tecnicas_live`.
- `src/routes/_authenticated/dashboard.tsx` — canal `ordens_servico_live`.
- `src/routes/_authenticated/painel-teste.tsx` — canal `painel-teste-ordens-live`.
- `src/routes/_authenticated/solicitacoes.tsx` — canal `solicitacoes_os_live`.
- `src/routes/_authenticated/tecnico.tsx` — canal dinâmico por ator, `tecnico_ordens_live_...`.

**Requisito SaaS:** cada canal deve ser criado no cliente da instância da empresa ativa; ao sair ou trocar de empresa, remover canais e listeners antes de inicializar o próximo contexto. Confirmar também filtros/políticas RLS no banco de cada cliente.

## Storage

Não foi localizada chamada explícita `storage.from(...)` nos módulos de aplicação lidos. Isso não comprova ausência de upload/download por caminhos indiretos ou futuros; antes da implementação, validar novamente após qualquer alteração e revisar componentes de anexos/arquivos.

## Edge Functions

Foi identificada chamada de função no navegador:

- `src/routes/_authenticated/painel-teste.tsx` — `supabase.functions.invoke("gerenciar-usuarios-teste", ...)`.
- Implementação: `supabase/functions/gerenciar-usuarios-teste/index.ts`, que cria cliente Auth e cliente administrativo usando variáveis/secrets do projeto e acessa `usuarios_unidades` e `unidades`.

**Requisito SaaS:** invocação deve ocorrer na instância correta. A função deve resolver/validar a empresa no servidor e usar somente secrets da instância autorizada; nunca aceitar URL, project ID ou service-role key arbitrários do navegador.

## Chamadas diretas e módulos afetados

O cliente global `@/integrations/supabase/client` é importado diretamente em login, layout e rotas operacionais. Foram encontrados acessos a tabelas e RPCs em:

- `src/routes/index.tsx`: `lookup_email_by_username`, `registrar_dispositivo_acesso`, `usuarios_unidades`.
- `src/routes/_authenticated/route.tsx`: `registrar_dispositivo_acesso`, `has_role`, `usuarios_unidades`, `user_roles`.
- `src/routes/_authenticated/analises.tsx`: `usuarios_unidades`, `user_roles`, `ordens_servico`.
- `src/routes/_authenticated/dashboard.tsx`: `ordens_servico`, `profiles`, `user_roles`, `historico_edicoes`, `pecas_catalogo` e operações de consulta, inclusão, atualização e exclusão.
- `src/routes/_authenticated/historico.tsx`: `has_role`, `ordens_servico`, `historico_edicoes`.
- `src/routes/_authenticated/painel-teste.tsx`: `usuarios_unidades`, `unidades`, `ordens_servico`, `pecas_catalogo`, `estoque_movimentacoes`, `dispositivos_acesso` e várias RPCs administrativas/estoque; também invoca a Edge Function acima.
- `src/routes/_authenticated/solicitacoes.tsx`: `has_role`, `ordens_servico`, `historico_edicoes`, `profiles`, `user_roles`.
- `src/routes/_authenticated/tecnico.tsx`: `push_subscriptions`, `profiles`, `ordens_servico`, `pecas_catalogo`, `historico_edicoes` e RPC `finalizar_os_com_estoque`.
- `src/routes/_authenticated/visualizacao.tsx`: `has_role`, `ordens_servico`, `historico_edicoes`.
- `src/lib/users.functions.ts`: RPC `has_role` e operações administrativas via `supabaseAdmin` em `profiles` e `user_roles`.
- `supabase/functions/gerenciar-usuarios-teste/index.ts`: operações administrativas em `usuarios_unidades` e `unidades`.

O layout `src/routes/__root.tsx` também importa o cliente global para observar alterações de autenticação. `src/integrations/supabase/auth-attacher.ts` e `auth-middleware.ts` mantêm a sessão/token e validação vinculados ao projeto configurado globalmente. `client.server.ts` mantém cliente administrativo singleton global.

## Conclusão técnica

A mudança SaaS não pode ser feita apenas no formulário de login. É necessário substituir o pressuposto de cliente global por contexto de empresa consistente em:

1. resolução pré-login, inclusive RPC de nome de usuário;
2. sessão, listeners e troca/logout de empresa;
3. todas as consultas e mutações das rotas;
4. Server Functions e cliente administrativo;
5. Edge Functions;
6. Realtime e futuras integrações Storage;
7. cache e IndexedDB/offline já documentados no inventário complementar.

## Matriz mínima de validação antes de piloto

| Teste | Resultado obrigatório |
|---|---|
| Usuário da empresa A tenta consultar dados de B | Negado; nenhuma linha de B retornada |
| Token de A enviado ao endpoint de B | Rejeitado no servidor |
| Alterar identificador/host da empresa no navegador | Não permite selecionar outro banco arbitrariamente |
| Sair de A e entrar em B no mesmo navegador | Sessão, cache, fila offline e canais de A não permanecem ativos |
| Ação offline criada em A e depois troca para B | Não sincroniza em B; permanece isolada ou exige retorno à A |
| Realtime em A durante troca para B | Canais de A encerrados; B recebe somente eventos de B |
| Chamada Edge Function com empresa suspensa | Bloqueada no servidor |
| Operação administrativa | Usa segredo server-side exclusivo da instância correta |
| Banco novo de cliente | Migrations aplicadas e versão de esquema conferida |
| Backup/restauração | Recuperação validada sem misturar empresas |

## Limites e segurança

Esta etapa foi somente leitura e documentação. Nenhum código executável foi alterado, nenhuma migration foi aplicada, nenhum projeto ou banco Supabase foi criado/modificado, nenhum usuário/dado foi migrado e nenhum deployment ou variável de ambiente foi alterado. A branch comercial permanece separada do ambiente operacional.
