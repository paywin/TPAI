import { uid } from "./id";
import { remapPosition } from "./liveScript";
import { useEffect, useRef, useState } from "react";
import { defaults, Session, words } from "./types";
import { ScriptTracker } from "./tracker";
import { startSpeech, speechSupported } from "./speech";
import { actions, gesturePosition, VoiceBarrier, type Action } from "./gestures";

export function useSession(presenter = false) {
  const [state, setState] = useState<Session>(structuredClone(defaults));
  const [connected, setConnected] = useState(!presenter);
  const current = useRef(state);
  const tracker = useRef(new ScriptTracker([]));
  const bus = useRef<BroadcastChannel | null>(null);
  const stopSpeech = useRef<(() => void) | null>(null);
  const generation = useRef(0);
  const voiceBarrier = useRef(new VoiceBarrier());
  const resumeVoice = useRef(false);
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sessionId = useRef(presenter ? new URLSearchParams(location.search).get("session") ?? "missing" : uid());
  const publish = (next: Session) => {
    current.current = next;
    setState(next);
    bus.current?.postMessage({ type: "session", state: next });
  };
  const applySaved = (script: NonNullable<Session["script"]>) => {
    const old = current.current;
    if (!old.script || old.script.id !== script.id) return;
    const position = remapPosition(old.script, script, old.reading.position);
    tracker.current = new ScriptTracker(words(script));
    tracker.current.reading = {...old.reading, position};
    publish({...old, script, reading: {...tracker.current.reading}});
  };
  const stop = () => {
    generation.current++;
    stopSpeech.current?.();
    stopSpeech.current = null;
    clearTimeout(silenceTimer.current);
    silenceTimer.current = undefined;
  };
  const scheduleSilence = () => {
    clearTimeout(silenceTimer.current);
    silenceTimer.current = setTimeout(() => {
      silenceTimer.current = undefined;
      tracker.current.silence();
      publish({ ...current.current, reading: { ...tracker.current.reading } });
    }, current.current.settings.silenceMs);
  };
  useEffect(() => {
    const channel = new BroadcastChannel(`pulso:${sessionId.current}`);
    bus.current = channel;
    const edits = new BroadcastChannel("pulso-saved-scripts");
    edits.onmessage = e => { if (!presenter && e.data?.type === "saved") applySaved(e.data.script); };
    let lastSeen = Date.now();
    channel.onmessage = e => {
      if (presenter && e.data.type === "session") {
        lastSeen = Date.now(); setConnected(true);
        current.current = e.data.state; setState(e.data.state);
      }
      if (!presenter && e.data.type === "ready") channel.postMessage({ type: "session", state: current.current });
    };
    if (presenter) channel.postMessage({ type: "ready" });
    const heartbeat = setInterval(() => {
      if (presenter) {
        if (Date.now() - lastSeen > 4000) setConnected(false);
        channel.postMessage({type: "ready"});
      } else channel.postMessage({ type: "session", state: current.current });
    }, 1000);
    return () => { stop(); clearInterval(heartbeat); edits.close(); channel.close(); bus.current = null; };
  }, [presenter]);
  const send = (data: Record<string, unknown>) => {
    if (presenter) return;
    if (data.type === "saved") {
      applySaved(data.script as NonNullable<Session["script"]>);
      const edits = new BroadcastChannel("pulso-saved-scripts");
      edits.postMessage(data); edits.close();
      return;
    }
    let next = { ...current.current, error: "" };
    if (data.type === 'gesture') {
      const action = data.action as Action;
      if (!next.script || !actions.some(([id]) => id === action)) return;
      if (action === 'faster' || action === 'slower') {
        next.settings = { ...next.settings, speed: Math.max(5, Math.min(150, next.settings.speed + (action === 'faster' ? 5 : -5))) };
      } else if (action === 'pause') {
        if (tracker.current.reading.state !== 'MANUAL' || next.playing)
          resumeVoice.current = tracker.current.reading.state !== 'MANUAL';
        tracker.current.manual(); next.playing = false;
      } else if (action === 'resume') {
        if ((resumeVoice.current || tracker.current.reading.state !== 'MANUAL') && next.audio) { tracker.current.automatic(); next.playing = false; }
        else { tracker.current.manual(); next.playing = true; }
      } else {
        const automatic = tracker.current.reading.state !== 'MANUAL';
        tracker.current.manual(gesturePosition(next, action));
        if (automatic) tracker.current.reading.state = 'READING';
      }
      // Ignore in-flight speech from before the gesture, without closing the microphone.
      voiceBarrier.current.hold(performance.now());
      clearTimeout(silenceTimer.current); silenceTimer.current = undefined;
      next.reading = { ...tracker.current.reading }; publish(next); return;
    }
    if (data.type === "load") {
      stop();
      resumeVoice.current = false;
      next = { ...next, script: data.script as Session["script"], audio: false, audioStarting: false, playing: false, transcript: null };
      tracker.current = new ScriptTracker(words(next.script));
    }
    if (data.type === "settings") {
      const patch = data.settings as Partial<Session["settings"]>;
      if (patch.provider && patch.provider !== next.settings.provider) { stop(); next.audio = false; next.audioStarting = false; tracker.current.manual(); }
      next.settings = { ...next.settings, ...patch };
    }
    if (data.type === "manual") {
      tracker.current.manual(Number(data.position ?? tracker.current.reading.position));
      next.playing = !!data.playing;
    }
    if (data.type === "auto") {
      if (!next.audio && next.settings.provider !== "simulator") next.error = "Ligue o microfone antes de acompanhar por voz.";
      else { tracker.current.automatic(); next.playing = false; }
    }
    if (data.type === "simulate") {
      const text = String(data.text ?? "");
      tracker.current.transcript(text, String(data.utterance ?? "simulator"));
      next.transcript = {text, final: true, confidence: null};
      scheduleSilence();
    }
    if (data.type === "silence") tracker.current.silence();
    if (data.type === "audio_stop") { stop(); next.audio = false; next.audioStarting = false; next.level = 0; next.playing = false; tracker.current.manual(); }
    if (data.type === "audio_start") {
      stop();
      voiceBarrier.current = new VoiceBarrier();
      next.audioStarting = true;
      const version = generation.current;
      try {
        stopSpeech.current = startSpeech(next.settings.provider === "gemini" ? "gemini" : "vosk", {
          ready() { if (version === generation.current) publish({ ...current.current, audio: true, audioStarting: false, error: "" }); },
          result(text, final, confidence, id) {
            if (version !== generation.current) return;
            if (!voiceBarrier.current.accept(id, performance.now())) return;
            tracker.current.transcript(text, id);
            publish({ ...current.current, transcript: {text, final, confidence}, reading: {...tracker.current.reading} });
          },
          voice(active, level) {
            if (version !== generation.current) return;
            publish({ ...current.current, level });
            if (active) scheduleSilence();
            else if (!silenceTimer.current) scheduleSilence();
          },
          error(message) {
            if (version !== generation.current) return;
            stop(); tracker.current.manual();
            publish({ ...current.current, audio: false, audioStarting: false, playing: false, error: message, reading: {...tracker.current.reading} });
          },
        });
      } catch (e) { next.error = e instanceof Error ? e.message : String(e); next.audio = false; next.audioStarting = false; }
    }
    next.reading = { ...tracker.current.reading };
    publish(next);
  };
  return { state, connected, rtt: 0, send, sessionId: sessionId.current, speechAvailable: speechSupported() };
}
