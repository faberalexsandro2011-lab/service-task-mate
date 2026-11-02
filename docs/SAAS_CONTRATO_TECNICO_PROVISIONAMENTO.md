# SaaS — Contrato técnico de provisionamento de instâncias

**Status:** desenho técnico inicial, ainda sujeito a validação.  
**Branch:** `feature/comercial-multiempresa`.  
**Escopo:** especifica entradas, etapas, resultados, idempotência e recuperação de falhas. Não cria projetos Supabase nem altera código, bancos ou ambientes.

## 1. Objetivo e limites

Definir um único fluxo confiável para preparar o ambiente isolado de uma empresa cliente. O provisionador será executado exclusivamente no servidor, com credenciais administrativas protegidas em cofre de segredos.

O navegador pode solicitar a abertura de uma empresa, mas não escolhe projeto Supabase, não envia chaves administrativas e não executa operações privilegiadas.

## 2. Entrada do processo

A solicitação interna de provisionamento deve conter:

- `empresa_id`: identificador interno e imutável da empresa no banco de controle.
- `request_id`: identificador único da solicitação, usado para idempotência.
- `plano_id`: plano comercial aprovado.
- `slug`: identificador de acesso validado e único.
- `nome_projeto`: nome técnico derivado no servidor, não confiado diretamente ao navegador.
- `regiao`: região aprovada pela operação da plataforma.
- `solicitado_por`: operador autenticado que iniciou a operação.
- `modo`: inicialmente `manual_assistido`; automação total somente após testes.

Não aceitar do cliente: URL Supabase, project ref, chave anon/publishable, service_role/secret key, senha de usuário inicial ou SQL arbitrário.

## 3. Pré-validações

Antes de criar qualquer recurso:

1. Confirmar que a empresa existe e está em estado elegível (`contratacao_pendente`).
2. Confirmar que o operador tem permissão de provisionamento.
3. Validar unicidade do slug e do request_id.
4. Confirmar que o plano existe e está aprovado.
5. Confirmar disponibilidade de cota, região e credenciais no cofre.
6. Confirmar que a versão de migrations está aprovada.
7. Registrar evento `provisionamento_solicitado`.

Se qualquer validação falhar, encerrar antes de criar recursos e registrar o motivo.

## 4. Etapas executáveis

Cada etapa deve ser registrada separadamente e poder ser retomada com segurança:

| Etapa | Ação | Evidência de conclusão |
|---|---|---|
| 1 | Reservar slug e instância no banco de controle | Registro único associado à empresa |
| 2 | Criar projeto Supabase na organização/região autorizada | Project ref retornado pelo provedor |
| 3 | Registrar referência do projeto no cofre | Identificador do segredo, nunca o valor |
| 4 | Aplicar migrations aprovadas | Versão do schema confirmada |
| 5 | Aplicar configurações de Auth, RLS e APIs | Checklist de configuração aprovado |
| 6 | Criar Gestor Central inicial por fluxo seguro | Usuário confirmado sem guardar senha em log |
| 7 | Executar testes automatizados de isolamento e funções | Relatório de testes aprovado |
| 8 | Registrar versão e estado `validacao` | Instância pronta para aceite |
| 9 | Após aceite, ativar empresa | Estado `ativa` e evento auditado |

A criação do primeiro usuário deve usar convite ou fluxo de definição de senha. Senhas temporárias não devem ser persistidas em texto puro nem registradas em logs.

## 5. Saída do processo

Em caso de sucesso, retornar ao painel administrativo somente:

- `empresa_id`
- `instancia_id`
- `request_id`
- `status`
- `slug`/endereço de acesso
- `project_ref` ou referência operacional não secreta, quando necessário ao operador
- `schema_version`
- `app_version`
- `started_at`, `finished_at`
- resumo dos testes e identificador do relatório

Nunca retornar secret key, service_role, token de administração ou senha.

## 6. Idempotência e concorrência

