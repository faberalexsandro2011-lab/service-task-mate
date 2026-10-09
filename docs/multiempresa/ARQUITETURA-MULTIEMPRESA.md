# Arquitetura proposta para vender o Central OS a várias empresas

## Objetivo e limite desta proposta

Permitir que empresas diferentes usem o mesmo produto sem compartilhar ordens de serviço, técnicos, estoque, histórico, anexos ou solicitações. Este documento é uma proposta de implementação e revisão; não altera o banco atual e não autoriza migration em produção.

## Estado observado

- A busca no código da branch `play-store-prep` não encontrou referências a `empresa_id`, `tenant_id` ou `organization_id`.
- A auditoria anterior das políticas RLS no projeto Supabase conectado encontrou permissões por papéis globais/e-mail, mas esse projeto ainda não foi confirmado como o banco usado pelo domínio público.
- Há identificadores Supabase divergentes no repositório. Nenhuma alteração deve ser feita até confirmar qual projeto é produção.
- Portanto, o isolamento multiempresa ainda não está demonstrado e a venda multiempresa deve ficar bloqueada até a implementação e os testes abaixo.

## Modelo lógico proposto (a validar)

1. `empresas`: identificador UUID, nome comercial, estado da conta, plano e timestamps.
2. `membros_empresa`: empresa, usuário Auth, papel dentro daquela empresa, estado do convite e timestamps. Restrições únicas evitam duplicação de membro.
3. Todas as entidades de negócio (OS, itens/peças, movimentos de estoque, histórico, solicitações e anexos) devem pertencer a uma empresa, diretamente ou por uma relação cuja pertença possa ser verificada sem ambiguidade.
4. Usuários podem pertencer a uma ou mais empresas somente se o produto realmente exigir isso; a empresa ativa deve ser validada no servidor e não pode ser considerada confiável apenas porque veio do cliente.
5. Administradores da plataforma e administradores de uma empresa são papéis diferentes. Ser gestor em uma empresa não concede acesso aos dados de outra.

Este modelo é uma direção arquitetural, não uma migration pronta. A estrutura real deve ser ajustada às tabelas, relacionamentos, RPCs e funções existentes após uma auditoria completa.

## Requisitos de segurança obrigatórios

- Ativar e revisar RLS em cada tabela acessível pela API.
- Cada SELECT, INSERT, UPDATE e DELETE deve comprovar associação ativa do usuário à empresa dona do registro.
- Em UPDATE/DELETE, validar tanto a linha antiga quanto a nova empresa para impedir transferir registros entre empresas por alteração de ID.
- RPCs `SECURITY DEFINER`, triggers, views, storage policies, funções de pesquisa e tarefas agendadas devem aplicar o mesmo limite de empresa.
- Nunca confiar em `empresa_id`, papel, e-mail ou ID de usuário fornecido pelo navegador sem validar no servidor.
- Cadastro público não deve permitir que qualquer pessoa crie uma empresa com privilégios administrativos sem fluxo seguro de provisionamento.
- Segredos e service-role nunca devem ser distribuídos no aplicativo web ou Android.
- Logs, mensagens de erro, exportações e notificações não podem revelar dados de outras empresas.

## Plano seguro de implementação

1. Confirmar por configuração do deploy qual URL/ref Supabase o domínio oficial utiliza; não deduzir produção a partir do arquivo `.env` do repositório.
2. Criar ou selecionar um projeto Supabase de TESTE separado, sem dados reais.
3. Documentar esquema, chaves estrangeiras, políticas RLS, funções RPC, triggers, storage e jobs atuais.
4. Preparar migrations versionadas apenas para o projeto de teste; preservar as tabelas e os registros existentes em produção.
5. Criar dados fictícios de Empresa A e Empresa B, cada uma com usuários, OS, peças, estoque, histórico e anexos.
6. Testar acesso permitido e negado com contas independentes, incluindo chamadas diretas à API/RPC e tentativas de mudar o ID da empresa.
7. Fazer revisão de segurança e validar backup/restauração antes de propor qualquer migração real.
8. Só depois de aprovação explícita do proprietário, planejar migração gradual da produção, com backup restaurável e plano de reversão.

## Testes mínimos de isolamento

- Membro da Empresa A não lista, lê, edita, finaliza, exclui ou exporta registros da Empresa B.
- Usuário da Empresa A não pode associar uma peça da Empresa B à OS da Empresa A.
- Usuário não pode trocar o campo da empresa de um registro para acessar outra empresa.
- Histórico e auditoria não expõem alterações de outras empresas.
- RPCs privilegiadas recusam chamadas sem associação ativa e validam cada identificador recebido.
- Arquivos e URLs de armazenamento não permitem acesso cruzado.
- Usuário removido da empresa perde acesso imediatamente.
- Administrador de empresa só administra membros e dados da sua própria empresa.
- Os testes de isolamento passam com duas empresas fictícias em um ambiente de teste limpo.

## Critério de liberação comercial

Não abrir cadastro público, vender licenças multiempresa ou publicar uma versão comercial até todos os testes de isolamento passarem e o ambiente de produção estar identificado com certeza.

## Estado atual

Proposta documentada para revisão. Nenhuma migration foi executada, nenhum dado de produção foi alterado e nenhum deploy foi realizado por este documento.
