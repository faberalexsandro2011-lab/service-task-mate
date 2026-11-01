# Modelo lógico do banco de controle SaaS — Central OS

Branch de trabalho: `feature/comercial-multiempresa`

## Objetivo

Definir o banco central de controle comercial do SaaS. Este banco não armazena ordens de serviço, técnicos, estoque ou histórico operacional dos clientes. Esses dados permanecem nos projetos Supabase independentes de cada empresa.

O documento é uma proposta lógica para revisão. Não cria tabelas nem executa migrations.

## Separação de responsabilidades

### Banco de controle (plataforma SaaS)

Armazena somente:
- cadastro e estado comercial das empresas;
- planos e limites contratados;
- assinaturas e períodos de vigência;
- referência e estado de provisionamento de cada instância;
- eventos e tentativas de provisionamento;
- trilha administrativa de ações da plataforma.

### Banco operacional de cada empresa

Continua armazenando os dados daquela empresa:
- usuários e autenticação da instância;
- unidades, OS, técnicos e permissões;
- estoque, peças, movimentações e histórico;
- dispositivos e dados operacionais;
- demais tabelas específicas do Central OS.

Não criar tabelas operacionais compartilhadas entre clientes.

## Entidades propostas

### 1. `empresas`

| Campo | Tipo lógico | Regra |
|---|---|---|
| id | UUID | PK |
| nome_legal | texto | obrigatório |
| nome_exibicao | texto | obrigatório |
| slug | texto | obrigatório, único, normalizado |
| documento_fiscal | texto opcional | armazenar protegido; validar necessidade LGPD |
| email_administrativo | texto | obrigatório |
| status | enum | `ativa`, `suspensa`, `encerrada`, `provisionando` |
| created_at / updated_at | timestamp | auditoria |

Não usar documento fiscal como identificador técnico de tenant. O slug é identificador público não secreto e não concede acesso por si só.

### 2. `planos`

| Campo | Tipo lógico | Regra |
|---|---|---|
| id | UUID | PK |
| codigo | texto | único |
| nome | texto | obrigatório |
| descricao | texto | opcional |
| limite_usuarios | inteiro | nulo pode representar sem limite |
| limite_unidades | inteiro | nulo pode representar sem limite |
| recursos | JSON | somente flags e limites não secretos |
| ativo | boolean | padrão verdadeiro |
| created_at / updated_at | timestamp | auditoria |

Preços, moeda, periodicidade e regras de reajuste devem ser definidos antes de habilitar cobrança. Não presumir valores neste estágio.

### 3. `assinaturas`

| Campo | Tipo lógico | Regra |
|---|---|---|
| id | UUID | PK |
| empresa_id | UUID | FK empresas |
| plano_id | UUID | FK planos |
| status | enum | `trial`, `ativa`, `atrasada`, `suspensa`, `cancelada`, `encerrada` |
| inicio_em | timestamp | obrigatório |
| periodo_atual_inicio | timestamp | opcional |
| periodo_atual_fim | timestamp | opcional |
| cancelada_em | timestamp | opcional |
| referencia_pagamento | texto opcional | ID do provedor; nunca dados de cartão |
| created_at / updated_at | timestamp | auditoria |

Definir se haverá histórico de assinaturas ou apenas uma linha vigente com tabela de eventos. Recomendação: preservar histórico, sem sobrescrever eventos comerciais relevantes.

### 4. `instancias`

| Campo | Tipo lógico | Regra |
|---|---|---|
| id | UUID | PK |
| empresa_id | UUID | FK empresas |
| provedor | texto | ex. supabase |
| project_ref | texto | referência não secreta do projeto |
| project_url | texto | URL pública do projeto |
| publishable_key_ref | texto opcional | referência a secret manager, não a chave em texto aberto |
| secret_ref | texto | referência server-side ao segredo administrativo |
| ambiente | enum | `producao`, `homologacao` |
| status | enum | `solicitada`, `provisionando`, `ativa`, `erro`, `suspensa`, `encerrada` |
| versao_schema | texto | versão de migrations aplicada |
| provisionada_em | timestamp | opcional |
| ultimo_health_check_em | timestamp | opcional |
| created_at / updated_at | timestamp | auditoria |

