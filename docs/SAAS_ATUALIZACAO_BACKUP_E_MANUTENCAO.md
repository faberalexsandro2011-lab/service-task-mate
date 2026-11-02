# Atualização e manutenção das instâncias SaaS

**Status:** especificação operacional; não implementada.

## Princípios
- Cada cliente mantém instância e dados isolados.
- Nenhuma migration é aplicada diretamente em produção sem validação, backup e aprovação.
- Versões de schema e aplicação devem ser rastreáveis por instância.
- Atualizações devem ser compatíveis, graduais e recuperáveis.

## Ciclo de atualização
1. Preparar release com código, migrations, notas e plano de reversão.
2. Executar análise estática, testes unitários, integração e segurança.
3. Aplicar migrations em ambiente descartável e validar dados de exemplo.
4. Executar testes de regressão e isolamento entre empresas.
5. Fazer backup verificável da instância piloto.
6. Atualizar uma instância piloto autorizada e monitorar.
7. Avaliar métricas e erros; interromper a onda se houver regressão.
8. Atualizar demais instâncias em lotes, respeitando janelas acordadas.
9. Confirmar versão, integridade, saúde e auditoria de cada cliente.

## Compatibilidade de migrations
- Preferir mudanças aditivas: criar coluna/tabela, preencher, migrar leitura/escrita e só depois remover estruturas antigas.
- Evitar renomeações ou remoções imediatas que quebrem versões anteriores.
- Toda migration deve ter identificador único, ordem definida e checksum.
- Migrations devem ser idempotentes quando possível; operações não idempotentes precisam de controle transacional e registro de execução.
- Nunca alterar ou apagar dados de negócio como efeito colateral não documentado.

## Backup e recuperação
- Definir RPO e RTO por plano antes de vender níveis de disponibilidade.
- Automatizar backups conforme recursos e política contratados.
- Criptografar backups e restringir acesso.
- Testar restauração periodicamente em ambiente isolado.
- Registrar sucesso, falha, retenção e teste de restauração.
- Não declarar backup válido sem teste de restauração.

## Monitoramento
Acompanhar por instância: disponibilidade, latência, erros, uso de banco/armazenamento, conexões, jobs, versão do schema, último backup e falhas de autenticação. Alertas devem evitar conteúdo sensível.

## Incidentes e rollback
- Suspender a onda de atualização ao detectar falha relevante.
- Classificar impacto por cliente e preservar evidências sanitizadas.
- Preferir correção compatível para frente; rollback de banco só após avaliar perda/consistência de dados.
- Se restauração for necessária, obter aprovação, comunicar impacto e registrar responsável, horário e resultado.

## Manutenção de cliente
- Mudanças de plano atualizam limites no backend e geram auditoria.
- Suspensão bloqueia acesso conforme política contratual, sem apagar dados.
- Reativação exige validar assinatura e saúde da instância.
- Cancelamento segue política de exportação, retenção e exclusão aprovada; não excluir automaticamente sem prazo, aviso e autorização definidos.

## Critérios de aceite
- Release rastreável e testada em ambiente isolado.
- Backup e restauração comprovados.
- Atualização piloto aprovada antes de lotes.
- Plano de interrupção e recuperação documentado.
- Estado e versão atualizados no painel e na auditoria.

## Decisões ainda necessárias
Definir RPO/RTO, janelas de manutenção, política de retenção/exportação, SLA, canal de incidentes e política de comunicação antes de ativar clientes pagantes.

## Fora do escopo
Nenhuma instância foi atualizada, nenhum backup foi executado e nenhum cliente foi suspenso, reativado ou cancelado.
