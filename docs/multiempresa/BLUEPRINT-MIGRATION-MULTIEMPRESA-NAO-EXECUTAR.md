# Blueprint da migration multiempresa — NÃO EXECUTAR

Branch: feature/comercial-multiempresa  
Projeto de banco alvo futuro: somente Supabase operacional de TESTE (idqegjtqvrxytscwsqgc).  
Estado: desenho técnico; não é migration SQL executável.

## Objetivo
Adicionar isolamento por empresa ao banco operacional compartilhado, sem alterar dados atuais até existir plano de backup, mapeamento e autorização.

## Fase 0 — pré-condições obrigatórias
A migration final deverá abortar se:
- qualquer tabela/coluna esperada tiver estrutura diferente da auditada;
- houver unidade sem empresa-piloto explicitamente definida;
- existirem OS, peças, movimentações ou históricos com relações inconsistentes;
- houver vínculo de usuário ambíguo;
- políticas, funções, views, triggers ou buckets encontrados divergirem do inventário aprovado.

Antes de executar: exportação completa, backup restaurável validado, diff revisado, janela de manutenção e autorização explícita.

## Fase 1 — estruturas aditivas
Criar, inicialmente sem associar registros operacionais:
- empresas_tenant: id UUID, slug, status, timestamps;
- membros_empresa: id UUID, empresa_id, user_id, papel, ativo, timestamps;
- índices por empresa_id/user_id e unicidade apropriada para associação ativa;
- constraints para status e papéis permitidos.

Adicionar empresa_id nullable às unidades e a tabelas sem relação pai inequívoca, como dispositivos_acesso. Não preencher automaticamente.

Para OS, peças, movimentações e histórico, preferir validar empresa pela cadeia relacional da unidade/OS, com constraints compostas quando compatíveis com os tipos e chaves existentes. A decisão final depende do inventário real de FKs e duplicidades.

## Fase 2 — backfill explícito e controlado
Criar tenant-piloto fictício somente após aprovação específica. Associar somente as unidades de teste expressamente escolhidas. Validar contagens antes/depois e abortar se qualquer linha ficar órfã ou atravessar empresas.

Não atribuir registros reais automaticamente a uma empresa padrão. Não copiar dados de produção. Não criar usuários ou redefinir senhas.

## Fase 3 — autorização
- Resolver tenant a partir de auth.uid() + associação ativa em membros_empresa; ignorar empresa_id fornecido pelo cliente como fonte de autorização.
- Gestor operacional administra todas as unidades somente dentro da empresa associada.
- Administrador de unidade permanece limitado à própria unidade dentro da empresa.
- Papel de plataforma fica separado dos papéis de cliente e não concede leitura global de dados operacionais por padrão.
- Suspensão da empresa bloqueia leitura e escrita em tabelas, RPCs e canais.
- UPDATE valida tanto a linha antiga quanto o novo destino, impedindo transferência para outro tenant.
- Policies antigas globais devem ser removidas ou substituídas na mesma mudança coordenada; policies permissivas são combinadas por OR.

## Fase 4 — funções privilegiadas e aplicação
Revisar e testar, no mínimo:
- finalizar_os_com_estoque;
- registrar_entrada_estoque;
- registrar_dispositivo_acesso e operações de bloqueio;
- createTeamUser, updateTeamUser e deleteTeamUser;
- consultas de dashboard, análise técnica, histórico, importação/exportação e Realtime.

Funções SECURITY DEFINER somente quando estritamente necessárias, com schema não exposto, search_path fixo, validação de auth.uid()/tenant e EXECUTE concedido apenas aos papéis necessários. Views devem usar security_invoker quando apropriado. Service-role nunca deve depender de RLS: validar ator e alvo explicitamente antes da operação.

## Fase 5 — validação negativa
Com dois tenants sintéticos A e B:
- A não lista, lê, altera ou exclui dados de B;
- A não consegue criar OS em unidade de B;
- A não usa peça/OS de B em movimentação;
- A não lê nem grava histórico ou dispositivos de B;
- A não altera membros, papéis ou sessões de B;
- RPCs, funções server-side, Realtime, Storage, views e exportações negam acesso cruzado;
- empresa suspensa não opera mesmo chamando API/RPC diretamente;
- gestor mantém acesso multiunidade dentro de A, sem alcançar B.

Todos os testes devem comprovar tanto o caso permitido quanto o negado. Falha em qualquer teste bloqueia a ativação.

## Fase 6 — reversão
A reversão deve restaurar policies e funções anteriores a partir do estado versionado, remover apenas estruturas novas vazias e preservar todo dado criado após o piloto. Se houver dados tenant-scoped, rollback automático de colunas/constraints não é seguro; exigir plano de restauração a partir do backup e interromper a reversão se houver dependências.

## Itens que ainda precisam ser confirmados
1. Resultado atualizado dos scripts tenant-isolation-inventory.sql e tenant-readiness-check.sql no banco operacional de teste.
2. Inventário de views, funções, triggers, Storage e Realtime, inclusive objetos criados fora das migrations versionadas.
3. Regra de negócio para usuários membros de mais de uma empresa e seleção da empresa ativa.
4. Política de retenção ao remover membro; excluir identidade Auth global não deve ser comportamento padrão.
5. Confirmação do tenant-piloto e unidades de teste que poderão receber associação.

## Não executar
Este documento não altera banco, não cria tenants, não cadastra usuários, não provisiona projetos e não autoriza deploy. A migration SQL real só será criada depois de resolver os itens pendentes, usando o fluxo de migrations do Supabase, e ficará aguardando aprovação específica antes de aplicação.