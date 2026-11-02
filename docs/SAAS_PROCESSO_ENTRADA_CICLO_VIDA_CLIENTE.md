# SaaS — Processo de entrada e ciclo de vida do cliente

**Status:** proposta operacional para revisão.  
**Escopo:** documentação da branch `feature/comercial-multiempresa`. Não cria empresas, projetos Supabase, contas, cobranças ou ambientes.

## 1. Princípio de operação

Cada empresa cliente terá uma instância operacional isolada em um projeto Supabase próprio. O Central OS será mantido como uma aplicação compartilhada, que identifica a empresa e conecta o usuário somente à instância autorizada.

O banco de controle da plataforma guarda cadastro comercial e metadados de provisionamento. Ele não deve armazenar OS, estoque, materiais, usuários operacionais ou senhas dos clientes.

## 2. Etapas para ativar um cliente

1. **Cadastro comercial**
   - Registrar razão/nome da empresa, identificador curto, contato responsável e situação contratual.
   - Escolher plano e limites aprovados.
   - Definir o endereço de acesso da empresa (subdomínio ou código).
2. **Provisionamento da instância**
   - Criar projeto Supabase em organização e região aprovadas.
   - Guardar credenciais administrativas em cofre de segredos, nunca no navegador ou no repositório.
   - Aplicar migrations versionadas e políticas RLS.
   - Registrar no banco de controle apenas referência/identificador da instância, região, versão do schema e estado; segredos ficam no cofre.
3. **Configuração inicial**
   - Criar a primeira unidade e o usuário Gestor Central da empresa por fluxo administrativo seguro.
   - Aplicar limites do plano.
   - Configurar domínio/identificador e testar resolução da empresa.
4. **Validação antes da entrega**
   - Testar login, recuperação de acesso, papéis e permissões.
   - Testar isolamento entre duas empresas de teste.
   - Testar OS, histórico, estoque, materiais, exportação e atualização.
   - Confirmar backup e procedimento de restauração.
5. **Ativação**
   - Marcar instância como ativa somente após aprovação dos testes.
   - Entregar endereço, orientações de primeiro acesso e canal de suporte.
   - Registrar versão da aplicação e do banco entregue.

## 3. Estados sugeridos

- `lead`: contato recebido, ainda sem contrato.
- `contratacao_pendente`: plano/condições em confirmação.
- `provisionando`: recursos sendo criados.
- `validacao`: testes de segurança e funcionamento.
- `ativa`: cliente liberado para uso.
- `suspensa`: acesso bloqueado por decisão administrativa/contratual; dados preservados.
- `cancelamento_pendente`: encerramento solicitado, aguardando exportação e confirmação.
- `encerrada`: acesso encerrado após política de retenção e destino dos dados definidos.
- `falha_provisionamento`: operação interrompida; exige diagnóstico, sem ativação automática.

Mudanças de estado devem gerar evento de auditoria com responsável, data, estado anterior, novo estado e motivo. A suspensão não deve apagar dados nem excluir o projeto.

## 4. Limites e cobrança

- Aplicar limites de usuários ativos e unidades conforme o plano contratado.
- Estoque e controle de materiais fazem parte de todos os planos, inclusive Essencial.
- Não limitar artificialmente a quantidade de OS ou o histórico.
- Não bloquear nem apagar dados automaticamente ao exceder um limite: sinalizar o excesso e encaminhar para regularização/upgrade.
- Valores, ciclo de cobrança, meios de pagamento, período de teste e carência ainda precisam de decisão comercial.
- A aplicação não deve armazenar dados completos de cartão. Se houver cobrança online, usar um provedor de pagamentos.

## 5. Suspensão, cancelamento e saída

1. Registrar solicitação e responsável.
2. Informar prazo e formato de exportação.
3. Gerar exportação dos dados operacionais e validar sua integridade.
4. Confirmar com o cliente o recebimento ou destino dos dados.
5. Encerrar credenciais e acesso conforme política aprovada.
6. Preservar ou excluir a instância somente após prazo de retenção definido e autorização registrada.
7. Guardar evento de auditoria sem reter dados pessoais além do necessário.

## 6. Atualizações e suporte

- Manter versão de aplicação e versão de schema por instância.
- Testar migrations em ambiente de homologação antes de aplicar em clientes.
- Fazer rollout gradual, com backup e plano de reversão.
- Registrar resultado por instância; falha em uma empresa não pode interromper ou alterar dados de outra.
- Mudanças incompatíveis exigem janela de manutenção e comunicação prévia.

## 7. Controles obrigatórios

- Resolução da empresa no servidor, sem aceitar URL ou chave Supabase arbitrária enviada pelo navegador.
- Nunca expor chave secreta/service_role no frontend.
- RLS e testes de autorização em todas as tabelas expostas.
- Separação de sessões, cache, IndexedDB/offline e canais Realtime por empresa.
- Auditoria para provisionamento, suspensão, alteração de plano e operações administrativas.
- MFA para operadores da plataforma e acesso administrativo restrito.
- Backups testados, restauração documentada e plano de resposta a incidentes.
- Processo LGPD para atendimento de titulares, exportação, retenção e eliminação.

## 8. Critérios para considerar o SaaS pronto para o primeiro cliente

- [ ] Provisionamento repetível e idempotente.
- [ ] Empresa A não consegue ler ou alterar dados da empresa B.
- [ ] Suspender uma empresa não afeta as demais.
- [ ] Nenhum segredo administrativo chega ao navegador.
- [ ] Backup e restauração testados.
- [ ] Atualização de schema testada em cópia/homologação.
- [ ] Exportação e encerramento documentados.
- [ ] Monitoramento e suporte operacional definidos.
- [ ] Contrato, privacidade, retenção e preços revisados.

## 9. Decisões ainda necessárias

- Organização e região onde ficarão os projetos dos clientes.
- Se cada cliente terá produção e homologação separadas.
- Provedor de pagamentos e regras de inadimplência/carência.
- Duração de eventual período de teste.
- Prazo de retenção após cancelamento.
- Quem será operador da plataforma e quais ações poderá executar.
- Provisionamento inicialmente manual assistido ou totalmente automatizado.

**Próxima etapa técnica recomendada:** desenhar o contrato de provisionamento (entrada, validações, resultado e recuperação de falha) antes de criar qualquer projeto de cliente ou alterar o código da aplicação.
