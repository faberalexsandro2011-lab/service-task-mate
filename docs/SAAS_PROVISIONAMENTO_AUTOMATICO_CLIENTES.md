# Provisionamento de novos clientes — especificação SaaS

**Status:** desenho técnico; não implementado. O provisionamento inicial deve permanecer assistido até que os testes automatizados e controles de segurança sejam aprovados.

## Objetivo
Criar uma instância isolada para cada empresa cliente, com banco/projeto próprio, schema na versão suportada e primeiro acesso administrativo por convite seguro.

## Pré-requisitos
- Empresa cadastrada e validada no painel de controle.
- Plano e limites definidos.
- Aprovação explícita para iniciar o provisionamento.
- Credenciais de automação armazenadas somente em cofre/backend.
- Template de schema versionado e migrations revisadas.
- Procedimento de rollback/recuperação testado.

## Etapas do fluxo
1. **Solicitação:** registrar empresa, plano, solicitante, chave de idempotência e motivo.
2. **Validação:** verificar duplicidade, elegibilidade, limites e disponibilidade dos recursos.
3. **Criação da instância:** backend cria o projeto/banco isolado usando credenciais protegidas.
4. **Configuração:** aplicar migrations versionadas, extensões necessárias, RLS, políticas e funções.
5. **Verificação:** executar testes de isolamento, permissões, autenticação, integridade e conectividade.
6. **Convite inicial:** criar convite de primeiro Gestor Central sem definir ou revelar senha.
7. **Aprovação:** operador autorizado revisa os resultados e aprova a ativação.
8. **Ativação:** registrar estado ativo e disponibilizar ao app somente URL pública e chave publicável necessárias.

## Estados da operação
`solicitado` → `validando` → `provisionando` → `configurando` → `testando` → `aguardando_aprovacao` → `concluido`.

Falhas devem registrar etapa, código e log sanitizado; nunca registrar tokens, senhas ou chaves. Retentativas devem ser seguras e idempotentes. Operações parciais precisam de procedimento explícito de retomada ou limpeza autorizada.

## Controles obrigatórios
- Isolamento físico/lógico por projeto de cliente; não compartilhar tabelas operacionais entre clientes.
- Nenhuma chave privilegiada no navegador ou no repositório.
- RLS e privilégios mínimos verificados por testes automatizados.
- Auditoria de cada etapa, ator, horário, resultado e motivo.
- Limites do plano validados no backend.
- Backup e restauração testados antes de produção.
- Não ativar automaticamente após falha ou teste incompleto.

## Recuperação e operação manual
- Falha antes da criação: corrigir dados e reenviar com a mesma chave idempotente.
- Falha após criação: retomar da etapa registrada ou executar limpeza somente após aprovação.
- Falha em migration: interromper ativação, preservar logs sanitizados e aplicar plano de recuperação revisado.
- Indisponibilidade do provedor: manter solicitação pendente, sem criar instâncias duplicadas.

## Critérios de aceite
- Repetir a mesma solicitação não cria instância duplicada.
- Cliente A não acessa dados, usuários ou arquivos do cliente B.
- Primeiro administrador entra por convite e configura autenticação segura.
- RLS, papéis, limites e auditoria passam nos testes.
- Backup/restauração e recuperação de falha foram demonstrados.

## Fora do escopo
Nenhum projeto Supabase, banco, usuário, convite, domínio, segredo ou deployment foi criado ou alterado por este documento.
