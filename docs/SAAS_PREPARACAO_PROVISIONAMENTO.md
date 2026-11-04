# Preparação segura do provisionamento de empresas

**Status:** especificação para o ambiente de teste. Não habilita provisionamento automático.

## Objetivo

Preparar a futura criação de uma instância Supabase isolada por empresa, mantendo a plataforma de controle SaaS separada dos bancos operacionais. A aprovação administrativa da solicitação não equivale à autorização para criar recursos externos.

## Etapas obrigatórias antes de qualquer criação

1. **Validação comercial**
   - Empresa não pode estar suspensa ou encerrada.
   - Deve existir assinatura `trial` ou `ativa` vinculada a plano ativo.
   - Registrar o evento e a decisão na auditoria.

2. **Estimativa de custo e recursos**
   - Consultar os preços e limites vigentes da organização Supabase e da região escolhida no momento da implantação.
   - Registrar plano de infraestrutura, região, recursos previstos, limites e responsável pelo pagamento.
   - Não exibir estimativas fixas ou prometer gratuidade sem consulta atualizada.
   - Bloquear a etapa se custo, faturamento ou capacidade não estiverem confirmados.

3. **Credenciais**
   - Usar token de acesso pessoal do Supabase somente como segredo server-side, em cofre/variável segura.
   - Nunca solicitar, armazenar em tabela pública, registrar em logs ou exibir token no navegador.
   - Validar escopo mínimo necessário e organização de destino antes de qualquer chamada de criação.
   - Não reutilizar chaves privilegiadas do banco de controle como credenciais do tenant.

4. **Preparação técnica**
   - Definir região e convenção de nome do projeto.
   - Aplicar migrations versionadas e validar schema esperado.
   - Configurar Auth, RLS, políticas e chaves públicas do tenant.
   - Criar o primeiro administrador por convite seguro; nunca definir ou mostrar senha manualmente.
   - Executar testes negativos de isolamento entre tenants.

5. **Autorização final humana**
   - Exibir empresa, plano, região, recursos, estimativa atual, organização de destino e impacto financeiro.
   - Exigir confirmação explícita separada da aprovação da solicitação.
   - Registrar administrador, horário, versão da configuração e resumo da autorização na auditoria.
   - Sem essa autorização, nenhuma API de criação de projeto poderá ser chamada.

## Critérios de aceite

- A aprovação atual da solicitação permanece apenas como validação administrativa.
- Não criar projeto Supabase, instância, usuário ou convite durante esta etapa de preparação.
- Não inserir registros fictícios em `instancias`; os campos de referência e URL só existem após a criação real.
- Operações de provisionamento devem ser idempotentes, rastreáveis e executadas exclusivamente no servidor.
- Falhas devem parar o fluxo sem expor segredos e sem marcar a empresa como ativa.
- Testes devem usar exclusivamente o projeto descartável de controle SaaS e tenants de teste autorizados.

## Situação atual

A solicitação da Empresa Teste está aprovada na fila. Isso não confirma custos, não configura credenciais de criação e não autoriza provisionamento. A criação de instâncias permanece desativada até que todos os critérios acima sejam implementados, revisados e autorizados.
