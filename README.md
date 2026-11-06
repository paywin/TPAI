# PULSO Web — frontend e backend

React/TypeScript + Python/FastAPI + SQLite. Reconhecimento real de áudio com Vosk local ou Gemini configurável no servidor. Paleta original preservada.

## Executar

Instale Node.js 22+ e Python 3.11/3.12. No terminal, na **raiz do repositório**:

```sh
npm run setup
npm start
```

Abra **http://localhost:8787** e mantenha o terminal aberto. Ctrl+C encerra o servidor. O setup cria `.venv`, instala dependências, copia `.env.example` sem sobrescrever `.env` existente e baixa Vosk português (~31 MB). A porta 8787 evita conflito com o aplicativo antigo na 8765.

Para desenvolvimento: `npm run dev` na raiz e **http://localhost:5173**. Esse comando inicia backend e Vite; iniciar somente o Vite não basta.

## Correção da tela escura

A versão anterior chamava `crypto.randomUUID()` durante a renderização; a função não existe em HTTP inseguro, como `http://192.168.0.20:5173`. A geração de IDs agora funciona nesse contexto e há tratamento de erros de inicialização.

A interface abre pelo IP, mas o navegador não permite microfone em HTTP de rede. No próprio computador, use **localhost**. Em outro computador/celular, use HTTPS com proxy para o backend e suporte a WebSocket. Não abra index.html diretamente.

## Voz local, sem chave

1. Escolha um roteiro e clique **Preparar**.
2. Selecione **Vosk · IA local sem chave** e confira “modelo instalado”.
3. Clique **Ligar microfone**, permita o acesso e aguarde **Microfone ligado**.
4. Clique **Acompanhar por voz** e leia. Confira o medidor e a transcrição.
5. **Esc / Assumir manual** suspende imediatamente o acompanhamento.

AudioWorklet converte a captura para PCM mono 16 kHz em quadros de 20 ms. O backend recebe o áudio por `/ws/audio`, executa VAD e Vosk e retorna transcrições parciais/finais. O ScriptTracker alinha essas palavras ao roteiro. Não depende do serviço de reconhecimento do navegador.

Vosk funciona sem internet após o setup e não envia áudio à nuvem. O modelo pequeno pode errar com ruído, sotaques e nomes próprios; outro modelo português pode ser instalado e indicado em `VOSK_MODEL_PATH`. Faça um ensaio com seu microfone antes de apresentar.

## Gemini

O package.json inclui `npm run setup:gemini`, que instala sem baixar Vosk. Para ter ambos, use o setup normal.

Edite **.env na raiz** e reinicie npm start:

```dotenv
GEMINI_API_KEY=sua_chave_aqui
GEMINI_MODEL=gemini-3.5-transcribe-live
```

Escolha **Gemini · API do servidor**, ligue o microfone e acompanhe por voz. O modelo padrão usa a API de transcrição em tempo real documentada pelo Google. Modelos Live de áudio com transcrição de entrada também são aceitos em GEMINI_MODEL; a resposta de áudio é descartada.

**Não coloque a chave no package.json nem em variável VITE_**. Os scripts do package.json iniciam o backend, que lê o .env. A chave permanece no servidor; .env não entra no Git.

Gemini envia áudio ao Google e pode gerar custos. A disponibilidade e a cota dependem da conta. A integração não foi validada com uma chave real nesta entrega; nenhuma chave foi fornecida. O modo Vosk foi exercitado com fala sintetizada em português através do WebSocket real.

## Dados e apresentação

SQLite fica em `data/pulso.db`; altere PULSO_DATA_DIR no .env. A primeira abertura importa o IndexedDB anterior quando disponível na mesma origem, sem apagá-lo. Entre origens/computadores, use exportar/importar JSON. Faça backup da pasta data com o servidor parado.

O apresentador abre em janela separada do mesmo navegador. Arraste ao segundo monitor e dê duplo clique para tela cheia. Fonte, espelhamento, guia, ritmo manual e atalhos continuam disponíveis.

## Comandos

| Comando na raiz | Ação |
| --- | --- |
| npm run setup | Instala frontend, backend e modelo Vosk |
| npm run setup:gemini | Instala sem baixar Vosk |
| npm start | Compila e serve tudo em localhost:8787 |
| npm run dev | Backend + Vite em localhost:5173 |
| npm run backend | Apenas backend e frontend já compilado |
| npm run build | Compila frontend |
| npm test | Testes frontend e backend |

