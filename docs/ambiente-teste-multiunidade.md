# Verificação do ambiente de teste — Central OS multiunidade

Data da verificação: 21/10/2026.

## Resultado da inspeção

Foi encontrado o projeto Supabase `central-os-solinftec-teste` (região `sa-east-1`, status saudável), com estrutura atual do Central OS, 10 ordens de serviço, 1 perfil e 1 registro de papel de usuário.

As 10 OS observadas parecem ser registros demonstrativos (sequência 900200001–900200010, frotas 58112–58121 e descrições genéricas de manutenção), criadas em 15/10/2026. Mesmo assim, o projeto está nomeado e utilizado para testes de Solinftec, portanto não deve ser reutilizado nem alterado para o desenvolvimento multiunidade sem confirmação específica.

## Decisão de segurança

- Não foram executadas alterações de esquema ou dados nesse projeto.
- O Supabase oficial de produção não foi consultado nem alterado nesta etapa.
- O painel multiunidade ainda não foi conectado a banco.
- Não foi criada branch Supabase nem novo projeto; isso pode gerar custos e exige aprovação do valor apresentado pelo Supabase.

## Próximo passo necessário

Usar uma base exclusivamente dedicada ao teste multiunidade. Opções:

1. Criar um projeto Supabase separado, sem copiar dados de produção; ou
2. Criar uma branch de desenvolvimento de um projeto explicitamente escolhido, após verificar custo e confirmar que não haverá dados reais transferidos.

Antes de aplicar migrations, confirmar a estrutura, testar RLS por papel e usar apenas contas e OS sintéticas. Nenhuma migração deve ser promovida à produção sem autorização expressa.
