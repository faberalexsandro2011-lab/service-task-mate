# Matriz de testes de autorização — Painel Consolidado

Data: 21/10/2026  
Branch: `test/painel-consolidado-unidades`  
Status: plano de validação; ainda não executado contra três contas reais.

## Pré-condições obrigatórias

- Usar uma base Supabase dedicada ao teste multiunidade, sem dados oficiais e sem reaproveitar `central-os-solinftec-teste`.
- Não importar nem migrar OS até confirmar o escopo dos dados e a unidade de origem.
- Criar três unidades: Vale do Paraná, Nova Londrina e Jussara.
- Criar contas de teste separadas: administrador local de cada unidade e gestor central.
- O gestor central deve ser somente leitura no banco, não apenas na interface.
- Confirmar custo/plano da infraestrutura antes de criar ou ampliar recursos.

## Matriz de autorização

| Identidade de teste | Ler OS da própria unidade | Ler OS de outra unidade | Criar/editar OS local | Excluir OS | Ler todas as unidades |
|---|---:|---:|---:|---:|---:|
| Admin Vale do Paraná | Sim | Não | Sim | Conforme regra administrativa aprovada | Não |
| Admin Nova Londrina | Sim | Não | Sim | Conforme regra administrativa aprovada | Não |
| Admin Jussara | Sim | Não | Sim | Conforme regra administrativa aprovada | Não |
| Gestor central | Sim | Sim | Não | Não | Sim |
| Usuário sem unidade | Não | Não | Não | Não | Não |

## Casos que precisam ser executados

1. Login de cada perfil e verificação de unidade selecionada.
2. Consulta da lista, detalhe, histórico, solicitações, peças e localização.
3. Tentativa de consultar OS de outra unidade pela interface.
4. Tentativa direta via API/REST de consultar outra unidade, usando a sessão autenticada de cada administrador local.
5. Tentativa direta de INSERT, UPDATE e DELETE fora do escopo permitido.
6. Tentativa do gestor central de gravar ou excluir via API, mesmo que a interface não apresente botões.
7. Usuário autenticado sem vínculo de unidade: consultas devem retornar zero registros e gravações devem falhar.
8. Conferir que tabelas relacionadas não revelam dados de OS de outra unidade por meio de joins, histórico ou solicitações.
9. Repetir testes após logout/login e em sessões isoladas para descartar cache de front-end.
10. Verificar que a unidade não pode ser alterada pelo cliente para contornar a autorização.

## Critério de aprovação

A implementação só passa quando todas as restrições forem aplicadas no banco por políticas RLS e/ou funções seguras, e os testes diretos via API confirmarem o isolamento. Filtros React, ocultação de botões e seleção visual de unidade não contam como controle de segurança.

## Bloqueios atuais

- O esquema observado ainda não tem `unidade_id` em `ordens_servico` nem vínculo de unidade em `profiles`.
- As políticas existentes incluem permissões amplas de gestor; precisam ser revisadas em conjunto porque políticas permissivas podem se combinar com OR.
- Esta matriz ainda não foi executada. Não há evidência de isolamento multiunidade funcional neste momento.
