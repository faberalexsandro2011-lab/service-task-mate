# Painel administrativo da plataforma Central OS SaaS

## 1. Objetivo

Definir a estrutura funcional do painel interno usado pelo operador da plataforma para administrar empresas clientes, planos, instâncias isoladas do Central OS e solicitações de provisionamento.

Este painel é parte do plano comercial SaaS. Não é uma tela de administração de uma empresa cliente e não deve compartilhar permissões com os gestores das instâncias operacionais.

## 2. Princípios de segurança e separação

- O painel administrativo da plataforma deve usar uma identidade e uma camada de autorização próprias.
- O banco de controle SaaS é separado dos bancos operacionais de cada cliente.
- Um operador da plataforma não recebe acesso permanente aos dados operacionais dos clientes apenas por administrar contratos e instâncias.
- Credenciais administrativas, chaves secretas e tokens de provisionamento permanecem exclusivamente no servidor e em um cofre de segredos.
- O navegador nunca escolhe livremente a URL, o projeto ou a chave de uma instância.
- Toda ação administrativa relevante gera registro de auditoria.
- A suspensão comercial não deve apagar dados nem excluir automaticamente a instância.
- A interface deve exibir claramente o ambiente e a empresa selecionada para evitar ações no cliente errado.

## 3. Navegação proposta

1. **Visão geral**
2. **Empresas**
3. **Planos**
4. **Assinaturas**
5. **Instâncias**
6. **Provisionamento**
7. **Auditoria**
8. **Configurações da plataforma**

## 4. Telas e responsabilidades

### 4.1 Visão geral

Indicadores:
- total de empresas cadastradas;
- empresas em implantação, ativas, suspensas e encerradas;
- instâncias prontas, com falha ou aguardando validação;
- provisionamentos pendentes;
- assinaturas próximas do vencimento ou com pendência;
- eventos recentes que exigem atenção.

Os indicadores devem permitir abrir a lista já filtrada. Não exibir dados operacionais de OS, técnicos, estoque ou materiais nessa visão geral.

### 4.2 Empresas

Lista com:
- nome empresarial e nome de exibição;
- identificador interno;
- slug/subdomínio reservado;
- contato administrativo;
- plano contratado;
- situação comercial;
- data de cadastro e ativação.

Ações controladas por permissão:
- cadastrar empresa;
- editar dados cadastrais;
- consultar histórico;
- iniciar contratação ou implantação;
- solicitar suspensão ou encerramento, sempre com confirmação e motivo.

A edição cadastral não pode alterar diretamente a conexão técnica da instância.

### 4.3 Planos

Cadastro e consulta dos planos:
- nome e descrição;
- limite de usuários ativos;
- limite de unidades;
- recursos habilitados;
- preço e periodicidade, quando aprovados;
- estado publicado ou arquivado.

Regras comerciais atualmente propostas (ainda não implementadas):
- Essencial: até 10 usuários ativos e 1 unidade;
- Profissional: até 30 usuários ativos e até 5 unidades;
- Corporativo: limites e condições negociados.

Controle de estoque e materiais está incluído em todos os planos. Não estabelecer limite artificial de quantidade de OS. Preços, cobrança e periodicidade continuam pendentes de decisão.

### 4.4 Assinaturas

Exibir:
- empresa;
- plano;
- início e renovação;
- situação da assinatura;
- período de carência, se definido;
- histórico de alterações.

Ações:
- registrar contratação;
- alterar plano mediante confirmação;
- registrar pagamento ou pendência, se houver integração aprovada;
- solicitar suspensão ou cancelamento.

Não armazenar dados completos de cartão. A integração de cobrança deverá usar um provedor especializado, quando escolhida.

### 4.5 Instâncias

Lista técnica por empresa:
- identificador da instância;
- projeto Supabase associado;
- região;
- ambiente (homologação ou produção);
- versão de migração aplicada;
- estado técnico;
- data do último teste de saúde;
- referência segura ao segredo armazenado (nunca o segredo em si).

Ações:
- consultar estado e histórico;
- executar verificação de saúde;
- solicitar atualização;
- solicitar backup ou restauração;
- iniciar exportação de dados;
- solicitar rotação de credenciais.

Ações que alterem dados, credenciais ou disponibilidade exigem autorização reforçada, motivo e confirmação.

### 4.6 Provisionamento

Fila de solicitações com:
- empresa e plano;
- identificador idempotente da solicitação;
- etapa atual;
- responsável;
- início e última atualização;
- resultado e mensagens de erro sanitizadas.

Etapas visíveis:
1. validação;
2. reserva de identificadores;
3. criação do projeto;
4. armazenamento seguro das credenciais;
5. aplicação das migrações;
6. configuração de Auth, RLS e APIs;
7. criação segura do primeiro Gestor Central;
8. testes automatizados de isolamento;
9. validação humana;
10. ativação.

