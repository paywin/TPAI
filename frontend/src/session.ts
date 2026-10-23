import { useEffect, useRef, useState } from "react";
import { defaults, Session, words } from "./types";
import { API_BASE } from "./storage";
const channelName = "pulso-presentation";
export function useSession(presenter = false) {
  const [state, setState] = useState<Session>(defaults);
  const [connected, setConnected] = useState(false);
  const [rtt, setRtt] = useState(0);
  const ws = useRef<WebSocket | null>(null);
  const current = useRef(state);
  current.current = state;
  const channel = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    const bus = new BroadcastChannel(channelName);
    channel.current = bus;
    bus.onmessage = (e) => {
      if (presenter && e.data.type === "local") setState(e.data.state);
      if (!presenter && e.data.type === "ready")
        bus.postMessage({ type: "local", state: current.current });
    };
    if (presenter) bus.postMessage({ type: "ready" });
    let stopped = false;
    let retry: ReturnType<typeof setTimeout>;
    let lastSeen = Date.now();
    function connect() {
      let opened = false;
      const host = API_BASE
        ? API_BASE.replace("http", "ws")
        : `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;
      const socket = new WebSocket(
        `${host}/ws?role=${presenter ? "presenter" : "operator"}`,
      );
      ws.current = socket;
      socket.onopen = () => {
        opened = true;
        lastSeen = Date.now();
        setConnected(true);
        if (!presenter && current.current.script) {
          socket.send(
            JSON.stringify({ type: "load", script: current.current.script }),
          );
          socket.send(
            JSON.stringify({
              type: "manual",
              position: current.current.reading.position,
            }),
          );
        }
      };
      socket.onmessage = (e) => {
        lastSeen = Date.now();
        const data = JSON.parse(e.data);
        if (data.type === "session") {
          setState((previous) => {
            const next = {
              ...data,
              script: data.script === undefined ? previous.script : data.script,
            };
            if (!presenter) bus.postMessage({ type: "local", state: next });
            return next;
          });
        }
        if (data.type === "pong") setRtt(Math.round(Date.now() - data.sent));
        if (data.type === "error")
          setState((s) => ({ ...s, error: data.message }));
      };
      socket.onclose = () => {
        setConnected(false);
        setState((s) => ({
          ...s,
          audio: false,
          playing: opened ? false : s.playing,
          reading: { ...s.reading, state: "MANUAL" },
          error: "Motor desconectado. Controle manual disponível.",
        }));
        if (!stopped) retry = setTimeout(connect, 2000);
      };
      socket.onerror = () => socket.close();
    }
    connect();
    const ping = setInterval(() => {
      if (ws.current?.readyState === 1) {
        if (Date.now() - lastSeen > 6000) {
          ws.current.close();
          return;
        }
        ws.current.send(JSON.stringify({ type: "ping", sent: Date.now() }));
      }
    }, 2000);
    return () => {
      stopped = true;
      clearTimeout(retry);
      clearInterval(ping);
      ws.current?.close();
      bus.close();
    };
  }, [presenter]);
  const send = (data: Record<string, unknown>) => {
    if (ws.current?.readyState === 1) {
      ws.current.send(JSON.stringify(data));
      return;
    }
    setState((old) => {
      let s = { ...old };
      if (data.type === "load")
        s = {
          ...s,
          script: data.script as Session["script"],
          playing: false,
          reading: { ...s.reading, state: "MANUAL", position: 0 },
        };
      if (data.type === "settings")
        s = { ...s, settings: { ...s.settings, ...(data.settings as object) } };
      if (data.type === "manual")
        s = {
          ...s,
          playing: !!data.playing,
          reading: {
            ...s.reading,
            state: "MANUAL",
            position: Math.max(
              0,
              Math.min(
                Number(data.position ?? s.reading.position),
                words(s.script).length - 1,
              ),
            ),
          },
        };
      channel.current?.postMessage({ type: "local", state: s });
      return s;
    });
  };
  return { state, connected, rtt, send };
}
