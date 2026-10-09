# Plano de preparação do Central OS para Google Play

## Objetivo
Preparar o Central OS para distribuição pública na Google Play e comercialização para várias empresas, sem alterar ou migrar o banco de dados atual durante a preparação.

## Proteção obrigatória do ambiente atual
- Esta preparação ocorre na branch `play-store-prep`; não publica alterações em `main` por si só.
- Não executar migrations nem SQL contra o banco atual como parte da embalagem Android.
- Não copiar dados reais de usuários, ordens de serviço, histórico ou estoque para builds de teste.
- Não colocar chaves secretas/service-role em código Android. O app cliente deve usar somente a chave publicável e depender de RLS e autorização no servidor.
- Antes de qualquer alteração de schema, identificar e confirmar formalmente qual projeto Supabase é o de produção e manter backup restaurável.

## Diagnóstico inicial do repositório
- Aplicação React + TanStack Start, Vite e Supabase JS.
- O projeto não contém atualmente configuração Capacitor/Android identificada na raiz.
- O build usa `vite build`; a aplicação usa funcionalidades de TanStack Start, então não se deve presumir que o resultado seja uma SPA estática adequada para empacotamento local sem testar.
- `supabase/config.toml` aponta para `bshykkaqimjpgayzzxch`. Esse identificador não deve ser tratado como produção sem confirmação; existem referências anteriores a outros projetos Supabase. Não alterar esse arquivo por tentativa.
- Não foi encontrada configuração Android nem pipeline de publicação no levantamento inicial.

## Bloqueio comercial importante: várias empresas
A versão atual deve ser auditada antes de atender empresas independentes no mesmo serviço. É necessário garantir isolamento real entre empresas em todas as tabelas, funções RPC, histórico, estoque, anexos e buscas. A solução normalmente exige um modelo de organização/tenant, associação de usuários a uma empresa e políticas RLS por empresa. Não habilitar cadastro público irrestrito nem conectar clientes externos ao banco atual até que essa segregação esteja implementada e testada.

O banco atual do proprietário deve permanecer intacto. Para desenvolvimento multiempresa, usar um projeto Supabase de teste separado. Só aplicar migrations no banco de produção após revisão, backup e aprovação explícita do proprietário.

## Etapas de lançamento
1. Confirmar domínio HTTPS canônico do app e ambiente de produção.
2. Definir identidade comercial: nome público, ícone, package/application ID, e-mail/site de suporte e política de privacidade.
3. Implementar e testar isolamento multiempresa e fluxo de contratação/cadastro.
4. Escolher a estratégia Android depois de validar o tipo de deploy:
   - Trusted Web Activity (TWA) se o app web estiver estável em um domínio HTTPS controlado, com Digital Asset Links configurado; ou
   - Capacitor/Android se houver necessidade comprovada de integrações nativas e o app puder operar corretamente dentro do WebView.
5. Criar build Android de teste e validar login, sessão, navegação, atualização, conectividade, links externos, teclado, rotação/telas pequenas e recuperação de senha.
6. Preparar AAB assinado, ícones e capturas de tela, classificação de conteúdo, formulário de segurança de dados, política de privacidade e acesso de revisão.
7. Criar/usar conta Google Play Console, completar testes exigidos para a modalidade da conta e enviar para análise.
8. Após aprovação, publicar gradualmente e monitorar erros e feedback.

## Critérios de aceite antes de publicar
- Nenhuma mudança inesperada nos dados do banco atual.
- Empresa A não consegue ler, editar, listar ou finalizar OS, estoque ou histórico da empresa B, inclusive chamando diretamente as APIs/RPCs.
- Usuários e permissões testados com contas distintas.
- Build Android instalado em dispositivo real e testado.
- Política de privacidade e declarações da Play Store coerentes com os dados efetivamente coletados.
- Build e commit de release identificados e reproduzíveis.

## Status
Planejamento e diagnóstico inicial registrados. Ainda não há AAB, aplicativo Android publicado, teste em dispositivo, nem confirmação de aprovação da Google Play. Não declarar lançamento concluído até completar os critérios acima.

## Achado adicional de auditoria (somente leitura)
Em 2026-10-08, a consulta de políticas RLS no projeto Supabase atualmente conectado (ref `edujipmfqeajvfkvicda`) mostrou políticas baseadas em papéis globais (`gestor`, `gestor_os`, `tecnico`) e e-mail, sem um identificador de empresa/organização nas tabelas consultadas (`ordens_servico`, `pecas_catalogo`, `historico_edicoes`, `profiles`, `user_roles`, `solicitacoes_os`). Isso não prova que seja o banco de produção; o arquivo `supabase/config.toml` aponta para outro ref. Não fazer deploy nem migration antes de reconciliar essa diferença.

