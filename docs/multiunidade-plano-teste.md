# Central OS — plano de implementação multiunidade (TESTE)

## Estado atual

- O painel em `src/routes/_authenticated/painel-teste.tsx` é somente um protótipo visual.
- Os números e tempos apresentados são fictícios; não representam OS reais.
- A rota está registrada no `src/routeTree.gen.ts` como `/painel-teste`.
- Não existe ainda consulta real multiunidade nem isolamento por unidade.
- Este documento não executa SQL nem altera o Supabase.

## Regras funcionais acordadas

1. Unidades: Vale do Paraná, Nova Londrina e Jussara.
2. Todo o histórico de OS existente pertence exclusivamente a Vale do Paraná.
3. Nova Londrina e Jussara começam sem histórico importado.
4. Usuários, técnicos e administradores locais pertencem a uma única unidade.
5. Administradores locais consultam e administram apenas a própria unidade.
6. Gestor central pode consultar as três unidades; começa em modo somente leitura.
7. A separação precisa ser aplicada no PostgreSQL/Supabase com RLS; filtro de interface não é controle de segurança.
8. Nenhuma alteração deve ser aplicada ao projeto Supabase oficial nem à aplicação de produção.

## Modelo de dados proposto para validar em banco descartável

### `unidades`

- `id uuid primary key`
- `codigo text unique not null` — valores estáveis como `vale_parana`, `nova_londrina`, `jussara`
- `nome text not null`
- `ativa boolean not null default true`

### Associação de usuários

Adicionar `unidade_id uuid` ao perfil/associação de usuário, com uma FK para `unidades`. A unidade do usuário deve ser atribuída por função administrativa confiável; não aceitar que o próprio usuário altere sua unidade pelo cliente.

### Ordens de serviço

Adicionar `unidade_id uuid` em `ordens_servico`, inicialmente nullable durante a migração de teste. Depois de conferir a contagem e amostras, atribuir as OS pré-existentes a Vale do Paraná e só então aplicar `NOT NULL`. Não copiar OS para as outras unidades.

## Matriz de autorização a testar antes de conectar a interface

| Perfil | Vale do Paraná | Nova Londrina | Jussara |
|---|---|---|---|
| Técnico local | Só OS autorizadas da unidade | Só OS autorizadas da unidade | Só OS autorizadas da unidade |
| Administrador local | CRUD apenas da sua unidade | CRUD apenas da sua unidade | CRUD apenas da sua unidade |
| Gestor central | Leitura | Leitura | Leitura |

A matriz deve ser implementada por políticas RLS verificadas no banco, não apenas por condições React.

## Sequência segura

1. Criar projeto Supabase separado, descartável, com credenciais próprias.
2. Aplicar as migrations atuais apenas nesse projeto e confirmar a estrutura real.
3. Preparar migration multiunidade com política de acesso explícita e sem dados de produção.
4. Inserir apenas dados sintéticos de teste e testar cada papel com sessões diferentes.
5. Validar build, login, navegação, RLS e tentativas de acesso cruzado entre unidades.
6. Só depois de aprovação explícita avaliar um plano separado de migração de produção. Não promover automaticamente este branch.

## Critérios de aceite

- Nenhum usuário local consegue ler ou modificar OS de outra unidade, mesmo chamando a API diretamente.
- Gestor central consulta as três unidades, mas não altera OS.
- Vale do Paraná conserva os registros existentes quando e somente quando uma migração de produção vier a ser autorizada.
- Nova Londrina e Jussara começam vazias.
- A tela deixa explícito quando usa dados demonstrativos e não mostra valores fictícios como se fossem dados reais.
