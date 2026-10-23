# PULSO

Teleprompter para Windows com controle do operador, tela independente de apresentação e acompanhamento de leitura por reconhecimento de fala.

**O teleprompter acompanha o apresentador, nunca o contrário.**

Esta versão é uma prova de conceito funcional, não homologada para transmissão ao vivo. O motor local, o simulador, a persistência e o frontend foram executados e testados. A precisão em uma leitura contínua de um apresentador em português ainda precisa de validação em estúdio. Gemini é experimental e não foi testado com uma chave real. Veja o [relatório de validação](docs/validation.md).

**Windows:** [baixar o instalador 0.1.0 no GitHub Actions](https://github.com/paywin/TPAI/actions/runs/39892024392/artifacts/12475308256) (ZIP com `PULSO_0.1.0_x64-setup.exe`, aproximadamente 75 MB; pode exigir login no GitHub). [Compilação e testes aprovados](https://github.com/paywin/TPAI/actions/runs/39892024392). A instalação e o uso em um Windows limpo ainda não foram homologados.

## Executar no Windows

Requisitos: Windows x64, Python 3.11+ (validado com 3.12), Node.js 20.19+ com npm, microfone. Para compilar o instalador: Rust estável MSVC, Microsoft C++ Build Tools e WebView2.

```powershell
git clone https://github.com/paywin/TPAI.git
cd TPAI
.\scripts\setup.ps1
.\scripts\dev.ps1
```

Abra http://127.0.0.1:5173. O script de desenvolvimento encerra o motor ao terminar. Se sua política do PowerShell bloquear scripts, use um terminal com a política autorizada pela sua organização.

Alternativa em dois terminais, ambos na raiz:

```powershell
# Terminal 1
.\.venv\Scripts\python.exe -m backend.launch
# Terminal 2
cd frontend
npm run dev
```

Para servir a versão compilada sem Vite:

```powershell
cd frontend
npm run build
cd ..
.\.venv\Scripts\python.exe -m backend.launch
# Abra http://127.0.0.1:8765
```

## Operação

1. Crie um roteiro ou abra um dos exemplos. Edite título, programa, texto, duração e tipo de cada bloco. Salve antes de apresentar.
2. Use **Salvar e preparar** ou **Preparar** na biblioteca.
3. Abra a tela do apresentador. No navegador, arraste a janela para o segundo monitor; dê duplo clique para tela cheia. No Tauri, **Identificar telas** permite selecionar o monitor antes de abrir a janela.
4. Escolha **Vosk · local**, selecione o microfone, ligue a captura e clique em **Acompanhar por voz**. O primeiro carregamento do modelo pode levar alguns segundos.
5. Leia o texto. Silêncio, baixa correspondência e falhas de reconhecimento retêm a rolagem. Confira o retorno antes de começar uma sessão real.
6. **Assumir manual** ou `Esc` interrompe o acompanhamento. `Espaço` inicia/pausa a rolagem manual; setas ajustam cinco palavras. Os atalhos não interceptam a digitação em campos.

O percentual exibido é um **escore de alinhamento do roteiro**, não uma probabilidade calibrada nem confiança do reconhecimento. O indicador **Motor** mede somente o alinhamento; **Conexão** mede o percurso de ida e volta do WebSocket. Nenhum deles mede a latência total fala → tela.

Um operador por motor. Várias telas de apresentação podem acompanhar a mesma sessão. O serviço escuta apenas em `127.0.0.1:8765`; não o exponha à rede. A captura local não grava áudio em arquivos.

## Testar sem microfone

Na apresentação, escolha **Simulador · sem áudio**, clique em **Acompanhar por voz** e envie um trecho do roteiro. Envie frases diferentes do roteiro para testar improvisação; depois retome um trecho original. **Simular silêncio** verifica a pausa. O simulador é identificado explicitamente e não usa API.

```powershell
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m scripts.simulate
cd frontend
npm run build
```

## Dados e backup

- SQLite: `%LOCALAPPDATA%\Pulso\pulso.db`. Altere com `PULSO_DATA_DIR`.
- Preferências de áudio/apresentação são salvas no SQLite.
- IndexedDB mantém uma cópia dos roteiros para edição e operação manual quando o motor está indisponível. Edições locais pendentes são sincronizadas na reconexão; não há colaboração simultânea nem resolução de conflitos entre computadores.
- A migração lê o formato `pulso-scripts-v1` do protótipo no mesmo navegador/origem. O conteúdo antigo não é excluído. Caso o protótipo tenha usado outra origem, exporte os dados para JSON.
- Use a seta de exportação de cada roteiro para criar um backup JSON. Importações recebem novos IDs, sem substituir o original. Limite: 200 roteiros por arquivo de até 5 MB; por roteiro, 30 mil palavras / 250 mil caracteres.
- Para backup integral do SQLite, pare o motor antes de copiar a pasta de dados.

## Provedores

**Vosk:** modelo português baixado de fonte oficial pelo setup; funciona localmente após o download. `VOSK_MODEL_PATH` aponta para a pasta extraída. Windows ARM64 não foi validado. Um dispositivo deve aceitar PCM mono, 16 kHz, 16 bits; quando não aceitar, escolha outro dispositivo do Windows. O aplicativo sinaliza falha em vez de inventar transcrições.

**Gemini Live:** o adaptador usa Google Gen AI SDK e transcrição do áudio de entrada da Live API, em paralelo ao VAD local. Configure `GEMINI_API_KEY` e `GEMINI_MODEL` no `.env` do backend; no aplicativo instalado, use `%LOCALAPPDATA%\Pulso\.env`. A chave nunca passa pelo frontend. Se necessário, instale `backend/requirements-gemini.txt`. O lock de desenvolvimento Windows já inclui esse SDK.

A disponibilidade de modelos, quotas e cobrança depende do projeto da API. Uma assinatura estudantil do aplicativo Gemini não é tratada como crédito de API. Selecionar esse provedor e ligar o microfone envia áudio ao Google. Não há renovação transparente de sessões longas: uma interrupção mantém a posição e exige reiniciar a captura. **Integração não homologada: falta teste real de API e medição de latência.**

## Empacotamento Windows

```powershell
# Motor Python independente com frontend compilado
.\scripts\build-windows.ps1 -EngineOnly
# Instalador Tauri 2 (requer Rust MSVC e C++ Build Tools)
.\scripts\build-windows.ps1
```

O motor fica em `dist/pulso-engine.exe`. Execute na raiz do projeto para usar o modelo em `models/`, ou defina `VOSK_MODEL_PATH`. Ele serve a interface em http://127.0.0.1:8765. O instalador Tauri inclui esse motor como processo auxiliar e o modelo português como recurso. O aplicativo encerra o processo auxiliar ao sair. Saída esperada: `frontend/src-tauri/target/release/bundle/nsis/`.

O workflow de Windows executa testes e gera o instalador em GitHub Actions. A versão 0.1.0 foi compilada com sucesso no commit `a2394726be08cadd673313919e84defa134803b3`. Os artefatos do Actions têm retenção limitada; preserve uma cópia do ZIP. Os binários não são assinados digitalmente. O modelo fica fora do Git e é baixado durante a preparação.

## Estrutura

```text
frontend/src/          Operador, editor, sessão, apresentador e cache
frontend/src-tauri/    Aplicativo Tauri 2 e configuração de permissões
backend/              FastAPI, SQLite, captura/VAD, provedores, ScriptTracker
tests/                Alinhamento, estados, persistência, WS e provedores
scripts/              Setup, simulador e empacotamento Windows
docs/                 Auditoria, arquitetura, estados e resultados
```

Leia [arquitetura](docs/architecture.md), [máquina de estados](docs/states.md), [auditoria do protótipo](docs/audit.md) e [validação](docs/validation.md).
