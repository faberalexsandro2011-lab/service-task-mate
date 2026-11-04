# Plano de migração multiempresa — fase de desenho

Branch: `feature/comercial-multiempresa`  
Ambiente alvo futuro: Supabase operacional de TESTE `idqegjtqvrxytscwsqgc`  
Status: desenho; não executar.

## Objetivo

Evoluir o Central OS multiunidade para SaaS multiempresa no banco compartilhado temporário, mantendo os dados operacionais atuais e impedindo qualquer leitura ou escrita entre empresas.

## Modelo lógico proposto

### Empresas e membros

- `empresas_tenant`: espelho operacional mínimo do identificador UUID, slug e estado da empresa mantidos no plano de controle.
- `membros_empresa`: chave própria; `empresa_id`, `user_id`, papel no tenant, ativo e datas de auditoria. Índice único parcial para associação ativa conforme regra de negócio.
- `usuarios_unidades`: manter como associação de usuário a unidade/perfil local, mas acrescentar referência explícita ao membro/empresa e remover a premissa de que `user_id` sozinho representa todo o vínculo. A migração da PK atual exige estratégia de compatibilidade e revisão de todas as queries.

### Propriedade dos dados

- `unidades`: `empresa_id NOT NULL`; unicidade de código passa a ser por empresa, não global.
- `ordens_servico`: tenant determinado pela unidade; adicionar proteção de integridade para impedir OS com unidade de outra empresa.
- `pecas_catalogo`: tenant determinado pela unidade; validar que peça e unidade pertencem à mesma empresa.
- `estoque_movimentacoes`: tenant validado em conjunto para unidade, peça e OS; não aceitar referências cruzadas.
- `historico_edicoes`: tenant herdado da OS, com políticas que validam a OS relacionada.
- `dispositivos_acesso`: associação explícita ao membro/empresa ou resolução segura pelo usuário e associação ativa; não usar papel global como autorização de cliente.
- `profiles` e `user_roles`: revisar antes de alterar. Dados de autenticação são globais no Supabase Auth; papel da plataforma deve permanecer separado do papel do tenant.

## Regras de autorização

1. Resolver o tenant no servidor a partir da sessão autenticada e de uma associação ativa; não aceitar `empresa_id` informado pelo navegador como fonte de autoridade.
2. Aplicar RLS a SELECT, INSERT, UPDATE e DELETE em todas as tabelas operacionais.
3. Em UPDATE, validar tanto a linha antiga quanto o novo vínculo para impedir troca de tenant/unidade.
4. Usar chaves estrangeiras compostas ou triggers de integridade para relações entre entidades tenant-scoped.
5. Corrigir todas as funções `SECURITY DEFINER`: `search_path` fixo, privilégios mínimos, tenant resolvido de forma confiável e checagem de tenant em todas as entidades tocadas.
6. Funções com service-role devem validar papel e tenant no servidor antes de executar operações; nunca confiar em RLS para cliente service-role.
7. O administrador da plataforma deve ter papel separado. Acesso de suporte a dados de clientes deve ser explícito, auditado e não automático.
8. Empresa suspensa não pode acessar o aplicativo nem executar RPCs, mesmo com chamada direta à API.
9. Realtime, exports, imports, histórico e notificações precisam respeitar o mesmo escopo.

## Estratégia de migração — não executar ainda

### Fase A — pré-condições

- Export/backup verificável do banco de teste e confirmação de restauração.
- Inventário completo de tabelas, colunas, constraints, views, funções, triggers, policies, grants, Realtime e Storage.
- Matriz de compatibilidade de queries e componentes.
- Definir o tenant inicial que receberá os registros atuais, com UUID confirmado no plano de controle.
- Aprovação específica do usuário para executar no banco operacional de teste.

### Fase B — estrutura aditiva

- Criar tabelas de tenant e membros.
- Adicionar `empresa_id` inicialmente nullable onde aplicável.
- Criar índices e constraints compostas sem remover as antigas.
- Popular apenas com mapeamento explícito e verificável; abortar se houver registros sem unidade ou associação ambígua.
- Verificar contagens e integridade antes de prosseguir.

### Fase C — compatibilidade e segurança

- Implantar helpers de resolução de tenant.
- Atualizar RPCs e funções server-side.
- Criar policies tenant-scoped.
- Revisar e então remover policies globais antigas, em operação coordenada para não deixar acesso global residual.
- Tornar `empresa_id` obrigatório após validação dos dados.

### Fase D — testes negativos e regressão

Criar tenants sintéticos A e B, usuários separados e dados fictícios. Testar que A não consegue ler, criar, alterar, excluir ou inferir dados de B por:
- PostgREST direto;
- RPCs de OS e estoque;
- histórico;
- dispositivos;
- funções administrativas/service-role;
- Realtime;
- importação/exportação;
- queries do dashboard e análise.

Também testar todos os fluxos atuais multiunidade dentro de cada tenant: gestor, ADM, técnico, visualizador, OS, estoque, histórico, importação, transferências e fechamento.

### Fase E — decisão de piloto

Somente após todos os testes aprovados, apresentar relatório, diff final, plano de rollback e solicitar autorização separada para ativar um tenant piloto. Não fazer deploy de produção nem migrar dados oficiais nesta fase.

## Critérios de bloqueio

Interromper sem escrever se:
- backup/restauração não forem comprováveis;
- existir registro sem empresa/unidade resolvida;
- houver policy permissiva global não inventariada;
- RPC privilegiada não tiver tenant check;
- teste negativo permitir qualquer acesso cruzado;
- regressão afetar os fluxos atuais.

## Limites de custo e ambiente

- Usar somente os dois projetos Supabase Free já existentes.
- Não criar projeto adicional, não ativar cobrança e não provisionar cliente real.
- Plano compartilhado é temporário e sujeito aos limites/pausas do Free.
- Produção e o Supabase oficial permanecem fora do escopo.

## Estado atual

Este arquivo é somente um plano. Não contém migration executável e não foi aplicado a banco algum.