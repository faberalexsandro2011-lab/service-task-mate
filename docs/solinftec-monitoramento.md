# Monitoramento Solinftec no Central OS (teste)

Esta funcionalidade está na branch `feature/solinftec-monitoring`. Ela não foi mesclada em `main` e não deve ser publicada em produção antes dos testes.

## Componentes

- `src/routes/_authenticated/solinftec.tsx`: painel gestor, busca/filtro de alertas e abertura de OS pendente a partir de um alerta.
- `supabase/migrations/20261014220000_solinftec_monitoramento.sql`: tabela de snapshot, índice e leitura restrita a gestores.
- `supabase/functions/solinftec-ingest/index.ts`: endpoint que recebe lotes do coletor Python; exige `SOLINFTEC_INGEST_TOKEN`.
- `src/integrations/supabase/types.ts` e `src/routeTree.gen.ts`: tipos e rota do painel.

## Segurança e configuração

1. **Confirme primeiro o projeto Supabase de teste.** O `supabase/config.toml` conserva o ID existente no repositório. Não rode `supabase db push` nem publique a função até verificar no Dashboard que o projeto ligado é o ambiente de teste, não a produção.
2. Gere um segredo forte localmente, por exemplo com `python -c "import secrets; print(secrets.token_urlsafe(48))"`. Configure o mesmo valor como Edge Function secret `SOLINFTEC_INGEST_TOKEN` no Supabase de teste e como variável de ambiente de usuário do Windows. Não grave o valor neste repositório, não o coloque no código e não o compartilhe no chat.
3. Depois de confirmar o projeto de teste, aplique a migration e publique `solinftec-ingest`. A configuração define `verify_jwt = false`, pois o coletor Python usa um token de ingestão próprio; a função verifica esse token antes de permitir qualquer gravação.
4. O coletor também precisa das variáveis de ambiente do Windows:
   - `SOLINFTEC_SUPABASE_URL`: URL base do projeto Supabase de teste, por exemplo `https://SEU-PROJETO.supabase.co`.
   - `SOLINFTEC_SUPABASE_PUBLISHABLE_KEY`: chave publicável do mesmo projeto de teste.
   - `SOLINFTEC_INGEST_TOKEN`: o mesmo segredo forte configurado na função.
5. Use o arquivo atualizado `solinftec_monitoramento_central_os.py` junto com a função já publicada. Sem essas três variáveis, o coletor continua salvando os CSVs locais, mas não envia dados ao app.

## Como validar antes da produção

1. Abra a URL de preview/teste e entre com uma conta de gestor.
2. Confirme que o painel mostra a quantidade esperada de equipamentos e que a hora da última coleta avança depois do próximo ciclo de 30 minutos.
3. Confirme que um usuário técnico é redirecionado para a área do técnico e não pode ler a tabela diretamente (política RLS).
4. Teste criar uma OS a partir de um alerta apenas com um número de OS de teste; confirme que a tela bloqueia um número já cadastrado e não duplica uma OS pendente/em andamento para a mesma frota.
5. Só então avalie mesclar em `main`. Esta branch e a migration não aplicam mudanças ao banco por conta própria.

## Observações

- A tela atualiza automaticamente a cada minuto e também escuta eventos Realtime quando disponíveis.
- Os dados antigos mantêm a última hora de coleta recebida; o painel avisa quando não há coleta recente.
- O botão **Abrir OS** exige número de OS e cria uma OS pendente sem técnico atribuído. A gestão pode depois atribuí-la pelo fluxo existente.
- Ainda não há envio de alerta por WhatsApp/SMS; os alertas locais do Windows permanecem independentes.
