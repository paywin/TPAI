type Result = { isFinal: boolean; 0: { transcript: string; confidence: number } };
type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onspeechend: (() => void) | null;
  onresult: ((e: { resultIndex: number; results: ArrayLike<Result> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void; abort(): void;
};
type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
export function speechSupported() {
  const w = window as SpeechWindow;
  return window.isSecureContext && !!(w.SpeechRecognition ?? w.webkitSpeechRecognition);
}
export function startSpeech(callbacks: {
  ready(): void; result(text: string, final: boolean, confidence: number, id: string): void;
  silence(): void; error(message: string): void;
}) {
  const w = window as SpeechWindow;
  const Constructor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!window.isSecureContext || !Constructor) throw new Error("Reconhecimento de voz indisponível. Abra em HTTPS ou localhost usando um navegador compatível. O controle manual continua disponível.");
  const recognition = new Constructor();
  let stopped = false, cycle = 0;
  let restart: ReturnType<typeof setTimeout> | undefined;
  recognition.lang = "pt-BR";
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.onstart = () => { cycle++; if (!stopped) callbacks.ready(); };
  recognition.onresult = e => {
    if (stopped) return;
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const result = e.results[i];
      callbacks.result(result[0].transcript, result.isFinal, result[0].confidence, `${cycle}:${i}:${result.isFinal}`);
    }
  };
  recognition.onspeechend = () => { if (!stopped) callbacks.silence(); };
  recognition.onerror = e => {
    if (stopped || e.error === "no-speech") return;
    stopped = true;
    recognition.abort();
    const messages: Record<string, string> = {
      "not-allowed": "Permita o microfone nas configurações deste site e tente novamente.",
      "audio-capture": "Microfone indisponível. Verifique a conexão e as permissões.",
      "network": "O serviço de reconhecimento está sem conexão. Verifique a internet e ligue o microfone novamente.",
      "service-not-allowed": "O navegador bloqueou o serviço de voz. Use um navegador compatível ou o controle manual.",
    };
    callbacks.error(messages[e.error] ?? `Reconhecimento interrompido (${e.error}). Tente ligar o microfone novamente.`);
  };
  recognition.onend = () => {
    if (!stopped) restart = setTimeout(() => {
      if (stopped) return;
      try { recognition.start(); }
      catch { stopped = true; callbacks.error("O reconhecimento foi interrompido. Ligue o microfone novamente."); }
    }, 350);
  };
  recognition.start();
  return () => { stopped = true; clearTimeout(restart); recognition.abort(); };
}
