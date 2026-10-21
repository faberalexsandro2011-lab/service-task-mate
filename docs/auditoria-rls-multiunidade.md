# Auditoria preliminar de RLS — isolamento por unidade

Data: 21/10/2026. Escopo: leitura de esquema/políticas no projeto Supabase de teste existente; nenhuma alteração de banco executada.

## Achados

1. A tabela `ordens_servico` ainda não tem `unidade_id`.
2. `profiles` não tem atribuição de unidade e `user_roles` armazena papel global do usuário.
3. Existem múltiplas políticas RLS para `ordens_servico`, incluindo políticas de gestores com escopo amplo (`ALL`, leitura, inserção e atualização) e políticas de técnicos para fila/OS atribuídas.
4. PostgreSQL combina políticas permissivas aplicáveis com OR. Portanto, criar uma política adicional que filtre por unidade, sem revisar/substituir as políticas amplas existentes, não garante isolamento.
5. O painel `/_authenticated/painel-teste` continua sendo uma demonstração com números fictícios; o dashboard atual consulta `ordens_servico`, `profiles` e `user_roles` diretamente e ainda não aplica contexto de unidade.

## Requisitos para a implementação segura

- Criar cadastro de unidades e vínculo explícito de usuários à unidade.
- Adicionar `unidade_id` às OS e atribuir os registros históricos existentes exclusivamente a Vale do Paraná somente após uma validação de contagem/amostragem na base de teste.
- Considerar também `solicitacoes_os`, `historico_edicoes`, catálogo de peças, monitoramento e localização de técnicos; não basta isolar apenas `ordens_servico`.
- Revisar todas as políticas de SELECT/INSERT/UPDATE/DELETE e remover/substituir políticas amplas conflitantes dentro de uma migração testada.
- Definir autorização central read-only no banco, sem confiar apenas em botões ocultos na interface.
- Testar com pelo menos três sessões: administrador local de Vale do Paraná, administrador local de outra unidade e gestor central. Incluir tentativas diretas de leitura e escrita via API, não apenas navegação visual.
- Confirmar que usuário sem unidade não enxerga dados; que administrador local não lê nem altera outra unidade; e que gestor central lê todas as unidades mas não modifica OS.

## Limites desta etapa

- Nenhuma migration nova foi aplicada.
- Nenhuma política ou dado foi alterado.
- O projeto `central-os-solinftec-teste` não deve ser tratado como base multiunidade dedicada.
- Antes de criar nova infraestrutura Supabase, verificar custo e obter a autorização exigida.
