# Ecrãs de entrada e gestão de ordens de serviço

## Objetivo
Criar a experiência utilizável para gestores e técnicos, ligada aos dados e perfis já existentes.

## O que será construído
- Ecrã público de entrada por e-mail e palavra-passe, com mensagens claras de erro.
- Área protegida com navegação, identificação do utilizador e opção de terminar sessão.
- Painel central do gestor com indicadores de OS ativas e concluídas.
- Formulário para abrir uma OS individual, incluindo seleção do técnico pelo nome e e-mail do perfil.
- Importação em lote de ficheiros CSV e Excel, com pré-visualização, validação das colunas e resumo de sucessos/erros.
- Lista pesquisável de OS, separada por ativas e concluídas, mostrando frota, número, localização, técnico e datas.
- Vista adaptada ao técnico, limitada às OS atribuídas, de acordo com as regras de acesso existentes.

## Comportamento e segurança
- A área de trabalho só abre depois da autenticação.
- O gestor pode criar, importar e consultar todas as OS; o técnico vê apenas as suas.
- As operações usam a sessão autenticada e respeitam as permissões já configuradas.
- A importação aceita `.csv` e `.xlsx`; linhas inválidas são assinaladas antes da gravação.
- Os dados são atualizados no ecrã após criar ou importar ordens.

## Direção visual
- Interface operacional, limpa e compacta, em português europeu.
- Navegação lateral no computador e cabeçalho simplificado em ecrãs pequenos.
- Estados, ações e contagens com contraste claro, sem excesso de elementos decorativos.

## Detalhes técnicos
- Rotas públicas para entrada e rotas protegidas para o painel.
- Leitura e escrita autenticadas através do backend existente.
- Processamento local dos ficheiros antes do envio em lote.
- Metadados próprios em cada página e validação final em dimensões de computador e telemóvel.
