# Matriz de testes de segurança e isolamento — Central OS SaaS

**Status:** plano de testes documentado; execução pendente. Nenhum teste foi executado contra bancos oficiais ou operacionais.

## Ambientes de teste
- Usar projetos Supabase descartáveis e dados sintéticos para Empresa A e Empresa B.
- Criar usuários fictícios com papéis distintos: Gestor Central, ADM Unidade, Técnico e administrador da plataforma.
- Não importar dados, usuários, senhas, tokens ou anexos reais.
- Registrar versão do app, migrations, configuração e evidências sanitizadas.

## Casos de teste

| ID | Área | Cenário | Resultado esperado |
|---|---|---|---|
| SEC-01 | Identificação | Slug de empresa inexistente | Acesso negado sem revelar instâncias existentes |
| SEC-02 | Identificação | Empresa suspensa | Login/entrada bloqueados conforme política |
| SEC-03 | Isolamento | Usuário A consulta OS da empresa B | Nenhum dado de B retornado |
| SEC-04 | Isolamento | Usuário A tenta alterar OS de B por ID direto | Operação negada no backend/RLS |
| SEC-05 | Isolamento | Acessar anexos/arquivos de B | Acesso negado |
| SEC-06 | Papéis | Técnico tenta ação de Gestor Central | Ação negada no servidor |
| SEC-07 | Papéis | ADM tenta editar unidade alheia | Ação negada no servidor |
| SEC-08 | Papéis | Gestor Central atua dentro das permissões | Ação permitida e auditada |
| SEC-09 | Painel | Usuário de cliente abre rota administrativa SaaS | Acesso negado |
| SEC-10 | Painel | Suporte tenta ação fora do escopo | Ação negada e auditada |
| SEC-11 | MFA | Administrador sem segundo fator válido | Sessão privilegiada não concedida |
| SEC-12 | Sessão | Sessão revogada tenta reutilização | Acesso negado |
| SEC-13 | Autenticação | Tentativas repetidas de login | Rate limit/controle de abuso aplicado |
| SEC-14 | Segredos | Inspecionar bundle e tráfego do navegador | Nenhum segredo privilegiado exposto |
| SEC-15 | API | Enviar company_id de outra empresa no payload | Backend ignora/valida contexto e nega acesso |
| SEC-16 | RLS | Consultar tabelas sem vínculo válido | Nenhuma linha não autorizada retornada |
| SEC-17 | Provisionamento | Reenviar mesma chave idempotente | Não cria instância duplicada |
| SEC-18 | Provisionamento | Falha no meio da configuração | Estado parcial rastreável; não ativa cliente |
| SEC-19 | Atualização | Migration falha | Onda interrompida e recuperação documentada |
| SEC-20 | Backup | Restaurar backup em ambiente isolado | Dados e integridade verificados |
| SEC-21 | Auditoria | Ação administrativa crítica | Ator, escopo, horário, motivo e resultado registrados |
| SEC-22 | Logs | Provocar erro de autenticação/provisionamento | Tokens, senhas e chaves não aparecem nos logs |
| SEC-23 | Limites | Exceder usuários/unidades do plano | Backend bloqueia operação e informa limite |
| SEC-24 | Suspensão | Empresa suspensa tenta usar API diretamente | Acesso bloqueado também no backend |
| SEC-25 | Exportação/exclusão | Solicitação de titular em ambiente sintético | Processo controlado, auditado e verificável |

## Critérios de aprovação
- 100% dos testes críticos SEC-03 a SEC-16 aprovados.
- Nenhuma exposição cruzada entre empresas, inclusive por ID direto, arquivos, realtime ou endpoints.
- Nenhuma chave privilegiada no cliente.
- MFA e revogação de sessão comprovados para administradores.
- Provisionamento repetido não duplica recursos.
- Restauração de backup comprovada.
- Falhas bloqueiam ativação e deixam trilha de auditoria.
- Achados críticos corrigidos e retestados antes do piloto.

## Evidências por execução
Registrar: ID do teste, data, versão, ambiente descartável, usuário/papel sintético, passos, resultado esperado/obtido, evidência sanitizada, severidade e responsável. Não incluir tokens, senhas ou dados pessoais.

## Processo de falhas
1. Classificar severidade e impacto.
2. Interromper piloto/liberação quando houver falha crítica de isolamento ou autorização.
3. Corrigir no branch isolado e repetir o teste afetado e regressões relacionadas.
4. Registrar aprovação técnica antes de avançar.

## LGPD — checklist de revisão
- Mapear dados pessoais e finalidade por funcionalidade.
- Definir base legal e transparência contratual com assessoria adequada.
- Minimizar coleta e controlar acesso por função.
- Definir retenção, exportação, correção e exclusão.
- Formalizar papéis de controlador/operador e contratos com fornecedores.
- Definir canal e processo de incidentes e solicitações de titulares.
- Avaliar transferência internacional e suboperadores, quando aplicável.

## Limites
Esta matriz não comprova que os controles já existem. Os testes ainda não foram executados. A execução deverá ocorrer exclusivamente em infraestrutura descartável e sintética, após preparação e autorização; nunca no app oficial ou no ambiente operacional de teste.