Índice único recomendado para `(empresa_id, ambiente)`, caso a política seja uma instância por empresa e ambiente. Se futuramente houver múltiplas instâncias por ambiente, substituir por regra explícita de instância principal.

**Segredos:** `secret_ref` aponta para um cofre de segredos. Não armazenar service-role key, senha de banco ou token administrativo em coluna acessível ao navegador. A chave publicável pode ser entregue ao browser somente após resolução e validação server-side da empresa.

### 5. `eventos_provisionamento`

| Campo | Tipo lógico | Regra |
|---|---|---|
| id | UUID | PK |
| empresa_id | UUID | FK empresas |
| instancia_id | UUID | FK instancias, opcional |
| tipo | texto | etapa/evento |
| status | enum | `iniciado`, `concluido`, `falhou`, `repetido` |
| idempotency_key | texto | única por operação lógica |
| tentativa | inteiro | contador |
| mensagem_segura | texto | sem secrets, tokens ou dados pessoais desnecessários |
| iniciado_em / finalizado_em | timestamp | auditoria |

A operação de provisionamento deve ser idempotente: repetição de uma solicitação não pode criar instâncias duplicadas ou usuários administrativos duplicados.

### 6. `auditoria_plataforma`

Registro de ações administrativas relevantes: quem realizou, ação, entidade afetada, data/hora, resultado e metadados mínimos. Não gravar tokens, senhas, chaves, conteúdo de OS ou payloads sensíveis completos.

## Relacionamentos

- Uma empresa pode ter várias assinaturas ao longo do tempo.
- Uma empresa pode ter uma ou mais instâncias conforme a política de ambientes.
- Uma assinatura referencia um plano.
- Eventos de provisionamento pertencem a uma empresa e podem referenciar uma instância.
- A auditoria registra ações do operador da plataforma.

## Segurança e acesso

1. Banco de controle separado dos bancos operacionais dos clientes.
2. RLS habilitada em todas as tabelas expostas; idealmente nenhuma tabela administrativa exposta diretamente ao browser.
3. Acesso administrativo feito por backend autenticado, com papéis de operador da plataforma.
4. O usuário de uma empresa não recebe acesso ao banco de controle.
5. A resolução de empresa verifica status comercial e status da instância antes do login.
6. O backend retorna somente URL pública e publishable key da instância validada.
7. Segredos administrativos ficam em secret manager e só são lidos pelo backend.
8. Suspender uma empresa bloqueia novas sessões e operações server-side conforme política definida; não apagar seus dados automaticamente.
9. Exclusão e retenção de dados exigem fluxo separado, autorização e política LGPD.
10. Toda operação de provisionamento, suspensão e encerramento gera auditoria.

## Decisões pendentes antes de criar migrations

- Nome e região do projeto Supabase de controle.
- Identidade do operador da plataforma e política de MFA.
- Se haverá trial e sua duração.
- Planos, preços, limites e política de cobrança.
- Se cada cliente terá produção e homologação próprias.
- Política de suspensão, exportação, retenção e encerramento.
- Cofre de segredos escolhido e procedimento de rotação.
- Se o provisionamento será automático desde o início ou inicialmente manual assistido.

## Sequência segura de implementação

1. Revisar e aprovar este modelo lógico.
2. Definir as decisões pendentes.
3. Criar um projeto Supabase exclusivo para o controle SaaS, sem reutilizar o banco operacional de teste nem o oficial.
4. Criar migrations versionadas para o banco de controle.
5. Implementar backend de resolução de empresa e provisionamento idempotente.
6. Testar com duas empresas fictícias e dois projetos operacionais isolados.
7. Validar suspensão, falhas, recuperação, auditoria e restauração.
8. Só depois iniciar piloto comercial.

## Limites desta etapa

Somente documentação na branch comercial. Nenhum projeto Supabase foi criado, nenhuma tabela/migration foi aplicada, nenhuma credencial foi solicitada ou armazenada, nenhum usuário ou dado foi migrado e nenhum deployment foi realizado.
