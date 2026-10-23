# PULSO Web

Teleprompter para navegador, com editor por blocos, acompanhamento por voz e janela independente do apresentador. Paleta original: azul escuro `#0b1018`, superfícies `#121d2e`, lilás `#95a8ff`, verde `#76ead5` e amarelo `#ffc65b`.

## Executar no computador

Instale Node.js 22 ou superior. Na pasta do projeto:

```sh
cd frontend
npm ci
npm run dev
```

Abra **http://localhost:5173**. Não é necessário instalar Python, Rust, modelos Vosk ou o aplicativo Windows.

## Usar

1. Crie, importe ou escolha um roteiro na biblioteca.
2. Clique em **Preparar** para abrir o controle da apresentação.
3. Para voz, selecione **Navegador · português**, clique **Ligar microfone**, permita o acesso e clique **Acompanhar por voz**.
4. Use **Abrir tela do apresentador**, arraste essa janela para o monitor desejado e dê duplo clique para tela cheia.
5. **Espaço** rola/pausa manualmente; **↑/↓** ajustam a posição; **Esc** assume o controle manual.

O microfone é escolhido nas permissões do navegador. O reconhecimento usa a Web Speech API em pt-BR, depende do suporte do navegador e pode enviar áudio ao serviço do fornecedor e exigir internet. Não é o motor Vosk local da versão desktop. Firefox e outros ambientes sem essa API mantêm editor, simulador e controle manual. Abra por HTTPS ou localhost para permitir microfone e armazenamento.

Roteiros ficam em IndexedDB, apenas neste perfil de navegador e nesta origem. Exporte JSON para backup ou troca de computador. A janela de apresentação sincroniza por BroadcastChannel no mesmo navegador; cada painel tem sua própria sessão. Não há contas, banco remoto ou sincronização entre computadores.

## Publicação web

```sh
cd frontend
npm ci
npm run build
npm run preview
```

Publique o conteúdo de `frontend/dist` em qualquer hospedagem estática HTTPS. Os caminhos relativos funcionam também em subpastas, inclusive `/TPAI/`.

O workflow `.github/workflows/web.yml` compila e publica no GitHub Pages a cada push em `main`. No repositório, **Settings → Pages → Source → GitHub Actions** deve estar habilitado. O workflow também disponibiliza o pacote `pulso-web`.

## Estrutura atual

- `frontend/src/App.tsx`: biblioteca, editor, controles e apresentação.
- `frontend/src/storage.ts`: persistência IndexedDB e importação/exportação.
- `frontend/src/session.ts`: sessão local e comunicação com o apresentador.
- `frontend/src/speech.ts`: reconhecimento de fala, permissões, erros e reinício.
- `frontend/src/tracker.ts`: alinhamento lexical limitado por janela; estados de leitura, silêncio, busca, improviso e manual; confirmação de saltos distantes.
- `frontend/src/Prompter.tsx`: rolagem amortecida e texto em grupos.

A implementação desktop anterior permanece no histórico Git (commit `a2394726`). Python, Tauri, scripts, testes e documentos antigos podem ser recuperados nesse commit. O fluxo de publicação vigente é o web; o instalador antigo não recebe estas mudanças.

## Limites de validação

O build verifica TypeScript e produz o pacote estático. A aceitação de voz real em português depende de testar com o microfone, navegador e conexão usados na apresentação. Os testes Python da versão desktop não validam o novo motor TypeScript. O tempo exibido em “Motor” mede apenas alinhamento local, não a latência completa do serviço de voz.

Referências: [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition), [GitHub Pages com Actions](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
