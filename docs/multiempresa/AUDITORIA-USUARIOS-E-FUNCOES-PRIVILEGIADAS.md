# Auditoria de funções privilegiadas e usuários — multiempresa

Branch: `feature/comercial-multiempresa`  
Escopo: leitura do código-fonte versionado. Nenhum banco foi alterado.

## Achados confirmados

### 1. Gestão de usuários usa service-role

Arquivo: `src/lib/users.functions.ts`

As três funções `createTeamUser`, `updateTeamUser` e `deleteTeamUser` usam o cliente `supabaseAdmin`, que opera com privilégios administrativos e não depende das policies RLS do usuário final.

- `createTeamUser` verifica o papel global `gestor`, cria ou recupera conta Auth, grava `profiles` e substitui o papel em `user_roles`.
- Ao encontrar e-mail já cadastrado, o fluxo atual pode atualizar a senha da conta existente usando a senha recebida na solicitação. Não alterar esse comportamento nem executar a função durante a migração; no desenho SaaS, a associação deve ser explícita e a redefinição de senha deve ser um fluxo separado e autorizado.
- `updateTeamUser` consulta e atualiza qualquer usuário conhecido pelo UUID, sem verificar associação à mesma empresa antes de usar service-role.
- `deleteTeamUser` pode excluir definitivamente qualquer usuário conhecido pelo UUID após a verificação de gestor global, sem verificar tenant.

**Correção necessária:** cada função deve resolver o tenant do ator no servidor e confirmar que o usuário-alvo pertence ao mesmo tenant. A operação de exclusão deve ser bloqueada se o usuário tiver vínculos ou dados que exijam retenção; preferir desativação/remoção de associação no tenant em vez de apagar a identidade global do Auth.

### 2. Perfil global e papel do tenant estão misturados

O modelo atual combina `usuarios_unidades.perfil` e `user_roles.role`, com regras diferentes em páginas e funções. Para SaaS, distinguir:
- papel de plataforma (controle SaaS);
- papel dentro da empresa;
- papel dentro da unidade.

Não usar e-mail fixo como prova suficiente de autorização. A conta de administrador da plataforma não deve receber acesso irrestrito aos dados de todas as empresas por padrão.

### 3. Gestor operacional tem políticas globais

Arquivo: `20261023170000_add_gestor_operacional_role.sql`.

As policies `gestor_operacional_cria_os_todas_unidades`, `gestor_operacional_atualiza_os_todas_unidades` e `gestor_operacional_exclui_os_todas_unidades` autorizam o papel `gestor` com `unidade_id IS NULL` em todas as unidades. Isso é coerente com o produto multiunidade atual, mas não com isolamento multiempresa sem acrescentar a checagem da empresa do usuário e da unidade de destino.

### 4. RPCs de estoque e finalização

As funções `finalizar_os_com_estoque` e `registrar_entrada_estoque` são SECURITY DEFINER. Ambas precisam verificar empresa do ator, OS, unidade, peça e movimentação. Não basta conferir somente `unidade_id`.

### 5. Identificador do dispositivo

`src/lib/deviceAccess.ts` gera identificador local do navegador. O identificador não concede autorização por si só; a tabela e RPC que registram/bloqueiam dispositivos devem vincular o registro ao membro/tenant ativo e impedir que um tenant consulte ou bloqueie dispositivos de outro.

## Decisões de desenho propostas

1. Não apagar usuários Auth globais ao remover um membro de uma empresa.
2. Separar desativação do membro, revogação de sessões e exclusão da identidade Auth.
3. Para criar/editar membros, validar tenant e papel no servidor antes de qualquer chamada service-role.
4. Proibir alteração de senha como efeito colateral de convite ou cadastro de usuário já existente.
5. Guardar auditoria mínima para inclusão, alteração de papel, desativação e operações de suporte.
6. Testar que um gestor da Empresa A não consegue alterar/excluir usuário da Empresa B mesmo enviando o UUID diretamente.

## Estado

Auditoria somente de código. Nenhuma função foi executada, nenhuma senha foi alterada, nenhum usuário foi criado ou excluído e nenhum banco foi modificado.