- `request_id` deve ter restrição única.
- Uma empresa não pode ter duas instâncias primárias ativas sem decisão explícita de arquitetura.
- Repetir a mesma solicitação deve retomar ou devolver o resultado existente, não criar outro projeto.
- Usar lock/transação no banco de controle para impedir duas execuções simultâneas para a mesma empresa.
- Cada etapa registra `started`, `succeeded` ou `failed`, tentativas, timestamps e código de erro sanitizado.
- Retentativas somente para falhas transitórias e com limite/backoff.
- Não repetir automaticamente operações cujo resultado externo seja desconhecido; primeiro reconciliar com o provedor usando o identificador da operação.

## 7. Recuperação de falhas

- **Falha antes da criação do projeto:** marcar solicitação como falha; liberar reserva de slug somente após verificação.
- **Projeto criado, migrations falharam:** manter instância não ativa, bloquear login público e permitir retomada ou limpeza controlada.
- **Configuração de segurança falhou:** não criar usuário inicial nem ativar.
- **Teste de isolamento falhou:** bloquear ativação, preservar evidências e abrir incidente.
- **Falha ao criar usuário inicial:** manter ambiente em validação; permitir repetir convite sem duplicar identidade.
- **Falha após ativação:** suspender apenas a instância afetada, preservar dados e acionar procedimento de incidente.

A exclusão de projeto é uma ação excepcional, separada do fluxo automático, com confirmação explícita, verificação de backup e trilha de auditoria. Nunca excluir automaticamente por timeout.

## 8. Segurança e auditoria

- Credenciais de provedor em cofre de segredos com acesso mínimo.
- Segredos nunca em variáveis Vite, frontend, Git, mensagens de erro ou logs.
- Operações privilegiadas executadas no backend com autorização por função.
- Todas as chamadas administrativas verificam o operador e a empresa-alvo no servidor.
- Sanitizar logs e não registrar tokens, senhas, chaves ou dados operacionais.
- Separar credenciais por ambiente e rotacionar conforme política.
- MFA obrigatório para operadores com permissão de provisionamento.
- Aplicar RLS e privilégios mínimos na base de controle e em cada instância.

## 9. Estados da solicitação

- `queued`: aguardando execução.
- `validating`: pré-validações em andamento.
- `provisioning`: recursos sendo preparados.
- `testing`: validações técnicas em execução.
- `awaiting_approval`: aguardando aceite operacional.
- `completed`: instância ativada.
- `failed_retryable`: falha transitória com possibilidade de retomada.
- `failed_terminal`: falha que exige intervenção.
- `cancelled`: cancelada antes da ativação.

A situação da solicitação e a situação comercial da empresa são campos distintos. Uma falha de provisionamento não deve marcar a empresa como cancelada nem apagar seu cadastro comercial.

## 10. Critérios de aceite

- [ ] Repetir o mesmo request_id não cria recursos duplicados.
- [ ] Duas solicitações simultâneas para a mesma empresa são serializadas.
- [ ] Falhas em cada etapa deixam estado recuperável e auditável.
- [ ] Nenhuma chave secreta aparece na resposta ou nos logs.
- [ ] Instância nunca fica ativa antes de migrations, segurança e testes.
- [ ] Teste automatizado comprova isolamento entre empresas.
- [ ] Falha ou suspensão de uma empresa não afeta outras.
- [ ] Exclusão de projeto exige fluxo separado e confirmação explícita.

## 11. Decisões pendentes antes da implementação

1. Qual organização Supabase será proprietária dos projetos dos clientes.
2. Quais regiões serão permitidas e como tratar residência de dados.
3. Qual cofre de segredos será adotado.
4. Qual serviço backend executará o provisionador.
5. Se o primeiro ciclo será manual assistido ou automatizado.
6. Como será feita a aprovação humana antes de ativar a instância.
7. Qual provedor e limite de criação de projetos serão usados.

**Recomendação:** implementar primeiro um provisionamento manual assistido e reproduzível em ambiente descartável de homologação. Automatizar criação e recuperação somente depois de comprovar idempotência, isolamento e restauração.
