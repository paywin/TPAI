import { useEffect, useRef, useState } from 'react';
import { actions, defaultBindings, gestures, GestureGate, validBindings, type Action, type Bindings } from './gestures';

const KEY = 'pulso-gestures-v1';
function preferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { device: typeof saved.device === 'string' ? saved.device : '',
      provider: saved.provider === 'gemini' ? 'gemini' : 'local',
      bindings: validBindings(saved.bindings) ? saved.bindings : defaultBindings };
  } catch { return { device: '', provider: 'local', bindings: defaultBindings }; }
}

export default function GestureControl({ onAction, available }: {onAction: (action: Action) => void; available: boolean}) {
  const [prefs, setPrefs] = useState(preferences);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [armed, setArmed] = useState(false);
  const [status, setStatus] = useState('Câmera desligada');
  const [detected, setDetected] = useState('—');
  const [last, setLast] = useState('Nenhum comando');
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const abort = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const generation = useRef(0);
  const gate = useRef(new GestureGate());
  const latest = useRef({ prefs, armed, onAction, available });
  latest.current = { prefs, armed, onAction, available };
  const stop = () => {
    generation.current++;
    clearTimeout(timer.current); abort.current?.abort();
    stream.current?.getTracks().forEach(t => t.stop()); stream.current = null;
    if (video.current) video.current.srcObject = null;
    gate.current = new GestureGate();
    setRunning(false); setStarting(false); setArmed(false); setDetected('—');
    setStatus('Câmera desligada');
  };
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* private browsing */ }
  }, [prefs]);
  useEffect(() => {
    const list = () => navigator.mediaDevices?.enumerateDevices().then(all => setDevices(all.filter(d => d.kind === 'videoinput'))).catch(() => {});
    void list();
    navigator.mediaDevices?.addEventListener('devicechange', list);
    return () => { stop(); navigator.mediaDevices?.removeEventListener('devicechange', list); };
  }, []);
  const start = async () => {
    stop();
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setStatus('Abra em localhost ou HTTPS para permitir a câmera.'); return;
    }
    const version = generation.current;
    setStarting(true); setStatus('Aguardando permissão da câmera…');
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: false, video: {
        deviceId: prefs.device ? { exact: prefs.device } : undefined,
        width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 10, max: 15 },
      } });
      if (version !== generation.current) { media.getTracks().forEach(t => t.stop()); return; }
      stream.current = media;
      media.getVideoTracks()[0].onended = () => { stop(); setStatus('Câmera desconectada. Selecione uma câmera e ligue novamente.'); };
      if (video.current) { video.current.srcObject = media; await video.current.play(); }
      const all = await navigator.mediaDevices.enumerateDevices();
      if (version !== generation.current) return;
      setDevices(all.filter(d => d.kind === 'videoinput'));
      setPrefs(p => ({ ...p, device: media.getVideoTracks()[0].getSettings().deviceId || p.device }));
      setRunning(true); setStarting(false);
      const canvas = document.createElement('canvas');
      const tick = async () => {
        if (version !== generation.current || !video.current) return;
        try {
          canvas.width = 640;
          canvas.height = Math.min(480, Math.round(640 * video.current.videoHeight / video.current.videoWidth)) || 480;
          canvas.getContext('2d')!.drawImage(video.current, 0, 0, canvas.width, canvas.height);
          const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', .75));
          if (version !== generation.current) return;
          if (!blob) throw new Error('Não foi possível capturar a imagem.');
          const controller = new AbortController(); abort.current = controller;
          const capturedAt = performance.now();
          const timeout = setTimeout(() => controller.abort(), 15000);
          let data;
          try {
            const response = await fetch(`/api/gestures/recognize?provider=${latest.current.prefs.provider}`, {
              method: 'POST', body: blob, signal: controller.signal, headers: { 'Content-Type': 'image/jpeg' },
            });
            data = await response.json();
            if (!response.ok) throw new Error(data.detail || 'Falha no reconhecimento.');
          } finally { clearTimeout(timeout); }
          if (version !== generation.current) return;
          if (performance.now() - capturedAt > 5000) {
            gate.current = new GestureGate();
            setStatus('Imagem atrasada descartada. Aguarde ou use a IA local.');
            timer.current = setTimeout(tick, 700); return;
          }
          const id = gestures.some(([id]) => id === data.gesture) && data.confidence >= .7 ? data.gesture : null;
          setDetected(gestures.find(([g]) => g === id)?.[1] || (data.neutral ? 'Sem mãos no quadro' : 'Sinal indefinido'));
          const fired = gate.current.update(id, data.neutral === true, performance.now());
          setStatus(gate.current.armed ? 'Pronto. Sustente o sinal por pelo menos 1 segundo.' : 'Retire as mãos do quadro para liberar o próximo sinal.');
          if (fired) {
            const action = actions.find(([a]) => latest.current.prefs.bindings[a] === fired);
            if (action) {
              const execute = latest.current.armed && latest.current.available;
              setLast(`${execute ? 'Executado' : 'Teste'}: ${action[1]}`);
              if (execute) latest.current.onAction(action[0]);
            }
          }
          timer.current = setTimeout(tick, latest.current.prefs.provider === 'gemini' ? 700 : 150);
        } catch (error) {
          if (version !== generation.current) return;
          stop(); setStatus(error instanceof Error && error.name !== 'AbortError' ? error.message : 'A visão demorou a responder. Ligue a câmera novamente.');
        }
      };
      void tick();
    } catch (error) {
      if (version !== generation.current) return;
      stop(); setStatus(error instanceof Error && error.name === 'NotAllowedError' ? 'Permita o acesso à câmera no navegador.' : 'Câmera indisponível. Confira a conexão e selecione outra câmera.');
    }
  };
  const bind = (action: Action, value: string) => {
    const bindings = { ...prefs.bindings, [action]: value } as Bindings;
    if (validBindings(bindings)) { gate.current = new GestureGate(); setPrefs({ ...prefs, bindings }); }
  };
  return <section className="gesture-panel">
    <div className="section-label ruled">CONTROLE POR GESTOS</div>
    <p className="help">Voz e câmera funcionam juntas. Aqui, cada página corresponde a um bloco do roteiro.</p>
    <label>Câmera<select value={prefs.device} disabled={running || starting} onChange={e => setPrefs({ ...prefs, device: e.target.value })}>
      <option value="">Câmera padrão</option>
      {prefs.device && !devices.some(d => d.deviceId === prefs.device) && <option value={prefs.device}>Câmera salva (indisponível)</option>}
      {devices.filter(d => d.deviceId).map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Câmera ${i + 1}`}</option>)}
    </select></label>
    <label>IA de imagem<select value={prefs.provider} disabled={running || starting} onChange={e => setPrefs({ ...prefs, provider: e.target.value })}>
      <option value="local">Local · MediaPipe</option><option value="gemini">Gemini · imagens na nuvem</option>
    </select></label>
    <p className="help">{prefs.provider === 'local' ? 'Processamento no servidor local. Instalação: npm run setup:gestures.' : 'Envia quadros da câmera ao Gemini enquanto ligada. Usa a chave do backend; depende de internet e cota. Sustente o sinal até ser confirmado.'}</p>
    <video ref={video} muted playsInline className="gesture-preview" aria-label="Prévia da câmera de gestos" />
    <button onClick={running || starting ? stop : () => void start()}>{starting ? 'Cancelar câmera' : running ? 'Desligar câmera' : 'Ligar câmera e testar'}</button>
    <label className="check"><input type="checkbox" checked={armed} disabled={!running || !available} onChange={e => { gate.current = new GestureGate(); setArmed(e.target.checked); }} />Executar ações no roteiro</label>
    <div className="gesture-status" role="status"><strong>{detected}</strong><p>{status}</p><small>{last}</small></div>
    <details><summary>Configurar os 10 sinais</summary>
      <p className="help">Mostre a mão inteira, de frente. Use apenas uma mão nos sete primeiros sinais. Os três últimos exigem duas mãos. Sinais já atribuídos ficam indisponíveis.</p>
      {actions.map(([id, label]) => <label key={id}>{label}<select value={prefs.bindings[id]} disabled={armed} onChange={e => bind(id, e.target.value)}>
        <option value="">Sem gesto</option>{gestures.map(([g, name]) => <option key={g} value={g} disabled={actions.some(([a]) => a !== id && prefs.bindings[a] === g)}>{name}</option>)}
      </select></label>)}
      <button disabled={armed} onClick={() => { gate.current = new GestureGate(); setPrefs({ ...prefs, bindings: defaultBindings }); }}>Restaurar sinais padrão</button>
    </details>
  </section>;
}
