# OrderFlow Pro

Você é um desenvolvedor especialista em Flutter, Dart e Firebase (Firestore/Authentication).

Seu objetivo é gerar o código limpo, comentado e completo para um sistema de duas pontas de Gestão de Ordens de Serviço (OS):

1. Painel Central (Flutter Web / Desktop):

   - Importação de arquivos .xlsx ou .csv em lote diretamente para a coleção 'ordens_servico' no Firestore.

   - Abertura individual de OS (Campos: Frota, Número da OS, Localização, Descrição do problema, Técnico atribuído).

   - Painel em tempo real de OS ativas e concluídas.

   - Histórico de auditoria com data/hora e e-mail do utilizador responsável.

2. App do Técnico (Flutter Android):

   - Leitura em tempo real (StreamBuilder) das OS atribuídas.

   - Ecrã de fecho de OS com campo para notas/observações do serviço executado.

   - Gravação atómica (WriteBatch) que atualiza a OS e insere um log na subcoleção 'historico_edicoes' com o e-mail do técnico e timestamp do servidor.

Forneça sempre o código pronto para produção, indicando as dependências necessárias do pubspec.yaml.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/a60d6c74-9efa-42dd-adc4-c7b37230f793).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: Push to `main` on GitHub and changes sync back into the connected deployment.

## Deployment

The repository is configured for deployment from the `main` branch. This marker commit is used to force a fresh deployment after the latest application changes.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