**Implicação:** a arquitetura observada não está pronta para vender um único serviço multiempresa sem uma implementação e validação de isolamento por tenant. Não basta criar contas separadas: cada consulta, política RLS e função privilegiada deve validar a organização do usuário. Para preservar os dados atuais, desenvolver e testar o modelo em um projeto Supabase separado, com dados fictícios, antes de qualquer migração no banco atual.


## Auditoria adicional do cliente web (2026-10-08)
- A rota raiz confirma `ssr: false`; o app é entregue como cliente web e conversa diretamente com Supabase usando a chave publicável. Isso torna uma solução baseada em site HTTPS (por exemplo, TWA) uma candidata inicial, mas ainda exige validar o domínio de produção, navegação e sessão em Android antes de decidir.
- O arquivo `.env` está versionado no repositório e contém URL/ref do Supabase e chave publicável. A chave publicável é destinada ao cliente e não equivale a uma service-role/secret key; ainda assim, arquivos de ambiente não devem ser versionados por padrão. Não encontrei chave secreta nesse arquivo analisado. Antes de mudar o tratamento de ambiente, confirmar quais variáveis a plataforma de deploy injeta para evitar quebrar o site.
- `public/manifest.webmanifest` está configurado com `start_url: /tecnico` e nome voltado à área do técnico. Para publicação pública de um produto vendido a empresas, avaliar a experiência de entrada/login e a identidade do app para que o usuário não seja direcionado indevidamente para uma área específica.
- O repositório não apresenta uma configuração Android nem pacote AAB pronto. Nenhum APK/AAB foi gerado nesta etapa.

## Ações realizadas nesta continuação
Somente leitura do código e atualização deste documento na branch `play-store-prep`. Não houve alteração no banco de dados, migração, alteração na branch `main`, nem publicação de nova versão do site.


## Domínio confirmado pelo proprietário (2026-10-08)
- O proprietário confirmou `https://service-task-mate.lovable.app` como o endereço que utiliza atualmente.
- A confirmação do endereço identifica o domínio esperado, mas não comprova sozinha qual commit está publicado nem quais variáveis de ambiente o deploy ativo recebeu. A tentativa de consultar a página diretamente nesta auditoria não retornou conteúdo verificável; por isso, não declarar o deploy confirmado.
- O commit atual de `main` consultado pelo GitHub é `1002946105d7f9465b2f72fab30fc5dd0b23f376` (mensagem: “Reforçar permissões das RPCs sensíveis”, 2026-10-08). Isso é o HEAD do repositório, não prova que o domínio já esteja servindo esse commit.
- O arquivo `.env` versionado aponta para o projeto `edujipmfqeajvfkvicda`, enquanto `supabase/config.toml` aponta para `bshykkaqimjpgayzzxch`. O projeto Supabase consultado anteriormente também foi `edujipmfqeajvfkvicda`, mas ainda é necessário comparar o ambiente do site publicado com esse identificador antes de afirmar que é o banco de produção.
- Não foi encontrada pasta `.github` com workflow de deploy no repositório. A publicação aparenta estar ligada à integração com Lovable descrita no README, mas o status do deploy não foi confirmado por um endpoint de deploy acessível nesta auditoria.

## Próximo passo seguro
Confirmar o projeto Supabase usado pelo domínio ativo e o commit publicado no painel de deploy/Lovable. Não alterar domínio, variáveis, banco, nem publicar mudanças até reconciliar essa informação. Depois disso, preparar uma cópia de teste isolada para os testes multiempresa e escolher o empacotamento Android.


## Conferência somente de leitura dos projetos Supabase (2026-10-08)
- A conexão Supabase disponível nesta sessão lista um único projeto acessível: `edujipmfqeajvfkvicda`, com status `ACTIVE_HEALTHY`.
- O arquivo `supabase/config.toml` nesta branch ainda aponta para `bshykkaqimjpgayzzxch`.
- Isso confirma uma divergência de configuração, mas não confirma qual projeto o site `service-task-mate.lovable.app` usa em produção. A lista de projetos acessíveis pelo conector também pode não representar todos os projetos de todas as contas/organizações.
- Não foram executados comandos SQL, migrations ou alterações de configuração do Supabase. Para identificar o banco publicado com certeza, comparar a URL/ref mostrada nas configurações de ambiente do projeto Lovable que faz deploy do domínio, sem expor chaves secretas.
