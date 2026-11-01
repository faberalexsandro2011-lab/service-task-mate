# Central OS Comercial — arquitetura multiempresa

## Objetivo
Preparar o Central OS para comercialização como SaaS, mantendo o aplicativo atual de teste e o ambiente oficial isolados.

## Modelo recomendado
- Um projeto Supabase independente por empresa cliente.
- Um plano de controle central, separado dos bancos operacionais dos clientes.
- Cada instância de cliente recebe o mesmo código do Central OS e suas próprias variáveis de ambiente.
- O provisionamento é feito por serviço de backend com credenciais administrativas guardadas em segredo; nunca pelo navegador.

## Plano de controle
Entidades propostas:
- empresas: id, nome, cnpj (opcional), slug, status, plano_id, criado_em.
- planos: id, nome, limites e recursos contratados.
- assinaturas: empresa_id, plano_id, status, inicio_em, renovacao_em.
- instancias: empresa_id, provedor, projeto_id, url_api, status, versao_schema.
- eventos_provisionamento: empresa_id, etapa, status, detalhe seguro, criado_em.

Não guardar senha de banco, service_role key ou token administrativo em tabelas acessíveis ao cliente. Segredos devem ficar em cofre/variáveis protegidas do backend.

## Provisionamento
1. Criar empresa no plano de controle.
2. Validar contratação e limites.
3. Backend cria projeto Supabase na organização escolhida.
4. Aplicar migrations versionadas do Central OS.
5. Criar primeiro usuário gestor da empresa por fluxo administrativo seguro.
6. Guardar URL e credenciais públicas necessárias para a instância; manter service_role apenas no servidor.
7. Publicar/atribuir instância e executar testes de isolamento e acesso.
8. Registrar backup, política de retenção, exportação e encerramento.

## Segurança obrigatória
- Separação física por projeto Supabase para cada cliente.
- Nunca compartilhar service_role keys entre navegador e cliente.
- Não permitir que usuário selecione ou altere o project_id de conexão.
- Provisionamento idempotente, logs sem segredos, limites de uso e proteção contra abuso.
- Backups e teste de restauração antes de vender.
- Processo documentado de exportação e exclusão ao encerrar contrato.
- MFA para equipe administrativa e trilha de auditoria.
- Revisão jurídica/LGPD: controlador, operador, suboperadores, retenção, incidentes e contrato.

## Estratégia de implantação
Fase 1: desenho e inventário do schema/migrations atuais.
Fase 2: separar plano de controle e instância operacional.
Fase 3: criar provisionador backend e automação de migrations.
Fase 4: onboarding de empresa e primeiro gestor.
Fase 5: testes com empresa fictícia, exportação, restauração e isolamento.
Fase 6: piloto comercial. Nenhuma promoção para produção sem aprovação explícita.

## Limites desta primeira etapa
Este documento não cria projetos, não migra dados, não altera banco algum e não modifica os ambientes oficial ou de teste.