Para proxy HTTPS, configure PULSO_ORIGINS com a origem pública e encaminhe /api e /ws ao serviço. Este servidor é pessoal, sem autenticação de usuários; instalações compartilhadas precisam de controle de acesso no proxy. **GitHub Pages sozinho não executa Python nem WebSocket**. O workflow valida a aplicação completa; não publica um frontend desconectado como se fosse o serviço completo.

## Validação

- 9 testes frontend: alinhamento, silêncio, improviso, manual, saltos, texto longo, IDs em HTTP e PCM em 16/44,1/48 kHz.
- 5 testes backend: CRUD, validação, origem, formato PCM, erros e proteção de segredos.
- Fala sintetizada pt-BR de 40 palavras enviada ao WebSocket real: 45 eventos Vosk; alinhamento até a última palavra (índice 39), escore 0,864. Esse escore não é uma taxa de precisão de reconhecimento.
- Interface conferida no endereço HTTP de rede que falhava e em localhost.
- Fala humana ao vivo e Gemini autenticado ainda precisam de validação. Permita o microfone no navegador usado na apresentação.

Referências: [Vosk](https://alphacephei.com/vosk/models), [Gemini Live Transcription](https://ai.google.dev/gemini-api/docs/live-api/live-transcribe).
# Controle por gestos (experimental)

Na raiz, execute `npm run setup:gestures` uma vez e depois `npm start`.
Abra `http://localhost:8787`, prepare um roteiro e encontre **Controle por gestos** na apresentação.
Selecione a câmera e a IA de imagem, clique em **Ligar câmera e testar** e permita a câmera.
Na primeira autorização, os nomes das câmeras aparecem; desligue a câmera para escolher outra.
O modo de teste apenas mostra o sinal reconhecido. Marque **Executar ações no roteiro** para controlar o TP.
Configurações e câmera escolhida ficam salvas neste navegador. A câmera nunca liga automaticamente.

| Sinal padrão | Ação |
| --- | --- |
| V com indicador e médio | Próximo bloco / página |
| Indicador para cima | Bloco / página anterior |
| Polegar para cima | Avançar 5 palavras |
| Polegar para baixo | Voltar 5 palavras |
| Palma aberta | Pausar leitura |
| Punho fechado | Retomar leitura |
| Duas palmas abertas | Início do roteiro |
| Dois punhos fechados | Último bloco |
| Polegar, indicador e mínimo estendidos | Acelerar rolagem manual |
| Dois sinais em V | Desacelerar rolagem manual |

Em **Configurar os 10 sinais**, remova uma atribuição com **Sem gesto** para liberar o sinal para outra ação.
Não é permitido reutilizar o mesmo sinal. Para evitar mudanças em operação, desmarque a execução antes de reconfigurar.
Mostre a mão inteira de frente, com boa iluminação. Os sete sinais simples exigem uma única mão visível.
Os sinais duplos exigem duas mãos iguais. Outros pares são ignorados.
Retire as mãos do quadro por pelo menos 600 ms antes de cada comando e sustente o sinal por pelo menos 900 ms
e três reconhecimentos. Na nuvem isso leva mais tempo. Um sinal mantido não repete a ação.
Imagens com mais de cinco segundos de atraso são descartadas. Não há gravação das imagens.

**Local:** MediaPipe no backend, sem internet após a instalação. O navegador envia JPEGs ao servidor local.
**Gemini:** configure `GEMINI_API_KEY` e `GEMINI_VISION_MODEL` (padrão `gemini-2.5-flash`) no `.env`,
e reinicie o backend. Os quadros são enviados ao Google enquanto a câmera estiver ligada, inclusive no modo de teste.
O modelo de imagem é separado de `GEMINI_MODEL`, usado para áudio. A chave nunca vai para o frontend.

Vosk/Gemini de voz e MediaPipe/Gemini de imagem podem ser combinados independentemente.
A câmera usa captura sem áudio, uma requisição por vez e inferência local fora do loop de áudio.
Gestos de navegação preservam o modo de voz e o microfone; transcrições antigas são ignoradas após o salto.
Faça uma breve pausa na fala após o gesto para iniciar um novo trecho reconhecido.
Pausar mantém o microfone conectado mas congela o acompanhamento; retomar restaura o modo anterior.
A câmera desliga ao sair da tela de apresentação, ao cancelar ou quando ocorre um erro.
Para usar câmera/microfone pelo IP da rede, é necessário HTTPS; HTTP funciona em localhost.

Os testes automatizados cobrem os sinais, exclusividade, confirmação/liberação, limites de navegação e arbitragem da voz.
O teste prático com o apresentador é necessário para avaliar distância, iluminação e enquadramento da câmera.
