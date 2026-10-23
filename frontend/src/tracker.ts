import type { Reading } from "./types";

export const normalize = (s: string) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Bounded lexical alignment. Transcripts never generate or rewrite the script. */
export class ScriptTracker {
  tokens: string[];
  index = new Map<string, number[]>();
  reading: Reading = { state: "MANUAL", position: 0, confidence: 0, latency_ms: 0 };
  pending: { target: number; event: string } | null = null;
  last = "";
  misses = 0;
  constructor(tokens: string[]) {
    this.tokens = tokens.map(normalize);
    this.tokens.forEach((word, i) => {
      const indices = this.index.get(word) ?? [];
      indices.push(i);
      this.index.set(word, indices);
    });
  }
  manual(position = this.reading.position) {
    this.pending = null;
    this.last = "";
    this.reading = { ...this.reading, state: "MANUAL", position: Math.max(0, Math.min(position, Math.max(0, this.tokens.length - 1))), confidence: 0 };
  }
  automatic() {
    this.last = ""; this.pending = null; this.misses = 0;
    this.reading = { ...this.reading, state: "SEARCHING" };
  }
  silence() {
    if (this.reading.state !== "MANUAL") this.reading = { ...this.reading, state: "SILENCE", confidence: 0 };
  }
  transcript(text: string, eventId: string) {
    if (this.reading.state === "MANUAL") return;
    const started = performance.now();
    const heard = text.split(/\s+/).map(normalize).filter(Boolean).slice(-24);
    const event = eventId + ":" + heard.join(" ");
    if (!heard.length || event === this.last) return;
    this.last = event;
    const n = heard.length, pos = this.reading.position;
    const starts = new Set<number>();
    for (let s = Math.max(0, pos - 35 - n); s < Math.min(this.tokens.length, pos + 100); s++) starts.add(s);
    if (n >= 4) {
      heard.map((word, offset) => ({ offset, indices: this.index.get(word) ?? [] }))
        .sort((a, b) => a.indices.length - b.indices.length).slice(0, 3)
        .forEach(({offset, indices}) => {
          if (indices.length <= 100) for (const i of indices) for (const delta of [-1, 0, 1]) starts.add(Math.max(0, i - offset + delta));
        });
    }
    const candidates: { score: number; target: number }[] = [];
    for (const s of starts) {
      let previous = Array.from({length: n + 1}, (_, k) => k);
      const segment = this.tokens.slice(s, s + n + 3);
      segment.forEach((word, index) => {
        const j = index + 1, row = [j];
        for (let k = 1; k <= n; k++) row.push(Math.min(row[k - 1] + 1, previous[k] + 1, previous[k - 1] + (word === heard[k - 1] ? 0 : 1)));
        previous = row;
        if (j >= Math.max(1, n - 2)) candidates.push({ score: 1 - row[n] / Math.max(n, j), target: s + j - 1 });
      });
    }
    candidates.sort((a, b) => b.score - a.score || Math.abs(a.target - pos) - Math.abs(b.target - pos));
    if (!candidates.length) return;
    const {score, target} = candidates[0];
    const distant = target < pos - 8 || target > pos + 30;
    const ambiguous = distant && candidates.some(c => Math.abs(c.target - target) > 8 && c.score >= score - .025);
    let accepted = score >= (distant ? .85 : .72) && n >= (distant ? 4 : 2) && !ambiguous;
    let state: Reading["state"] = "SEARCHING";
    if (accepted && distant) {
      accepted = !!this.pending && Math.abs(this.pending.target - target) <= 8 && this.pending.event !== event;
      this.pending = {target, event};
    }
    if (accepted) { state = "READING"; this.misses = 0; this.pending = null; }
    else if (!distant || score < .85) { this.pending = null; if (++this.misses >= 2) state = "IMPROVISING"; }
    this.reading = { state, position: accepted ? target : pos, confidence: Math.max(0, score), latency_ms: Math.round((performance.now() - started) * 100) / 100 };
  }
}
