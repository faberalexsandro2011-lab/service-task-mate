# Plano de testes de isolamento entre tenants

Branch: `feature/comercial-multiempresa`  
Status: especificação; nenhum teste foi executado contra banco real.

## Situação do repositório

O `package.json` atual não declara Vitest, Jest, Playwright ou um comando de testes. Portanto, não afirmamos que existam testes automatizados executáveis. A primeira etapa será introduzir uma suíte SQL isolada para validar RLS e RPCs no banco de teste, sem usar dados reais.

## Ambiente obrigatório

- Apenas o Supabase operacional de TESTE.
- Dois tenants sintéticos A e B, com UUIDs exclusivos.
- Usuários sintéticos separados: gestor A, ADM A, técnico A, gestor B, ADM B e técnico B.
- Unidades, OS, peças, movimentações, histórico e dispositivos fictícios.
- Não reutilizar contas reais nem dados de produção.
- Executar em ambiente descartável ou em transação com rollback; se a ferramenta/objeto não permitir rollback, não executar sem backup e autorização específica.

## Matriz de testes negativos

| Recurso | Ator A tentando acessar B | Resultado obrigatório |
|---|---|---|
| Empresas/membros | SELECT direto | Nenhuma linha de B |
| Unidades | SELECT/INSERT/UPDATE | Não ler nem criar/alterar unidade B |
| OS | SELECT por id | Nenhuma linha de B |
| OS | INSERT com unidade B | Negado |
| OS | UPDATE mudando unidade para B | Negado |
| OS | DELETE OS B | Negado |
| Estoque | SELECT peça B | Nenhuma linha de B |
| Estoque | entrada em peça B via RPC | Exceção/negado, saldo inalterado |
| Finalização | finalizar OS A com peça B | Exceção/negado; OS e estoque inalterados |
| Movimentações | SELECT/INSERT cruzado | Nenhuma linha / negado |
| Histórico | consultar ou gravar histórico da OS B | Nenhuma linha / negado |
| Dispositivos | consultar/bloquear dispositivo B | Nenhuma linha / negado |
| Usuários | editar/desativar/excluir membro B via server function | Negado antes de qualquer operação service-role |
| Realtime | assinar alterações de OS B | Nenhum evento de B |
| Empresa suspensa | API/RPC direta | Acesso negado, inclusive com sessão válida |

## Matriz positiva de regressão dentro do tenant

Para cada empresa, validar:
- gestor do tenant consulta e administra somente suas unidades/OS conforme permissões definidas;
- ADM administra somente a própria unidade, sem obter poderes de gestor global;
- técnico consulta e atualiza somente OS atribuída;
- visualizador consulta, sem gravar;
- gestor operacional mantém visão multiunidade, mas somente dentro da própria empresa;
- fechamento de OS consome apenas peças da mesma empresa/unidade;
- entrada, ajuste e histórico preservam saldos e trilha de auditoria;
- importação, filtros, análise técnica e exportação mostram somente dados do tenant;
- associação de usuário a mais de uma unidade, se permitida, não amplia o acesso a outras empresas.

## Regras de aprovação

- 100% dos testes negativos devem ser bloqueados.
- 100% dos testes positivos de regressão devem passar.
- Nenhuma operação negada pode alterar saldo, status, vínculo, histórico ou usuário.
- Verificar ausência de policies permissivas globais residuais: policies permissivas do PostgreSQL são combinadas por OR.
- Verificar chamadas SECURITY DEFINER, service-role, views, funções RPC, Realtime e Storage; RLS em tabelas isoladas não prova isolamento ponta a ponta.
- Guardar resultado, versão da migration e commit testado.

## Sequência de execução futura

1. Concluir inventário de objetos e policies.
2. Preparar migration aditiva e script de fixtures/testes em arquivos separados.
3. Revisar o SQL e o rollback.
4. Confirmar backup/restauração do banco de teste.
5. Pedir autorização explícita para aplicar a migration no Supabase operacional de TESTE.
6. Executar primeiro os testes negativos e depois a regressão.
7. Se qualquer teste falhar, interromper e reverter; não habilitar piloto.

## Fora do escopo

Não usar o Supabase oficial, não migrar dados oficiais, não criar projeto Supabase, não alterar cobrança e não fazer deploy de produção.