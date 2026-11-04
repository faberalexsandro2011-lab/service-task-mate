# Arquitetura multiempresa compartilhada — fase gratuita

**Status:** decisão aprovada para planejamento e implementação exclusiva no branch de teste.  
**Modelo temporário:** um banco operacional compartilhado, com isolamento obrigatório por empresa via RLS.  
**Custo pretendido:** US$ 0, usando somente os dois projetos Supabase Free já existentes.  
**Não autorizado por esta etapa:** criar projetos, contratar planos, importar dados reais, alterar produção ou liberar clientes.

## 1. Projetos existentes e limite do plano Free

A organização Supabase conectada já contém dois projetos ativos:
- `central-os-multiunidade-teste` — banco operacional de teste, ref `idqegjtqvrxytscwsqgc`.
- `centralos-saas-testes-descartavel` — plano de controle SaaS de teste, ref `kjdkciptyrgarhfvmzxq`.

O plano Free permite no máximo dois projetos ativos por organização. Portanto, a fase gratuita deve reutilizar esses dois projetos e não criar um terceiro. O plano Free pode pausar projetos com pouca atividade; disponibilidade contínua não deve ser prometida.

## 2. Separação de responsabilidades

### Plano de controle SaaS
Permanece no projeto `centralos-saas-testes-descartavel`:
- cadastro comercial de empresas;
- planos e assinaturas;
- fila, análise e auditoria de solicitações;
- estado comercial da empresa.

Este banco não será usado para armazenar OS, estoque ou dados operacionais dos clientes.

### Banco operacional compartilhado
Permanece no projeto `central-os-multiunidade-teste`:
- OS, unidades, usuários vinculados, estoque, histórico e demais dados de operação;
- uma chave `empresa_id` UUID como fronteira de tenant;
- RLS obrigatória em todas as tabelas expostas;
- nenhum cliente recebe chave privilegiada.

Os UUIDs de empresa devem ser os mesmos nos dois projetos, sincronizados exclusivamente por backend autenticado. Não haverá FK entre projetos.

## 3. Modelo de dados alvo

- `empresas_tenant`: espelho operacional mínimo de `empresa_id`, slug, status e timestamps. Não replica dados comerciais desnecessários.
- `membros_empresa`: vínculo entre `empresa_id`, `auth.users.id`, papel no tenant e estado ativo.
- `unidades`: adicionar `empresa_id NOT NULL`; cada unidade pertence a exatamente uma empresa.
- Entidades operacionais com `unidade_id` devem provar a empresa por meio da unidade em toda policy/RPC.
- Entidades sem relação inequívoca com unidade (por exemplo, dispositivos, preferências e registros de auditoria) precisam de `empresa_id` direto ou de uma associação de usuário verificável.
- Histórico herda o tenant pela OS relacionada, mas políticas devem validar essa relação em cada operação.
- Chaves estrangeiras compostas ou validações equivalentes devem impedir associar OS, peças, estoque e histórico de empresas diferentes.

O desenho final depende do inventário completo de tabelas, views, RPCs, triggers, storage e chamadas do cliente. Não executar migration antes dessa revisão.

## 4. Regras de autorização

1. O tenant ativo é resolvido no servidor a partir de vínculo autenticado; não confiar em `empresa_id` enviado pelo navegador.
2. Cada SELECT, INSERT, UPDATE e DELETE verifica vínculo ativo do usuário com a empresa proprietária.
3. UPDATE valida a empresa anterior e a nova, impedindo transferência de registro entre empresas.
4. Técnico, ADM e gestor da empresa só operam dentro da empresa à qual pertencem.
5. Administrador da plataforma é um papel separado; não recebe acesso irrestrito aos dados dos clientes por padrão.
6. Suspensão da empresa bloqueia operações mesmo em chamadas diretas à API/RPC.
7. Views, funções SECURITY DEFINER, Realtime, Storage, exportações, notificações e logs devem respeitar o mesmo tenant.
8. Chaves secret/service role ficam somente no servidor; o navegador usa chave publishable e sessão autenticada.

## 5. Achados do inventário inicial

O banco operacional atual organiza OS e estoque por `unidade_id`, e já possui RLS por unidade e papel. Entretanto:
- `unidades` ainda não possui `empresa_id`;
- `usuarios_unidades` usa `user_id` como chave primária, representando apenas um vínculo por usuário;
- existem policies globais como leitura de todas as unidades para ADM e permissões amplas de gestor central;
- `historico_edicoes` depende da OS para identificar unidade/empresa;
- `dispositivos_acesso` é associado ao usuário e tem policies administrativas globais;
- há RPCs privilegiadas que precisam de auditoria individual, incluindo finalização de OS com consumo de estoque e registro de dispositivo.

Essas regras não podem ser consideradas isolamento multiempresa. Devem ser substituídas ou complementadas com verificação explícita de tenant, mantendo o comportamento funcional atual dentro da empresa.

## 6. Sequência de implementação

1. Completar inventário de tabelas, views, funções, triggers, policies, Realtime, Storage e chamadas do cliente.
2. Desenhar migration aditiva e reversível no branch de teste, sem aplicar em produção.
3. Criar tenant de demonstração e dois tenants sintéticos A/B, sem dados pessoais reais.
4. Vincular as unidades de teste existentes a um tenant de teste, após backup e aprovação específica para esse banco.
5. Atualizar policies RLS e RPCs; remover permissões globais incompatíveis com multiempresa.
6. Atualizar funções server-side para resolver tenant autenticado e impedir seleção arbitrária pelo cliente.
7. Executar testes positivos e negativos com duas empresas, incluindo consultas diretas à API, RPCs, Realtime e Storage.
8. Executar Supabase Security Advisors e regressão funcional do Central OS.
9. Só depois de evidência técnica, apresentar ao proprietário uma etapa separada de ativação do piloto.

## 7. Testes obrigatórios de isolamento

- Usuário A não consegue listar, ler, criar, alterar, excluir ou exportar dados de B.
- A não consegue usar unidade, OS ou peça pertencente a B.
- A não consegue mudar `empresa_id` ou `unidade_id` para atravessar o limite.
- Histórico, dispositivos, relatórios e notificações não vazam dados de B.
- RPCs privilegiadas validam tenant, papel e propriedade de cada ID recebido.
- Realtime e Storage não permitem inscrição ou leitura cruzada.
- Usuário removido ou empresa suspensa perde acesso em novas chamadas.
- Administrador de empresa não consegue administrar membros de outra empresa.
- Todos os testes críticos passam com duas empresas sintéticas independentes.

## 8. Critérios para sair da fase gratuita

A solução compartilhada é uma etapa inicial, não uma garantia de custo zero permanente nem uma arquitetura sem limites. Monitorar tamanho do banco, uso de CPU/RAM, armazenamento, tráfego e pausas do plano Free. Antes de atingir limites, avaliar upgrade ou migração para banco dedicado por empresa, com orçamento e autorização humana.

## 9. Limites desta decisão

Esta decisão autoriza o modelo compartilhado como arquitetura temporária e o trabalho no branch de teste. Não autoriza:
- mudanças no Supabase oficial;
- aplicação de migrations no banco operacional sem plano de migração, backup e confirmação específica;
- criação de projeto adicional;
- configuração de faturamento;
- cadastro de clientes reais ou provisionamento;
- deploy de produção.
