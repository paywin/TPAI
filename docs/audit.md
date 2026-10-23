# Auditoria e mudanças

## Protótipo recebido

ZIP com 9 arquivos de código/configuração/documentação e duas entradas de diretório: `index.html`, `package.json`, `tsconfig.json`, `vite.config.ts`, `README.md`, `src/main.tsx`, `src/index.css`, `src/App.tsx`, `src/App.css`. Todos foram lidos antes da alteração do frontend. O build original passou (React 19, TypeScript 5.7, Vite 6); a biblioteca original foi aberta no navegador e inspecionada visualmente.

Recursos úteis: biblioteca com busca; três roteiros de exemplo; metadados de programa, situação e duração; criação de roteiro; editor de blocos; navegação entre blocos; tamanho de fonte; espelhamento. Esses conceitos e os exemplos foram mantidos.

Problemas observados no código: `playing` só alterava um rótulo; não havia animação, captura nem reconhecimento. A apresentação mostrava um bloco na própria tela administrativa. O armazenamento dependia exclusivamente de localStorage. Botões de formatação inseriam marcadores literais. O estado vazio era uma demonstração acionável. Não havia testes, backend ou tratamento de comunicação. A referência institucional no rodapé não era uma integração ou parceria verificável.

## Refatoração

- Preservado React/TypeScript/Vite e o modelo Script/Block. Exemplos separados em `seed.ts`.
- O componente monolítico foi dividido em sessão, armazenamento, apresentador e tipos. O painel/editor continuam em App.tsx, com código formatado para manutenção.
- A tela demonstrativa foi substituída por retorno do apresentador e janela independente.
- Removidos controles fictícios de IA, formatação e estado vazio. A edição permanece texto simples; não se promete formatação rica.
- A identidade mantém PULSO e a ideia de estúdio de leitura. A interface usa papel claro, texto escuro, acento terroso, tabela compacta, numeração de blocos e controles utilitários. A tela do apresentador permanece escura e sem administração.
- Implementados backend local, persistência SQLite, cache IndexedDB, eventos de transcrição, motor de alinhamento e teste sem API.

A substituição dos componentes de apresentação e persistência era necessária: não existia uma implementação operacional desses recursos para estender. Nenhum arquivo do ZIP original foi alterado; ele foi extraído em uma área de trabalho separada.
