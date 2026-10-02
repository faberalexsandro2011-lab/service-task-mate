# Conta de gestor para faber.alexsandro2011@gmail.com

## O que será feito
1. Verificar se este e-mail já tem uma conta no sistema atual.
2. Se não tiver, criar a conta já confirmada, para que não seja preciso abrir nenhum e-mail de confirmação.
3. Definir uma senha provisória forte e dar a ela a função de **gestor**, o que dá acesso ao Painel Central (/dashboard).
4. Se a conta já existir, mantê-la como está e apenas adicionar a função de gestor e a senha provisória.
5. Testar o login de verdade com essa conta e confirmar que ela abre o /dashboard.

## O que não será alterado
- O código da tela de login, a estrutura do banco e a ligação com o backend atual (Lovable Cloud).
- Nenhum projeto externo será criado.

## Como você vai entrar
- Abra a página inicial do app e entre com o seu e-mail e a senha provisória, que vou mostrar no fim.
- Você deve chegar ao Painel Central.
- Para usar uma senha escolhida por você, me diga qual é e eu a defino. O app ainda não tem uma tela de "trocar senha".

## Detalhes técnicos
- A conta será criada pela API de administração de autenticação, com o e-mail já confirmado. Assim evitamos o problema dos campos NULL que aconteceu antes com inserções feitas direto em SQL.
- Os registros de perfil e de função serão criados pelo processo automático que já existe no sistema. Depois, a função será trocada para `gestor` na lista de funções do usuário: o registro `tecnico` será removido, porque a rota protegida lê uma única função por usuário.
- Mudança só de dados, sem alterar a estrutura do banco.
