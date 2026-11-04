# Diagnóstico de isolamento multiempresa

Branch: feature/comercial-multiempresa

## Conclusão
O esquema atual suporta várias unidades de uma organização, mas ainda não implementa isolamento entre empresas. Não é seguro cadastrar clientes reais ou ativar uma segunda empresa operacional antes da migração e dos testes.

## Bloqueios confirmados no código

1. **Vínculo de usuário:** usuarios_unidades usa user_id como chave primária e comporta apenas um vínculo por identidade. O SaaS precisa de associação por empresa, separada da identidade Auth.
2. **Políticas globais:** a migration 20261023170000_add_gestor_operacional_role.sql permite que gestor com unidade_id nulo opere OS em todas as unidades. A função usuario_e_gestor_operacional() também não verifica empresa.
3. **Gestor central:** usuario_e_gestor_central() representa privilégio global. Precisa ser separado do papel de gestor dentro de cada empresa.
4. **RPCs privilegiadas:** finalizar_os_com_estoque e registrar_entrada_estoque são SECURITY DEFINER e validam papel/unidade, mas não empresa. Devem validar empresa do ator, unidade, OS, peça e movimentação.
5. **Service-role:** createTeamUser, updateTeamUser e deleteTeamUser usam supabaseAdmin. Cada função precisa validar tenant e usuário-alvo no servidor antes da operação administrativa. O fluxo de criação também atualiza a senha de uma conta existente; isso deve ser separado do convite.
6. **Aplicação:** dashboard, análise técnica, Realtime, dispositivos e histórico também precisam respeitar o tenant. Filtro visual não é segurança.

## Modelo de destino proposto

- Manter auth.users como identidade global.
- Criar empresas_tenant e membros_empresa.
- Associar cada unidade a uma única empresa.
- Validar OS e estoque pela empresa da unidade.
- Fazer movimentações validar peça, OS e unidade da mesma empresa.
- Fazer histórico herdar o tenant da OS.
- Vincular dispositivos ao membro/empresa.
- Separar papel de plataforma, papel de empresa e papel de unidade.
- Resolver tenant a partir da sessão e associação ativa; nunca confiar no empresa_id enviado pelo navegador.
- Substituir policies globais; policies permissivas PostgreSQL são combinadas por OR.
- Proteger também views, RPCs, Realtime, Storage, importação e exportação.

## Próxima etapa
Preparar proposta de migration aditiva com validações que abortam diante de inconsistências, novas estruturas inicialmente sem backfill automático, constraints após validação, policies tenant-scoped, remoção revisada das policies globais e rollback documentado.

Não aplicar migration até existir backup restaurável do banco de teste, revisão do diff completo e autorização específica.

## Estado
Nenhuma alteração no banco, usuário, senha ou policy. Nenhuma migration aplicada. Nenhum projeto ou deploy de produção criado.