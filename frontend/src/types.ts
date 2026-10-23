export type Block = {
  id: string;
  title: string;
  text: string;
  duration: string;
  kind: string;
};
export type Script = {
  id: string;
  title: string;
  program: string;
  updated: string;
  status: "Pronto" | "Em edição";
  blocks: Block[];
};
export type Settings = {
  fontSize: number;
  mirror: boolean;
  guide: number;
  speed: number;
  provider: "browser" | "simulator";
  device: number | null;
  silenceMs: number;
};
export type Reading = {
  state: "MANUAL" | "READING" | "SEARCHING" | "SILENCE" | "IMPROVISING";
  position: number;
  confidence: number;
  latency_ms: number;
};
export type Session = {
  script: Script | null;
  settings: Settings;
  reading: Reading;
  audio: boolean;
  level: number;
  transcript: {
    text: string;
    final: boolean;
    confidence: number | null;
  } | null;
  error: string;
  playing: boolean;
};
export const defaults: Session = {
  script: null,
  settings: {
    fontSize: 56,
    mirror: false,
    guide: 35,
    speed: 35,
    provider: "browser",
    device: null,
    silenceMs: 650,
  },
  reading: { state: "MANUAL", position: 0, confidence: 0, latency_ms: 0 },
  audio: false,
  level: 0,
  transcript: null,
  error: "",
  playing: false,
};
export const words = (s: Script | null) =>
  s?.blocks.flatMap((b) => b.text.match(/\S+/g) || []) || [];
