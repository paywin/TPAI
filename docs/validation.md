# Validação da versão 0.1

Ambiente: Windows 11 x64, Python 3.12.14, React 19, TypeScript 5.7 e Vite 6.4.5. Dependências Python usadas estão registradas em `backend/requirements-lock.txt`; frontend usa `package-lock.json`.

## Resultados locais

| Verificação | Resultado |
|---|---|
| Build original e inicialização do protótipo | Passaram; biblioteca original inspecionada no navegador. |
| Build TypeScript/Vite da aplicação nova | Passou, sem erros. |
| Testes automatizados | 23 passaram. |
| Análise estática Python | Ruff E4/E7/E9/F/I passou. |
| SQLite | CRUD, validação, reabertura do banco e preferências testados. |
| WebSocket | Operador/apresentador, comandos inválidos, simulador e desconexão testados. |
| Prioridade manual | Teste concorrente garante que uma transcrição atrasada não desfaz posição manual. |
| Interface | Biblioteca, abertura/edição, salvar e preparar, simulador, silêncio, improvisação e retomada exercitados no navegador. |
| Apresentador | Segunda página independente recebeu o roteiro e refletiu posição/destaque; inspecionada visualmente. |
| Falha de motor | Processo interrompido; posição conservada e avanço manual refletido na outra página via BroadcastChannel. |
| Microfone + VAD + Vosk | Modelo PT carregado; captura PCM real abriu; houve 12 relatórios de nível em teste de 5 s incluindo inicialização, RMS máximo 0,0002. A captura foi encerrada. Não houve fala suficiente para validar acompanhamento de um apresentador. |
| Reconhecimento real com arquivo | WAV oficial do Vosk, mono 16 kHz/16 bits, modelo inglês: 15 eventos em 1,46 s de processamento; resultados finais e timestamps reais entregues. A primeira frase reconhecida foi “one zero zero zero one”. Esse teste não mede qualidade do modelo português. |
| Executável Python | PyInstaller gerou `pulso-engine.exe` (~40 MB). Executado: health OK, interface HTTP 200, oito entradas de microfone enumeradas; captura iniciada e encerrada pela interface sem erro. |
| Configuração Gemini | Objeto LiveConnectConfig validado com google-genai 2.33.0. Sem chamada real. |
| Instalador Tauri local | Não compilado: Rust e Microsoft C++ Build Tools ausentes. Configuração, sidecar, recursos, permissões e workflow de build entregues. |

Há um aviso de depreciação do TestClient da versão instalada do Starlette sobre o uso de httpx; não houve falha associada.

## Cenários automatizados

Leitura em três ritmos; pausa curta; silêncio prolongado; improvisação; retorno; parciais revisadas; eventos duplicados; repetição; erro de transcrição; salto com confirmação; frase pulada; falso positivo de uma palavra; frases repetidas ambíguas; falha de reconhecimento; manual/automático; roteiro vazio; limites de posição; recuperação em roteiro com 20.005 palavras; fila de áudio limitada; metadados reais de palavras; ausência de modelo; persistência e comunicação. Algumas condições são agrupadas no mesmo teste.

## Medições

- Simulador, 150 eventos curtos: mediana 0,42 ms, p95 0,54 ms, máximo 1,18 ms para alinhamento.
- Roteiro sintético com 20.005 palavras, 30 buscas: mediana 1,72 ms, p95 2,39 ms.
- Durante testes de interface, ida e volta do WebSocket em loopback variou aproximadamente entre 0 e 3 ms. As medições da UI incluem variação de agendamento; houve alinhamento de até 32,57 ms observado numa interação.

São medições pontuais neste computador, não garantias de latência. Não foi medida latência ponta a ponta com fala humana, câmera ou equipamento de estúdio. O WAV foi processado mais rápido que tempo real; esse tempo inclui carregamento do modelo e não é latência de streaming.

## Pendências para homologação

1. Leitura em português ao microfone em ambiente representativo, com ruído, improvisações e saltos; medir erros e ajustar limiares.
2. Segundo monitor físico e espelhamento no equipamento de teleprompter. A lógica de seleção Tauri requer teste no aplicativo compilado.
3. Gemini: credencial/projeto disponível, teste real, custos, modelo acessível, duração de sessão e latência. Não considerar a integração funcional antes disso.
4. Instalador Tauri: conferir execução do workflow e testar instalação/abertura/encerramento em Windows limpo. Não há assinatura de código.
5. Ensaio prolongado e perfil de renderização com roteiros muito longos. Não há virtualização completa do DOM; os grupos de palavras são memoizados e o backend impõe limites de tamanho.

Áudio de referência: [exemplo oficial do Vosk](https://github.com/alphacep/vosk-api/blob/master/python/example/test.wav). Nem o áudio de referência nem capturas privadas fazem parte do repositório.
