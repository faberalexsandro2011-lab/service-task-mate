# SaaS Central OS — Acesso seguro do administrador da plataforma

## 1. Objetivo

Definir o acesso administrativo ao painel SaaS da plataforma Central OS, separado dos acessos Gestor Central, ADM de Unidade e Técnico das empresas clientes.

## 2. Decisão recomendada

- Criar uma identidade administrativa exclusiva da plataforma.
- Não reutilizar automaticamente o usuário Gestor Central de uma empresa cliente.
- Exigir MFA (preferencialmente TOTP por aplicativo autenticador) para administradores da plataforma.
- Não habilitar cadastro público de administradores.
- Criar o primeiro administrador por procedimento controlado, com convite e validação.
- Usar sessão com expiração e revogação; aplicar reautenticação para ações críticas.
- Registrar login, falhas relevantes e operações administrativas em auditoria.

## 3. Arquitetura de autenticação

1. O navegador acessa o domínio reservado ao painel da plataforma.
2. O backend valida a identidade e o papel administrativo.
3. O MFA é validado antes de liberar o painel.
4. O backend emite/valida uma sessão segura, com cookies HttpOnly, Secure e política SameSite apropriada quando aplicável.
5. Cada operação administrativa valida autorização no servidor; ocultar botões não é controle de segurança.
6. Ações críticas exigem MFA recente, confirmação explícita e justificativa.

A implementação final deve escolher um provedor de identidade adequado e validar os fluxos de recuperação, revogação e auditoria.

## 4. Papéis iniciais

### Administrador da plataforma
- gerencia empresas, planos, assinaturas e instâncias;
- administra operadores;
- executa ações críticas autorizadas;
- consulta auditoria.

### Operador de provisionamento (futuro)
- acompanha e executa provisionamentos;
- não administra operadores nem políticas globais;
- não recebe acesso irrestrito aos dados operacionais dos clientes.

### Auditor (futuro)
- somente leitura de trilhas e relatórios;
- sem provisionar, suspender ou alterar instâncias.

Na primeira versão, pode existir somente o Administrador da plataforma. A estrutura deve permitir separar esses papéis posteriormente.

## 5. Proteções obrigatórias

- MFA obrigatório para administrador.
- Recuperação de conta controlada e auditada.
- Sem senha padrão ou credenciais compartilhadas.
- Limite e monitoramento de tentativas de login.
- Revogação de sessões e dispositivos.
- Reautenticação antes de suspensão, encerramento, restauração ou rotação de credenciais.
- Auditoria sem registrar senha, código MFA, token ou segredo.
- Segredos de infraestrutura guardados no servidor/cofre.
- Acesso de emergência (break-glass), se necessário, com uso excepcional, alerta e auditoria.

## 6. Recuperação e contingência

- Definir previamente quem pode recuperar o administrador.
- Guardar códigos de recuperação de MFA em local seguro, fora do banco operacional.
- Testar recuperação sem desabilitar MFA permanentemente.
- Se houver administrador único, planejar uma segunda identidade de emergência protegida e não compartilhada.
- Toda recuperação deve registrar responsável, motivo, data e resultado.

## 7. Checklist de aceite

- [ ] Domínio do painel definido.
- [ ] Provedor de identidade definido.
- [ ] MFA obrigatório e testado.
- [ ] Primeiro administrador criado por convite controlado.
- [ ] Cadastro público desativado.
- [ ] Sessões e revogação testadas.
- [ ] Reautenticação de ações críticas testada.
- [ ] Auditoria de autenticação e ações administrativas validada.
- [ ] Recuperação de conta e acesso de emergência testados.
- [ ] Nenhuma credencial secreta exposta no frontend.

## 8. Fora do escopo

Este documento não cria login, usuário, provedor de autenticação, banco, domínio ou configuração de MFA. Não altera o Central OS operacional de teste nem o aplicativo oficial.
