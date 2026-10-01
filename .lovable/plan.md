# App do técnico no telemóvel

## Objetivo
A pessoa no escritório abre a OS no Painel Central e escolhe o técnico. A OS aparece logo no telemóvel desse técnico, em campo.

## Como funciona
```text
Escritório (Painel Central)  --abre OS + escolhe técnico-->  Telemóvel do técnico
        ^                                                          |
        |------------ estado atualiza em tempo real --------------|
```

## O que será construído
- **App instalável no telemóvel:** o técnico abre o link no Android ou iPhone e escolhe "Adicionar ao ecrã principal". Fica com um ícone e abre em ecrã inteiro, como uma app normal. Não é preciso loja de aplicações.
- **Ecrã próprio do técnico (/tecnico):** botões grandes, pensado para usar com uma mão:
  - Separadores: Todas, Pendentes, Em andamento, Concluídas.
  - Cartões com Frota, Nº da OS, Localização e Descrição do problema.
  - Botão para abrir a localização no mapa.
  - Botões "Iniciar atendimento" e "Finalizar serviço" (apenas notas do serviço; sem campos de peças nem valor, também removidos do Painel Central).
- **Aviso de nova OS:** com a app aberta, quando o escritório envia uma OS, aparece um alerta com som e vibração, e a OS surge no topo da lista.
- **Entrada automática:** depois do login, o técnico vai diretamente para o ecrã do telemóvel; o gestor vai para o Painel Central.
- **Painel Central:** ao criar a OS, o técnico escolhido é obrigatório para "enviar" a OS. Aparece a confirmação "Enviada para [nome do técnico]".

## Limitação
Os avisos funcionam com a app aberta ou em segundo plano recente. Notificações com a app totalmente fechada exigem uma app nativa de loja, o que não é possível aqui.

## Detalhes técnicos
- Manifesto web (nome, ícones, `display: standalone`, cor de tema) e ligação no `<head>`; sem service worker (evita problemas na pré-visualização).
- Nova rota protegida `_authenticated/tecnico.tsx`, reutilizando consultas, ações e subscrição Realtime existentes em `ordens_servico`, filtradas por `tecnico_id`.
- Alerta: evento Realtime `INSERT`/`UPDATE` com `tecnico_id = utilizador` dispara toast, `navigator.vibrate` e som curto.
- Redireção pós-login conforme a função (`tecnico` → `/tecnico`, `gestor` → `/dashboard`).
- Sem alterações à base de dados; as regras de acesso atuais já limitam o técnico às suas OS.
