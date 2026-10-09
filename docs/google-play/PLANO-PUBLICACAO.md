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
