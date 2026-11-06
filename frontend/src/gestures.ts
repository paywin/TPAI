import { words, type Session } from './types.js';

export const gestures = [
  ['Open_Palm', '🖐 Palma aberta'], ['Closed_Fist', '✊ Punho fechado'],
  ['Thumb_Up', '👍 Polegar para cima'], ['Thumb_Down', '👎 Polegar para baixo'],
  ['Victory', '✌ Indicador e médio em V'], ['Pointing_Up', '☝ Indicador para cima'],
  ['ILoveYou', '🤟 Polegar, indicador e mínimo'], ['Two_Palms', '🖐 🖐 Duas palmas abertas'],
  ['Two_Fists', '✊ ✊ Dois punhos fechados'], ['Two_Victories', '✌ ✌ Dois sinais em V'],
] as const;
export type Gesture = typeof gestures[number][0];
export const actions = [
  ['next', 'Próximo bloco / página'], ['previous', 'Bloco / página anterior'],
  ['down', 'Avançar 5 palavras'], ['up', 'Voltar 5 palavras'],
  ['pause', 'Pausar leitura'], ['resume', 'Retomar leitura'],
  ['start', 'Início do roteiro'], ['end', 'Último bloco'],
  ['faster', 'Acelerar rolagem manual'], ['slower', 'Desacelerar rolagem manual'],
] as const;
export type Action = typeof actions[number][0];
export type Bindings = Record<Action, Gesture | ''>;
export class VoiceBarrier {
  until = 0;
  last = '';
  blocked = '';
  hold(now: number) { this.until = now + 1500; this.blocked = this.last; }
  accept(id: string, now: number) {
    // Vosk appends partial/final to the utterance ID; both belong to the same speech.
    const utterance = id.split(':')[0];
    this.last = utterance;
    if (now < this.until) { this.blocked = utterance; return false; }
    return !utterance || utterance !== this.blocked;
  }
}
export const defaultBindings: Bindings = {
  next: 'Victory', previous: 'Pointing_Up', down: 'Thumb_Up', up: 'Thumb_Down',
  pause: 'Open_Palm', resume: 'Closed_Fist', start: 'Two_Palms', end: 'Two_Fists',
  faster: 'ILoveYou', slower: 'Two_Victories',
};
export function validBindings(value: unknown): value is Bindings {
  if (!value || typeof value !== 'object') return false;
  const entries = actions.map(([id]) => (value as Bindings)[id]);
  return entries.every(g => g === '' || gestures.some(([id]) => id === g)) &&
    new Set(entries.filter(Boolean)).size === entries.filter(Boolean).length;
}

// Require release, stable consecutive observations, and one fire per presentation.
export class GestureGate {
  armed = false;
  candidate: string | null = null;
  since = 0;
  count = 0;
  neutralSince: number | null = null;
  last = 0;
  update(gesture: string | null, neutral: boolean, now: number): string | null {
    if (now - this.last > 5000) { this.armed = false; this.candidate = null; this.neutralSince = null; }
    this.last = now;
    if (neutral) {
      this.candidate = null; this.count = 0;
      this.neutralSince ??= now;
      if (now - this.neutralSince >= 600) this.armed = true;
      return null;
    }
    this.neutralSince = null;
    if (!gesture) { this.candidate = null; this.count = 0; return null; }
    if (!this.armed) return null;
    if (gesture !== this.candidate) { this.candidate = gesture; this.since = now; this.count = 1; return null; }
    this.count++;
    if (this.count >= 3 && now - this.since >= 900) {
      this.armed = false; this.candidate = null;
      return gesture;
    }
    return null;
  }
}

export function gesturePosition(session: Session, action: Action): number {
  const starts: number[] = [];
  let count = 0;
  for (const block of session.script?.blocks ?? []) {
    const length = block.text.match(/\S+/g)?.length ?? 0;
    if (length) starts.push(count);
    count += length;
  }
  const pos = session.reading.position;
  let target = pos;
  if (action === 'next') target = starts.find(p => p > pos) ?? Math.max(0, count - 1);
  if (action === 'previous') target = [...starts].reverse().find(p => p < ([...starts].reverse().find(p => p <= pos) ?? 0)) ?? 0;
  if (action === 'down') target += 5;
  if (action === 'up') target -= 5;
  if (action === 'start') target = 0;
  if (action === 'end') target = starts[starts.length - 1] ?? 0;
  return Math.max(0, Math.min(target, Math.max(0, words(session.script).length - 1)));
}
