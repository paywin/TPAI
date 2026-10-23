# Arquitetura

## Fluxo

```text
Microfone → PortAudio/sounddevice → fila PCM limitada → WebRTC VAD
                                          └→ Vosk ou Gemini Live → Transcript
Transcript → ScriptTracker → posição/estado → WebSocket → animação RAF
Operador → edição REST/SQLite ou comandos WS → sessão → apresentador
```

A interface não captura nem processa áudio. O callback de captura apenas copia blocos de 20 ms para uma fila de até 100 itens. Estouro ou falha do dispositivo encerra a captura com aviso; áudio atrasado não é reproduzido posteriormente como se fosse atual. Vosk processa os blocos fora do loop assíncrono. O alinhamento de áudio também usa uma thread e uma cópia do estado; uma revisão da sessão impede que um resultado atrasado desfaça uma intervenção manual.

O backend é autoridade da sessão. Há um operador e várias telas consumidoras. Desconectar o operador interrompe áudio e rolagem. No navegador, BroadcastChannel oferece controle manual entre janelas da mesma origem quando o backend cai. Heartbeats a cada 2 s detectam uma conexão aparentemente aberta sem resposta após 6 s. Reconectar preserva a posição manual e exige reativar a automação.

Snapshots frequentes não reenviam o roteiro inteiro. O apresentador reaproveita grupos memoizados de 80 palavras; só os grupos com destaque alterado precisam renderizar novamente. ResizeObserver recalcula o alvo após redimensionamento. A animação usa amortecimento exponencial com delta de tempo limitado e para nos estados SILENCE, IMPROVISING e SEARCHING. Não há integração de velocidade que continue avançando sem evidência de fala em modo automático.

## Alinhamento

O `ScriptTracker` é Python independente de FastAPI e áudio. Tokeniza em palavras com índice compatível com o frontend, remove acentos e pontuação para comparar e preserva o texto original para exibição.

Cada transcrição usa até as últimas 24 palavras. A busca prioriza uma janela em torno da posição atual. Um índice invertido oferece recuperação distante por âncoras pouco frequentes. Programação dinâmica calcula inserções, exclusões e substituições; pequenas variações ortográficas recebem custo menor por similaridade de caracteres. O score é `1 - custo / comprimento`, não probabilidade estatística. Trechos de uma palavra não movem o texto. Saltos distantes exigem pelo menos quatro palavras, score maior e confirmação em um evento diferente. Candidatos distantes ambíguos são rejeitados.

Escolha de abordagem:

| Abordagem | Decisão |
|---|---|
| Igualdade literal | Insuficiente para erros de ASR e repetição. |
| Fuzzy matching isolado | Útil para palavras, mas sem contexto pode saltar para qualquer frase repetida. |
| Edit distance + janela incremental | Escolhida por ser determinística, inspecionável e permitir inserções/exclusões. |
| Índice de âncoras | Recuperação distante sem comparar cada posição de um roteiro longo. Âncoras excessivamente frequentes não são usadas. |
| Modelo probabilístico/HMM | Não implementado nesta POC; exigiria calibração com leituras reais e distribuições de erros. A histerese atual é heurística. |
| Modelo generativo para movimento | Não utilizado. Gemini, quando escolhido, apenas fornece transcrição. |

Há limites deliberados: frases repetidas podem exigir intervenção; semântica, números por extenso e paráfrases não são interpretados como equivalências garantidas. Os limiares precisam de calibração em áudio televisivo real.

## Dados e segurança local

SQLite usa transações, WAL e consultas parametrizadas. A aplicação valida campos e tamanhos antes de salvar/carregar uma sessão. O banco fica fora do código. Importação não reutiliza IDs externos. JSON e roteiros são renderizados como texto pelo React.

O servidor limita Host e Origin, incluindo o handshake WebSocket, e escuta somente em loopback. Essas medidas reduzem acesso de páginas de terceiros; não são isolamento contra outros programas da mesma conta Windows. Não foi implementada autenticação multiusuário ou acesso remoto. Chaves ficam no ambiente do backend. Erros de provedor não expõem a mensagem bruta, que poderia conter URLs/credenciais. Não há gravação de áudio ou log de transcrições privadas.

## Fontes técnicas consultadas

- [Vosk: instalação e plataformas](https://alphacephei.com/vosk/install) e [modelos](https://alphacephei.com/vosk/models). A página de instalação cita versões antigas de Python; a compatibilidade com 3.12 x64 foi verificada instalando e executando a biblioteca, não inferida apenas da documentação.
- [Gemini Live: capacidades e transcrição de entrada](https://ai.google.dev/gemini-api/docs/live-api/capabilities). Configuração validada com o SDK instalado; chamada real não realizada.
- [Tauri: pré-requisitos](https://v2.tauri.app/start/prerequisites/) e [processos auxiliares](https://v2.tauri.app/develop/sidecar/).
- [Levenshtein no RapidFuzz](https://rapidfuzz.github.io/RapidFuzz/Usage/distance/Levenshtein.html) como referência de comparação; o projeto implementa sua própria matriz de custos por palavras.
- [SequenceMatcher no Python](https://github.com/python/cpython/blob/main/Doc/library/difflib.rst) para similaridade ortográfica. Não equivale à distância de Levenshtein e só é usado no custo de substituição.
