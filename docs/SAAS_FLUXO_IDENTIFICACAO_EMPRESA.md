# Fluxo técnico de identificação da empresa e conexão à instância

## Objetivo

Preparar o Central OS para atender várias empresas, mantendo uma instância Supabase operacional exclusiva para cada cliente. Esta etapa é somente de planejamento técnico: não altera autenticação, variáveis de ambiente, bancos ou dados.

## Princípio de segurança

- A empresa/instância deve ser resolvida antes de iniciar o login.
- O navegador nunca recebe chaves `service_role`, senhas administrativas ou credenciais de gerenciamento dos projetos.
- O identificador da empresa informado pelo usuário é apenas uma referência de busca; nunca é prova de autorização.
- O backend/control plane valida se a empresa está ativa e qual instância está vinculada a ela.
- O isolamento efetivo dos dados é garantido pelo projeto Supabase exclusivo, pelas políticas RLS e pelas regras de autenticação daquele projeto.
- Não aceitar URL de Supabase ou chave informada livremente pelo usuário.

## Fluxo proposto

1. **Identificação:** o cliente acessa um endereço associado à empresa (preferencialmente subdomínio, ou código/slug na tela inicial).
2. **Resolução:** a aplicação envia somente o identificador público da empresa ao endpoint de resolução do control plane.
3. **Validação:** o backend verifica cadastro, situação contratual e estado da instância.
4. **Resposta pública mínima:** o backend retorna apenas os dados necessários ao cliente, como URL pública do projeto Supabase e chave publishable/anon correspondente. Nunca retorna service_role ou segredos administrativos.
5. **Inicialização:** a aplicação inicializa o cliente Supabase da empresa resolvida antes de carregar telas autenticadas.
6. **Login:** o usuário autentica diretamente no Auth da instância da empresa.
7. **Autorização:** perfil, unidade, permissões e RLS são verificados dentro do banco daquela empresa.

## Arquitetura recomendada

- **Control plane central:** cadastro de empresas, planos, situação da assinatura, identificador/slug, referência da instância e eventos de provisionamento.
- **Provisionador backend:** cria projetos, aplica migrações versionadas e configura recursos usando credenciais administrativas armazenadas somente em ambiente seguro de servidor.
- **Aplicação Central OS:** código compartilhado, sem credenciais fixas de cliente; recebe a configuração pública validada da empresa antes de criar o cliente Supabase.
- **Instância do cliente:** projeto Supabase exclusivo com Auth, tabelas, políticas, funções e arquivos daquela empresa.

## Compatibilidade com o código atual

A aplicação atual importa um cliente Supabase singleton em vários módulos. Trocar apenas a tela de login não é suficiente: todos os módulos que importam esse singleton precisam receber a instância correta, sem criar clientes concorrentes ou misturar sessões.

Antes da implementação, inventariar todos os imports do cliente Supabase e classificar:
- código executado no navegador;
- código executado no servidor;
- funções/rotas backend;
- tarefas agendadas e integrações.

A migração deve introduzir uma camada única de resolução e acesso ao cliente, com inicialização controlada. Não se deve manter um cliente padrão apontando para o banco de teste como fallback silencioso em produção.

## Estados e falhas

A tela de entrada deve tratar claramente:
- empresa não identificada;
- empresa inexistente;
- empresa suspensa/inativa;
- instância em provisionamento;
- instância indisponível;
- configuração pública incompleta.

Em qualquer falha, bloquear o login e não redirecionar para outra empresa ou para o banco padrão.

## Testes obrigatórios antes de piloto

1. Empresa A autentica e acessa somente dados da instância A.
2. Empresa B autentica e acessa somente dados da instância B.
3. Tentar reutilizar sessão/token de A na aplicação configurada para B deve falhar.
4. Slug inválido, empresa suspensa e instância indisponível não podem abrir uma instância diferente.
5. Usuário não consegue trocar a URL/chave da instância por manipulação do navegador.
6. Logout, renovação de sessão e recuperação de senha permanecem vinculados à empresa correta.
7. O fluxo atual do ambiente de teste continua funcionando sem alteração enquanto a nova arquitetura é construída em branch isolada.

## Sequência de implementação

1. Inventariar o cliente Supabase e seus pontos de uso.
2. Definir o identificador de empresa (subdomínio ou código) e contrato do endpoint de resolução.
3. Criar o resolvedor no backend/control plane, com resposta pública mínima.
4. Refatorar a inicialização do cliente para receber configuração validada.
5. Atualizar login, logout, recuperação de senha e proteção de rotas.
6. Testar isolamento com duas instâncias de homologação.
7. Só depois construir o provisionamento automatizado e o onboarding comercial.

## Limites desta etapa

Este documento não implementa o fluxo, não cria endpoint, empresa, projeto Supabase ou usuário, não altera variáveis de ambiente, não migra dados e não publica deployment. Os ambientes operacional de teste e oficial permanecem intactos.
