import { useEffect, useRef, useState } from "react";
import { defaults, Session, words } from "./types";
import { ScriptTracker } from "./tracker";
import { startSpeech, speechSupported } from "./speech";

export function useSession(presenter = false) {
  const [state, setState] = useState<Session>(structuredClone(defaults));
  const [connected, setConnected] = useState(!presenter);
  const current = useRef(state);
  const tracker = useRef(new ScriptTracker([]));
  const bus = useRef<BroadcastChannel | null>(null);
  const stopSpeech = useRef<(() => void) | null>(null);
  const generation = useRef(0);
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sessionId = useRef(presenter ? new URLSearchParams(location.search).get("session") ?? "missing" : crypto.randomUUID());
  const publish = (next: Session) => {
    current.current = next;
    setState(next);
    bus.current?.postMessage({ type: "session", state: next });
  };
  const stop = () => {
    generation.current++;
    stopSpeech.current?.();
    stopSpeech.current = null;
    clearTimeout(silenceTimer.current);
  };
  const scheduleSilence = () => {
    clearTimeout(silenceTimer.current);
    silenceTimer.current = setTimeout(() => {
      tracker.current.silence();
      publish({ ...current.current, reading: { ...tracker.current.reading } });
    }, current.current.settings.silenceMs);
  };
  useEffect(() => {
    const channel = new BroadcastChannel(`pulso:${sessionId.current}`);
    bus.current = channel;
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
    return () => { stop(); clearInterval(heartbeat); channel.close(); bus.current = null; };
  }, [presenter]);
  const send = (data: Record<string, unknown>) => {
    if (presenter) return;
    let next = { ...current.current, error: "" };
    if (data.type === "load") {
      stop();
      next = { ...next, script: data.script as Session["script"], audio: false, playing: false, transcript: null };
      tracker.current = new ScriptTracker(words(next.script));
    }
    if (data.type === "settings") {
      const patch = data.settings as Partial<Session["settings"]>;
      if (patch.provider && patch.provider !== next.settings.provider) { stop(); next.audio = false; tracker.current.manual(); }
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
    if (data.type === "audio_stop") { stop(); next.audio = false; next.playing = false; tracker.current.manual(); }
    if (data.type === "audio_start") {
      stop();
      const version = generation.current;
      try {
        stopSpeech.current = startSpeech({
          ready() { if (version === generation.current) publish({ ...current.current, audio: true, error: "" }); },
          result(text, final, confidence, id) {
            if (version !== generation.current) return;
            tracker.current.transcript(text, id);
            publish({ ...current.current, transcript: {text, final, confidence}, reading: {...tracker.current.reading} });
            scheduleSilence();
          },
          silence() { if (version === generation.current) scheduleSilence(); },
          error(message) {
            if (version !== generation.current) return;
            stop(); tracker.current.manual();
            publish({ ...current.current, audio: false, playing: false, error: message, reading: {...tracker.current.reading} });
          },
        });
      } catch (e) { next.error = e instanceof Error ? e.message : String(e); next.audio = false; }
    }
    next.reading = { ...tracker.current.reading };
    publish(next);
  };
  return { state, connected, rtt: 0, send, sessionId: sessionId.current, speechAvailable: speechSupported() };
}
