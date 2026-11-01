# Inventário complementar: serviços Supabase e contexto por empresa

Branch: `feature/comercial-multiempresa`.

## Escopo percorrido

Foi percorrida a árvore completa de `src/` (76 arquivos) e a árvore `supabase/` (migrations, configuração e Edge Functions). Foram lidos os módulos de autenticação, armazenamento de sessão, modo offline, acesso a dispositivos, login e a Edge Function de gestão de usuários.

## Achados por categoria

### 1. Autenticação e sessão
- `src/integrations/supabase/auth-attacher.ts`: obtém a sessão do cliente global e anexa o Bearer token às chamadas de Server Functions.
- `src/integrations/supabase/auth-middleware.ts`: cria um cliente Supabase por chamada de servidor, mas URL e chave são globais do ambiente; valida claims do token nesse projeto.
- `src/integrations/supabase/previewAuthStorage.ts`: usa armazenamento de sessão local ou broker de autenticação do preview Lovable.
- `src/integrations/supabase/cron-auth.ts`: valida segredo de cron, sem resolver empresa.
- `src/routes/index.tsx`: antes do login consulta RPC `lookup_email_by_username`; após login registra dispositivo e consulta perfil/unidade. Todo esse fluxo hoje usa o cliente global.
- `src/routes/__root.tsx`: instala listener global `onAuthStateChange`.

**Impacto:** o identificador da empresa precisa ser resolvido antes da RPC de nome de usuário e do login. O token deve ser anexado e validado somente contra a instância daquela empresa. Troca de empresa deve encerrar a sessão anterior e limpar cache/listeners.

### 2. Cliente administrativo e funções de servidor
- `src/integrations/supabase/client.server.ts`: cliente administrativo singleton baseado em variáveis de ambiente globais.
- `src/lib/users.functions.ts`: operações de administração de usuários usam middleware autenticado e importam o cliente administrativo.
- `supabase/functions/gerenciar-usuarios-teste/index.ts`: Edge Function cria cliente de autenticação e cliente administrativo usando secrets do projeto; executa operações Auth Admin e consultas em `usuarios_unidades`.

**Impacto:** toda operação privilegiada precisa receber contexto de empresa resolvido no servidor, nunca um Supabase URL, project ID ou segredo escolhido pelo navegador. O segredo administrativo de cada instância deve permanecer fora do cliente e ser obtido por um provisionador/secret store confiável.

### 3. Dados locais e modo offline
- `src/lib/offline.ts` mantém ordens, ator, papel e fila de ações em IndexedDB com nome fixo `central-os-offline`.
- Os registros offline não carregam, no esquema observado, um identificador de empresa.

**Impacto:** em SaaS, os dados locais devem ser particionados por empresa e usuário. A fila deve guardar o identificador de instância/empresa e validar novamente a sessão e a autorização no servidor antes de sincronizar. Não sincronizar ações pendentes para uma empresa diferente.

### 4. Dispositivos
- `src/lib/deviceAccess.ts` mantém um identificador local de dispositivo em localStorage.
- O login chama RPC `registrar_dispositivo_acesso` no banco conectado.

**Impacto:** a identidade do dispositivo pode continuar local, mas o cadastro, bloqueio e autorização precisam ficar isolados por banco/empresa.

### 5. Realtime e Storage
- A varredura de caminhos confirmou que a integração Supabase está concentrada em `src/integrations/supabase/`; a leitura dos arquivos centrais não revelou um cliente independente de Realtime ou Storage.
- Este inventário não afirma ausência total de chamadas `channel()`, `storage.from()` ou invocações de funções em todos os componentes; essa confirmação exige uma busca textual completa do conteúdo de todos os arquivos.

**Impacto:** antes da refatoração, localizar e classificar cada assinatura Realtime, upload/download Storage e chamada de Edge Function. Todos precisam usar o cliente/instância ativa; canais e assinaturas antigos devem ser encerrados ao trocar de empresa.

### 6. Edge Functions, migrations e tarefas
- A árvore `supabase/functions/` contém a função `gerenciar-usuarios-teste`.
- `supabase/migrations/` contém as migrations operacionais e multiunidade existentes; elas definem o esquema que precisará ser aplicado, em versão controlada, em cada novo banco de cliente.
- O helper `cron-auth.ts` valida um segredo compartilhado, mas não identifica empresa.
- Não foi identificada, nesta leitura, uma implementação de provisionamento SaaS ou um catálogo de instâncias.

**Impacto:** migrations precisam ser executáveis em bancos novos e acompanhadas por uma versão de esquema. Jobs e Edge Functions precisam identificar a empresa por configuração confiável do servidor e nunca percorrer bancos por parâmetros não verificados do cliente.

## Arquitetura de execução recomendada

1. Resolver subdomínio/código da empresa no backend, consultando somente o banco de controle.
2. Retornar ao navegador apenas URL pública e publishable key da instância ativa.
3. Inicializar um cliente de navegador por contexto de empresa; não usar fallback para o banco de teste.
4. Em cada Server Function, resolver novamente a empresa a partir do host/contexto validado, obter a credencial segura no servidor e validar o Bearer token na instância correta.
5. Para operações administrativas, criar cliente privilegiado por requisição/instância, com segredo nunca enviado ao navegador.
6. Particionar IndexedDB/cache por empresa e impedir sincronização cruzada.
7. Isolar Realtime, Storage e Edge Functions pela instância; limpar assinaturas ao encerrar sessão.
8. Aplicar migrations versionadas e executar testes automatizados de isolamento A/B.

## Pendências para fechar o inventário
- Busca textual exaustiva por `channel(`, `storage.from(`, `functions.invoke(`, `from(`, `rpc(` e imports do cliente em todos os arquivos de UI.
- Conferir todas as rotas Server Functions e endpoints adicionais.
- Verificar agendamentos configurados fora do repositório e eventuais webhooks.
- Criar matriz de testes de troca de empresa, sessão, cache offline, Realtime e Storage.

## Segurança e limites desta etapa

Nenhum arquivo de aplicação foi alterado. Nenhuma migration foi aplicada. Nenhum projeto, banco, usuário, variável de ambiente ou deployment foi criado ou modificado. O trabalho foi somente de leitura e documentação nesta branch comercial isolada.
