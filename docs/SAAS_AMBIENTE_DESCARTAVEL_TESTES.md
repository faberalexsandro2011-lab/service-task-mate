# Preparação do ambiente descartável de testes SaaS

**Status:** plano de preparação; infraestrutura ainda não criada. A criação de projeto Supabase exige escolher a organização e revisar eventual custo antes de prosseguir.

## Isolamento obrigatório
- Não reutilizar o projeto Supabase oficial, o projeto operacional de teste ou o projeto FaberClean.
- Criar um projeto Supabase novo e descartável, dedicado exclusivamente aos testes SaaS, após aprovação de organização e custo.
- Não conectar esse projeto ao domínio oficial nem ao painel em produção.
- Não copiar usuários, OS, anexos, senhas, tokens ou qualquer dado real.

## Dados sintéticos
Preparar duas empresas fictícias:
- `empresa-alpha-teste`
- `empresa-beta-teste`

Em cada empresa, criar dados artificiais independentes e usuários fictícios para os papéis Gestor Central, ADM Unidade e Técnico. Criar também identidades administrativas fictícias no controle, sem usar contas pessoais reais.

## Sequência de preparação
1. Confirmar a organização Supabase de destino e estimar custo/recorrência.
2. Criar projeto novo somente após a confirmação exigida pelo provedor.
3. Registrar região, identificador, versão PostgreSQL e estado inicial.
4. Aplicar migrations revisadas em ordem e registrar checksums.
5. Ativar RLS em todas as tabelas expostas e revisar grants/policies.
6. Configurar Auth sem cadastro público; usar somente contas fictícias.
7. Inserir dados sintéticos das duas empresas.
8. Preparar scripts de teste para leitura, escrita, exclusão, anexos, realtime e endpoints.
9. Executar a matriz SEC-01 a SEC-25 e guardar evidências sanitizadas.
10. Destruir o ambiente somente após exportar evidências e confirmar que não contém dados necessários.

## Verificações iniciais
- Tabelas expostas têm RLS habilitado.
- Políticas restringem por vínculo e papel, não apenas por sessão autenticada.
- UPDATE inclui `USING` e `WITH CHECK` adequados.
- Views não contornam RLS; usar `security_invoker` quando aplicável.
- Funções privilegiadas têm permissões mínimas e não são executáveis por `anon`/`PUBLIC` sem necessidade.
- Nenhuma chave `service_role`/secret aparece em código cliente, logs ou repositório.
- Storage, realtime e Edge Functions respeitam o mesmo isolamento.

## Critério para começar os testes
Só iniciar quando projeto, migrations, dados sintéticos, contas e políticas estiverem identificados e revisados. Falha em qualquer verificação crítica bloqueia os testes funcionais e a evolução para piloto.

## Aprovação pendente
Para criar o projeto descartável, o usuário precisa escolher a organização Supabase de destino. Depois será consultado o custo; qualquer valor não zero será apresentado para aprovação antes da criação.

## Limites
Este documento não cria projeto, branch de banco, usuários, tabelas, políticas, secrets, domínio ou deployment. Não modifica os projetos existentes.
