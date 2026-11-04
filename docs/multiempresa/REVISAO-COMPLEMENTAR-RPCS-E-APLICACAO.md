# Revisão complementar — chamadas do aplicativo e RPCs

Branch: `feature/comercial-multiempresa`  
Banco consultado: somente o Supabase operacional de TESTE.

## Achados adicionais

1. `finalizar_os_com_estoque` é `SECURITY DEFINER`. Hoje autoriza gestor central global ou técnico/ADM pela unidade da OS. Não verifica empresa proprietária da OS e da peça. A validação atual de unidade evita algumas referências erradas, mas não separa tenants.
2. `registrar_entrada_estoque` é `SECURITY DEFINER` e valida gestor central global ou ADM da unidade. Também não verifica empresa.
3. A função de servidor `createTeamUser`, em `src/lib/users.functions.ts`, usa cliente service-role para criar usuário, perfil e papel. A autorização de entrada verifica papel gestor; não há contexto explícito de empresa nessa operação. `updateTeamUser` e `deleteTeamUser` também usam service-role e precisam de escopo de tenant.
4. O dashboard consulta `ordens_servico`, `profiles` e `user_roles` em paralelo e assina mudanças de OS via Realtime. O tenant deve ser aplicado também a perfis, papéis, canais e eventos.
5. A análise técnica lê OS e atualiza diretamente a tabela. A autorização final depende de RLS; o tenant deve ser aplicado no banco, não apenas na tela.
6. `dispositivos_acesso` é consultada no fluxo autenticado via RPC `registrar_dispositivo_acesso`; a tabela precisa de escopo de empresa ou vínculo inequívoco ao membro.

## Consequência para o desenho

Não basta acrescentar `empresa_id` às OS. É necessário que a empresa seja determinada pela associação autenticada, e que unidade, OS, peça, movimentação, histórico, perfil, usuário, dispositivo e funções administrativas sejam validados contra a mesma empresa.

## Próximo passo de engenharia

Preparar migration aditiva e reversível em arquivo separado, acompanhada de testes automatizados negativos entre dois tenants sintéticos. Antes de qualquer execução no banco operacional de teste, fazer backup/exportação verificável, apresentar diff completo e pedir autorização específica.

Nenhuma migration, alteração de banco, dado, usuário ou deploy foi executada nesta revisão.