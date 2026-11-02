# Plano mestre de execução do Central OS SaaS

**Status:** roteiro consolidado de planejamento e preparação. Não autoriza publicação, cobrança, criação de infraestrutura ou alteração dos ambientes operacionais.

## Fases e entregáveis

### Fase 1 — Arquitetura e isolamento
- Arquitetura multiempresa e instância isolada por cliente.
- Fluxo de identificação da empresa antes do login.
- Inventário de conexões Supabase, chamadas e testes de isolamento.
- Modelo lógico do banco de controle.
**Saída:** arquitetura revisada e ameaças/limites conhecidos.

### Fase 2 — Produto e operação comercial
- Planos Essencial, Profissional e Corporativo como proposta inicial.
- Processo de entrada, ciclo de vida e limites por plano.
- Política de cobrança, inadimplência, teste gratuito e cancelamento ainda pendente.
**Saída:** regras comerciais aprovadas, sem implementar cobrança antes da decisão.

### Fase 3 — Painel e identidade administrativa
- Estrutura de navegação do painel.
- Domínio proposto `admin.centralos.tec.br`.
- MFA obrigatório, sem cadastro público e papéis administrativos.
- Provedor de identidade ainda pendente de validação e escolha.
**Saída:** protótipo/requisitos aprovados e provedor selecionado.

### Fase 4 — Provisionamento
- Contrato técnico e fluxo de provisionamento idempotente.
- Criação isolada, migrations, RLS, testes e convite inicial.
- Aprovação manual antes de ativar cliente.
**Saída:** automação testada em projetos descartáveis, com recuperação comprovada.

### Fase 5 — Atualização e operação contínua
- Releases graduais, migrations compatíveis, backup e restauração.
- Monitoramento, incidentes, manutenção e auditoria.
- RPO/RTO, SLA e retenção ainda precisam de aprovação.
**Saída:** runbooks testados e responsabilidades definidas.

### Fase 6 — Qualidade, segurança e conformidade
Antes de qualquer piloto real:
- Testes automatizados de autorização e isolamento entre clientes.
- Testes de acesso indevido, sessão, MFA, recuperação e rate limit.
- Revisão de RLS, privilégios, segredos e logs.
- Testes de backup/restauração e falha parcial de provisionamento.
- Revisão LGPD: finalidade, base legal, minimização, retenção, exportação, exclusão, operadores e resposta a incidentes.
- Revisão independente de segurança antes de produção.
**Saída:** evidências dos testes, riscos aceitos e aprovação formal.

### Fase 7 — Piloto controlado
- Selecionar empresa piloto com autorização expressa.
- Usar dados fictícios ou formalmente autorizados; nunca copiar dados oficiais por padrão.
- Validar onboarding, uso, suporte, limites, atualização e restauração.
- Coletar feedback e corrigir antes de ampliar.
**Saída:** aceite do piloto e decisão de lançamento.

### Fase 8 — Lançamento
Somente após aprovação das fases anteriores:
- Configurar domínio e DNS.
- Provisionar infraestrutura de controle e ambientes dos clientes.
- Configurar identidade, MFA, monitoramento e backups.
- Publicar com plano de rollback e suporte ativo.
**Saída:** lançamento monitorado e reversível.

## Decisões que bloqueiam implementação comercial
1. Provedor de identidade e política de recuperação.
2. Preços, cobrança, teste gratuito e tratamento de inadimplência.
3. SLA, RPO/RTO, janelas de manutenção e suporte.
4. Retenção, exportação e exclusão de dados conforme LGPD/contratos.
5. Limites de armazenamento e anexos por plano.
6. Empresa piloto e autorização para uso de dados.
7. Aprovação de domínio, infraestrutura e orçamento.

## Limites permanentes de segurança
- Não modificar o app oficial nem seu banco.
- Não alterar o ambiente operacional de teste para executar o SaaS.
- Não reutilizar usuários, senhas, tokens ou dados oficiais como dados de demonstração.
- Não publicar nem configurar DNS/domínio sem autorização específica.
- Não executar ações destrutivas ou irreversíveis sem confirmação explícita.

## Estado atual
A documentação das fases 1 a 5 está sendo organizada na branch comercial. As fases 6 a 8 são etapas futuras e dependem das decisões e aprovações acima. Nenhum cliente ou ambiente comercial foi ativado.