Na primeira versão, o provisionamento será manual-assistido. A automação só deverá ser habilitada depois de comprovadas idempotência, recuperação de falhas, isolamento e restauração.

Não permitir que um timeout gere exclusão automática do projeto. Falhas devem ser classificadas como recuperáveis ou terminais, com trilha de auditoria.

### 4.7 Auditoria

Registrar, no mínimo:
- ator e papel;
- empresa/instância afetada;
- ação;
- data e hora;
- resultado;
- motivo informado;
- identificador de solicitação;
- metadados técnicos não sensíveis.

Nunca registrar senhas, tokens, chaves secretas ou conteúdo de dados operacionais do cliente.

### 4.8 Configurações da plataforma

Acesso restrito para:
- operadores e papéis administrativos;
- regiões autorizadas;
- cofre de segredos;
- versão estável de migrações;
- políticas de backup e retenção;
- parâmetros de saúde e alertas;
- integrações de cobrança, quando aprovadas.

Mudanças nessas configurações devem exigir MFA e auditoria.

## 5. Papéis administrativos sugeridos

- **Operador da plataforma:** consulta empresas, planos, assinaturas e estado das instâncias.
- **Administrador da plataforma:** gerencia operadores, configurações e ações críticas.
- **Responsável por provisionamento:** executa e acompanha implantação técnica, sem acesso irrestrito aos dados operacionais.
- **Auditor:** consulta trilhas e relatórios, sem executar alterações.

O primeiro lançamento pode começar com um único administrador da plataforma, mas a autorização deve ser estruturada para separar funções posteriormente. Esses papéis são distintos de Gestor Central, ADM de Unidade e Técnico dentro de cada cliente.

## 6. Fluxos principais

### Nova empresa

1. Cadastrar empresa e contato.
2. Associar plano e condições comerciais aprovadas.
3. Reservar slug exclusivo.
4. Criar solicitação de provisionamento com chave idempotente.
5. Provisionar instância isolada.
6. Aplicar migrações e configurações de segurança.
7. Convidar o primeiro Gestor Central por fluxo seguro.
8. Executar testes de isolamento e saúde.
9. Obter aprovação humana.
10. Ativar a empresa e entregar o endereço de acesso.

### Suspensão

1. Registrar motivo e responsável.
2. Verificar contrato e política de carência aprovada.
3. Bloquear novos acessos conforme política.
4. Preservar banco e backups.
5. Registrar evento e comunicar o responsável da empresa.

Suspensão não equivale a exclusão.

### Encerramento

1. Confirmar solicitação e autoridade do solicitante.
2. Oferecer exportação dos dados.
3. Aplicar prazo de retenção aprovado.
4. Revogar acessos e credenciais.
5. Encerrar ou arquivar a instância conforme política.
6. Registrar conclusão na auditoria.

Prazos e obrigações de retenção precisam ser definidos contratualmente e validados para LGPD antes da implementação.

## 7. Regras de interface

- Mostrar sempre o contexto da plataforma, sem misturá-lo com o painel operacional de um cliente.
- Usar estados textuais claros, além de cores.
- Pedir confirmação para suspensão, encerramento, restauração e rotação de credenciais.
- Exigir motivo para ações críticas.
- Não mostrar segredos nem permitir copiá-los para o navegador.
- Exibir erros técnicos sanitizados e um identificador para suporte.
- Oferecer filtros por empresa, situação, plano, região e estado técnico.

## 8. Fora do escopo desta etapa

- Implementar telas ou componentes no aplicativo;
- criar o banco de controle;
- criar projetos Supabase de clientes;
- conectar cobrança ou emitir faturas;
- automatizar provisionamento;
- migrar usuários ou dados;
- alterar o ambiente operacional de teste ou o ambiente oficial;
- publicar ou implantar qualquer versão.

## 9. Decisões necessárias antes da implementação

1. Nome e domínio do painel da plataforma.
2. Quem será o primeiro administrador e como será protegido o acesso (MFA).
3. Região padrão dos projetos dos clientes.
4. Se cada cliente terá produção e homologação separadas desde o início.
5. Provedor de cobrança e periodicidade dos planos.
6. Regras de teste gratuito, carência, suspensão e cancelamento.
7. Prazos de exportação e retenção após encerramento.
8. Se o cadastro e provisionamento continuarão manuais-assistidos no primeiro lançamento.

## 10. Critérios para considerar o desenho pronto

- Separação explícita entre painel SaaS e instâncias operacionais.
- Nenhuma credencial secreta exposta ao navegador.
- Papéis e ações críticas definidos.
- Ciclos de entrada, suspensão e encerramento descritos.
- Provisionamento idempotente e auditável.
- Nenhuma ação de suspensão ou cancelamento apaga dados automaticamente.
- Decisões pendentes identificadas antes de iniciar desenvolvimento.
