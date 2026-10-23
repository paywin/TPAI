"""Deterministic, bounded incremental script alignment. No generative decisions."""

import re
import time
import unicodedata
from dataclasses import asdict, dataclass
from difflib import SequenceMatcher


def normalize(text):
    return re.sub(
        r"[^\w]",
        "",
        unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower(),
    )


@dataclass
class Reading:
    state: str = "MANUAL"
    position: int = 0
    confidence: float = 0.0  # Alignment score, NOT recognizer confidence.
    latency_ms: float = 0.0


class ScriptTracker:
    def __init__(self, text="", silence_ms=650):
        self.tokens = [normalize(m.group()) for m in re.finditer(r"\S+", text)]
        self.index = {}
        for i, word in enumerate(self.tokens):
            self.index.setdefault(word, []).append(i)
        self.reading = Reading()
        self.silence_ms = silence_ms
        self.last_voice = None
        self.pending = None
        self.misses = 0
        self.last_event = None

    def manual(self, position=None):
        self.reading.state = "MANUAL"
        if position is not None:
            self.reading.position = max(
                0, min(int(position), max(0, len(self.tokens) - 1))
            )
        self.pending = None
        return self.snapshot()

    def automatic(self):
        self.reading.state = "SEARCHING"
        self.last_event = None
        self.last_voice = None
        return self.snapshot()

    def voice(self, active, now=None):
        now = time.monotonic() if now is None else now
        if active:
            self.last_voice = now
        elif self.reading.state != "MANUAL" and (
            self.last_voice is None or (now - self.last_voice) * 1000 >= self.silence_ms
        ):
            self.reading.state = "SILENCE"
            self.reading.confidence = 0
        return self.snapshot()

    def failure(self):
        if self.reading.state != "MANUAL":
            self.reading.state = "SEARCHING"
        self.reading.confidence = 0
        return self.snapshot()

    def snapshot(self):
        return asdict(self.reading)

    def transcript(self, text, final=False, utterance="", now=None):
        start = time.perf_counter()
        if self.reading.state == "MANUAL":
            return self.snapshot()
        heard = [normalize(w) for w in text.split() if normalize(w)][-24:]
        event = (utterance, tuple(heard), final)
        if not heard or event == self.last_event:
            return self.snapshot()
        self.last_event = event
        n = len(heard)
        pos = self.reading.position
        # Local window first; recovery uses an inverted lexical anchor search.
        starts = set(range(max(0, pos - 35 - n), min(len(self.tokens), pos + 100)))
        if n >= 4:
            # Rare anchors avoid quadratic work for common/repeated words.
            anchors = sorted(
                enumerate(heard), key=lambda pair: len(self.index.get(pair[1], []))
            )
            for offset, word in anchors[:3]:
                occurrences = self.index.get(word, [])
                if len(occurrences) <= 100:
                    starts.update(
                        max(0, i - offset + delta)
                        for i in occurrences
                        for delta in (-1, 0, 1)
                    )
        similarities = {}
        candidates = []
        for s in sorted(starts):
            # Edit distance permits insertions/deletions and small ASR substitutions.
            previous = list(range(n + 1))
            for j, word in enumerate(self.tokens[s : s + n + 3], 1):
                row = [j]
                for k, spoken in enumerate(heard, 1):
                    key = (word, spoken)
                    if key not in similarities:
                        similarities[key] = (
                            0
                            if word == spoken
                            else (
                                0.4
                                if len(word) > 3
                                and SequenceMatcher(None, word, spoken).ratio() >= 0.78
                                else 1
                            )
                        )
                    cost = similarities[key]
                    row.append(
                        min(row[-1] + 1, previous[k] + 1, previous[k - 1] + cost)
                    )
                previous = row
                if j >= max(1, n - 2):
                    score = 1 - row[-1] / max(n, j)
                    candidates.append((score, s + j - 1, s))
        candidates.sort(key=lambda c: (c[0], -abs(c[1] - pos)), reverse=True)
        if not candidates:
            return self.failure()
        score, target, begin = candidates[0]
        self.reading.confidence = round(max(0, score), 3)
        distant = target < pos - 8 or target > pos + 30
        enough = n >= (4 if distant else 2)
        # Repeated phrases with equally good distant matches are not a safe jump.
        ambiguous = distant and any(
            abs(end - target) > 8 and other >= score - 0.025
            for other, end, _ in candidates[1:]
        )
        accepted = score >= (0.85 if distant else 0.72) and enough and not ambiguous
        if accepted and distant:
            confirmed = (
                self.pending is not None
                and abs(self.pending[0] - target) <= 8
                and self.pending[1] != event
            )
            self.pending = (target, event)
            accepted = confirmed
            if not accepted:
                self.reading.state = "SEARCHING"
        if accepted:
            self.reading.position = target
            self.reading.state = "READING"
            self.misses = 0
            self.pending = None
        elif not distant or score < 0.85:
            self.pending = None
            self.misses += 1
            self.reading.state = "IMPROVISING" if self.misses >= 2 else "SEARCHING"
        self.reading.latency_ms = round((time.perf_counter() - start) * 1000, 2)
        return self.snapshot()
