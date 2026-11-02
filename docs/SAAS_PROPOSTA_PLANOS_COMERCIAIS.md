# Proposta inicial de planos comerciais — Central OS SaaS

Branch: `feature/comercial-multiempresa`

## Objetivo

Propor uma estrutura simples de planos para validar o modelo comercial. Os limites abaixo são **sugestões iniciais**, não preços ou condições aprovadas. Nenhuma cobrança será habilitada nesta etapa.

## Planos sugeridos

| Recurso / limite | Essencial | Profissional | Corporativo |
|---|---:|---:|---:|
| Usuários ativos | até 10 | até 30 | sob contrato |
| Unidades operacionais | 1 | até 5 | sob contrato |
| Gestores/ADMs | até 2 | até 8 | sob contrato |
| Técnicos | incluídos no limite de usuários | incluídos no limite de usuários | sob contrato |
| Ordens de serviço | sem limite artificial inicial | sem limite artificial inicial | sem limite artificial inicial |
| Gestão de OS | Sim | Sim | Sim |
| Histórico e relatórios | Básico | Completo | Completo |
| Análise técnica | Básica | Completa | Completa |
| Estoque e materiais | Sim | Sim | Sim |
| Importação de planilhas | Sim | Sim | Sim |
| Exportação de relatórios | Básica | Completa | Completa |
| Suporte | Horário comercial, padrão | Prioritário | Contratual |
| Backup e restauração | Política padrão da plataforma | Política padrão + prioridade | Política contratual |
| Ambiente de homologação | Não incluído inicialmente | Opcional | Conforme contrato |

## Definição recomendada para a primeira versão comercial

Para evitar complexidade prematura:

- Começar com dois planos públicos: **Essencial** e **Profissional**.
- Manter **Corporativo** como plano sob consulta, para empresas com muitas unidades, usuários ou integrações.
- Cobrar por faixa de usuários ativos e unidades, não por quantidade de OS, para não desestimular o uso do sistema.
- Não limitar artificialmente o histórico de OS do cliente.
- Tratar armazenamento de anexos, tráfego e integrações externas como itens com política própria, após medir consumo real.
- Oferecer implantação assistida como serviço separado, se houver configuração/importação inicial relevante.

## Regras que precisam ser definidas

1. **Usuário ativo:** conta habilitada que pode autenticar; contas desativadas não contam.
2. **Unidade:** unidade operacional cadastrada na instância do cliente.
3. **Limite excedido:** bloquear novos cadastros que ultrapassem o limite, sem apagar nem desativar automaticamente dados existentes.
4. **Upgrade:** liberar os novos limites após confirmação da alteração comercial.
5. **Downgrade:** não excluir usuários ou unidades; sinalizar excedente e orientar regularização.
6. **Atraso de pagamento:** definir período de tolerância e avisos antes de suspender acesso.
7. **Cancelamento:** manter exportação dos dados e prazo de retenção definidos em contrato e política LGPD.
8. **Trial:** decidir se haverá período gratuito, duração e limites.

## Campos de plano previstos no controle SaaS

Além dos campos gerais documentados em `SAAS_MODELO_LOGICO_BANCO_CONTROLE.md`, considerar:

- `limite_usuarios`
- `limite_unidades`
- `limite_gestores` (se a regra comercial separar gestores)
- `recursos` como flags versionadas, por exemplo análise avançada, estoque, exportação e homologação
- `suporte_nivel`
- `trial_disponivel`

Evitar colocar regras de autorização críticas apenas em JSON ou no frontend. O backend deve validar limites e recursos; as permissões operacionais continuam aplicadas no banco de cada cliente.

## Preço e cobrança

Não foram definidos valores. Antes de precificar, medir:
- custo mensal real de cada projeto Supabase por cliente;
- custo de hospedagem, monitoramento, backups e suporte;
- tempo de implantação e atendimento;
- margem desejada e impostos;
- custo de meios de pagamento e inadimplência.

A cobrança recorrente e integração com gateway ficam fora desta etapa. Não armazenar dados de cartão no Central OS.

## Decisões para aprovação

- Confirmar se os limites sugeridos de 10 usuários/1 unidade e 30 usuários/5 unidades fazem sentido para o público-alvo.
- Definir se estoque será incluído no Essencial ou reservado ao Profissional.
- Definir se haverá trial e sua duração.
- Definir política de tolerância para atraso e cancelamento.
- Definir se homologação será adicional ou exclusiva do Corporativo.

## Limites desta etapa

Somente proposta documental na branch comercial. Não foram criados planos no banco, preços, assinaturas, cobrança, projetos Supabase, migrations ou deployments. Nenhum dado do ambiente operacional foi alterado.
