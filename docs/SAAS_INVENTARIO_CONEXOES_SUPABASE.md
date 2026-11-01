# Inventário inicial dos pontos de conexão Supabase

Branch analisada: `feature/comercial-multiempresa`.

## Resultado confirmado nos arquivos centrais

| Arquivo | Responsabilidade atual | Impacto no SaaS |
|---|---|---|
| `src/integrations/supabase/client.ts` | Cria um cliente Supabase singleton no navegador a partir de `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`; usa Proxy para inicialização sob demanda. | Ponto central da conexão do frontend. Hoje a configuração é global para toda a aplicação, não selecionada por empresa. |
| `src/integrations/supabase/client.server.ts` | Cria cliente administrativo singleton no servidor com `SUPABASE_URL` e `SUPABASE_SECRET_KEY`. | Não pode ser reaproveitado como cliente multiempresa sem resolver a instância no servidor e guardar segredos por instância em armazenamento seguro. |
| `src/integrations/supabase/auth-middleware.ts` | Middleware cria cliente por requisição usando URL/chave globais e valida token Bearer. | Deve resolver a empresa da requisição e validar o token na instância correspondente; não pode validar token de uma empresa contra outra. |
| `src/routes/index.tsx` | Tela de login importa o cliente global, autentica e consulta perfil/roles para direcionar o usuário. | A identificação da empresa deve ocorrer antes de chamar `signInWithPassword` e antes das consultas de perfil. |
| `src/routes/__root.tsx` | Registra listener global `onAuthStateChange` no cliente global e invalida rotas/queries. | Sessão e listener precisam acompanhar a instância selecionada e ser limpos ao trocar de empresa. |
| `src/lib/users.functions.ts` | Funções de servidor usam middleware autenticado e importam cliente administrativo para criar/editar/excluir usuários. | Operações administrativas precisam usar a instância da empresa já validada no contexto, sem aceitar um project id arbitrário do navegador. |

## Conclusões técnicas

1. A aplicação tem mais de um caminho de acesso ao Supabase: cliente de navegador, cliente administrativo de servidor e cliente criado no middleware.
2. Mudar somente a tela de login não implementa multiempresa: consultas, mutations, realtime, autenticação e funções de servidor também precisam operar na instância correta.
3. O cliente administrativo atual é singleton e usa uma única configuração de ambiente. Em SaaS, o backend precisará resolver a instância autorizada da empresa e obter o segredo correspondente de um cofre/secret store seguro.
4. O middleware atual exige token JWT e verifica claims com o projeto definido por ambiente. A validação deve ser feita no projeto associado ao identificador da empresa da requisição.
5. O root mantém listener de autenticação global; deve haver um único ciclo de sessão por instância ativa.
6. O login atual consulta funções e tabelas de perfil após autenticar. Essas consultas devem permanecer no mesmo projeto em que a autenticação foi realizada.

## Limitação do inventário

Este é um inventário inicial dos arquivos centrais, não uma contagem exaustiva de todos os imports/consultas do repositório. A busca automatizada de código não retornou resultados utilizáveis nesta execução. Antes de qualquer refatoração, ainda será necessário percorrer o restante de `src/`, `supabase/functions/`, rotas de servidor e tarefas agendadas para localizar usos diretos do cliente, Realtime, Storage e variáveis de ambiente.

## Próxima etapa segura

Completar o inventário por categorias (frontend, rotas/funções de servidor, Realtime, Storage, Edge Functions e tarefas agendadas) e desenhar contratos de contexto por requisição. Somente depois propor mudanças de código, ainda nesta branch isolada.

## Limites

Nenhum código executável foi alterado. Nenhuma variável de ambiente, banco, usuário, sessão ou deployment foi modificado. Os ambientes operacionais de teste e oficial permanecem intactos.
