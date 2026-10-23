export function speechSupported() {
  return window.isSecureContext && !!navigator.mediaDevices?.getUserMedia && typeof AudioWorkletNode !== 'undefined';
}
export function startSpeech(provider: 'vosk' | 'gemini', callbacks: {
  ready(): void;
  result(text: string, final: boolean, confidence: number | null, id: string): void;
  voice(active: boolean, level: number): void;
  error(message: string): void;
}) {
  if (!speechSupported()) throw new Error('Para usar o microfone, abra http://localhost:8787 neste computador. Em outro dispositivo, use HTTPS.');
  let stopped = false;
  let stream: MediaStream | undefined;
  let context: AudioContext | undefined;
  let socket: WebSocket | undefined;
  let processor: AudioWorkletNode | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    stopped = true;
    clearTimeout(timeout);
    processor?.disconnect();
    stream?.getTracks().forEach(track => track.stop());
    if (context && context.state !== 'closed') void context.close();
    socket?.close();
  };
  const fail = (message: string) => { if (!stopped) { stop(); callbacks.error(message); } };
  context = new AudioContext();
  void context.resume().catch(() => fail('O navegador bloqueou o áudio. Clique em Ligar microfone novamente.'));
  void (async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({audio: {channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true}});
      if (stopped) { stream.getTracks().forEach(track => track.stop()); return; }
      stream.getAudioTracks()[0].onended = () => fail('O microfone foi desconectado ou sua permissão foi revogada.');
      await context!.audioWorklet.addModule(new URL('./pcm-worklet.js', import.meta.url));
      if (stopped) return;
      socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/audio`);
      timeout = setTimeout(() => fail('O backend não respondeu. Execute npm start na raiz do projeto.'), 60000);
      socket.onopen = () => socket?.send(JSON.stringify({provider}));
      socket.onerror = () => fail('Não foi possível conectar ao backend. Execute npm start na raiz do projeto.');
      socket.onclose = () => fail('Conexão de áudio interrompida. A posição foi preservada; ligue o microfone novamente.');
      socket.onmessage = event => {
        if (stopped) return;
        const data = JSON.parse(event.data);
        if (data.type === 'error') { fail(data.message); return; }
        if (data.type === 'ready') {
          clearTimeout(timeout);
          const source = context!.createMediaStreamSource(stream!);
          processor = new AudioWorkletNode(context!, 'pulso-pcm');
          processor.port.onmessage = e => {
            if (stopped || socket?.readyState !== WebSocket.OPEN) return;
            if (socket.bufferedAmount > 64000) { fail('A conexão ficou atrasada. Reinicie o microfone.'); return; }
            socket.send(e.data);
          };
          const mute = context!.createGain(); mute.gain.value = 0;
          source.connect(processor); processor.connect(mute); mute.connect(context!.destination);
          callbacks.ready();
        }
        if (data.type === 'transcript') callbacks.result(data.text, data.final, data.confidence, data.id);
        if (data.type === 'voice') callbacks.voice(data.active, data.level);
      };
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      fail(name === 'NotAllowedError' ? 'Permita o microfone nas configurações deste site e tente novamente.' :
        name === 'NotFoundError' ? 'Nenhum microfone encontrado. Conecte um microfone e tente novamente.' :
        'Não foi possível iniciar a captura. Confira o microfone e abra a aplicação em localhost ou HTTPS.');
    }
  })();
  return stop;
}
