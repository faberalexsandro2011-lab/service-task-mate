# App do técnico no telemóvel, histórico e visual agrícola

## Objetivo
A pessoa no escritório abre a OS no Painel Central e escolhe o técnico. A OS aparece logo no telemóvel desse técnico, em campo. Todo o sistema ganha um visual próprio do setor agrícola.

## Como funciona
```text
Escritório (Painel Central)  --abre OS + escolhe técnico-->  Telemóvel do técnico
        ^                                                          |
        |------------ estado atualiza em tempo real --------------|
```

## O que será construído
- **App instalável no telemóvel:** o técnico abre o link e escolhe "Adicionar ao ecrã principal". Fica com ícone próprio e abre em ecrã inteiro, sem loja de aplicações.
- **Ecrã do técnico:** botões grandes, para usar com uma mão e ao sol:
  - Separadores: Todas, Pendentes, Em andamento, Concluídas.
  - Cartões com Frota, Nº da OS, Localização e Descrição do problema.
  - Botão para abrir a localização no mapa.
  - "Iniciar atendimento" e "Finalizar serviço" (apenas notas do serviço; sem peças nem valor, também removidos do Painel Central).
- **Aviso de nova OS:** com a app aberta, alerta com som e vibração, e a OS surge no topo.
- **Entrada automática:** técnico vai para o ecrã do telemóvel; gestor vai para o Painel Central.
- **Envio pelo Painel Central:** escolher o técnico ao criar a OS; confirmação "Enviada para [nome]".
- **Histórico de serviço (Painel Central):** página com todas as OS e ações (aberta, enviada, iniciada, finalizada), com data/hora, técnico e responsável. Pesquisa e filtros por datas, técnico e estado.
- **Baixar em Excel:** botão que descarrega todo o histórico num ficheiro .xlsx (folha de OS e folha de ações).

## Visual agrícola
- Paleta terra: verde-folha, verde-escuro de campo, amarelo-trigo e castanho-terra, com fundos claros cor de palha.
- Letra robusta e legível ao ar livre; títulos com mais personalidade.
- Ícones do campo (trator, colheitadeira, pulverizador, talhão) para frotas e estados.
- Imagem de campo/lavoura no ecrã de entrada e cabeçalhos.
- Interações: cartões que respondem ao toque, transições suaves entre separadores, contadores animados e indicação visual clara do estado de cada OS.
- Aplicado à entrada, Painel Central, histórico e app do técnico.

## Limitação
Os avisos funcionam com a app aberta ou em segundo plano recente. Notificações com a app totalmente fechada exigem uma app nativa de loja.

## Detalhes técnicos
- Manifesto web (`display: standalone`, ícones, cor de tema) ligado no `<head>`; sem service worker.
- Rotas protegidas novas: `_authenticated/tecnico.tsx` e `_authenticated/historico.tsx` (só gestores); reutilizam a subscrição Realtime de `ordens_servico` filtrada por `tecnico_id`.
- Histórico lê `ordens_servico` + `historico_edicoes`; registo de ação ao criar/enviar OS. Exportação com a biblioteca `xlsx` já instalada.
- Alerta: evento Realtime dispara toast, `navigator.vibrate` e som curto.
- Redireção pós-login conforme a função.
- Novos tokens de cor e fonte em `src/styles.css`; imagens geradas em `src/assets`; animações com CSS/Motion.
- Sem alterações estruturais à base de dados.
