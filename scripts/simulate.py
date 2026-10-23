"""Offline benchmark: python -m scripts.simulate. No microphone/API."""

import statistics

from backend.tracker import ScriptTracker

text = "Boa noite está começando o Panorama hoje vamos olhar para as ideias que aproximam a cidade das pessoas"
times = []
for _ in range(30):
    tracker = ScriptTracker(text)
    tracker.automatic()
    for i in range(0, len(text.split()) - 3, 3):
        result = tracker.transcript(" ".join(text.split()[i : i + 4]), True, str(i))
        times.append(result["latency_ms"])
print(
    f"{len(times)} eventos: mediana={statistics.median(times):.2f} ms; p95={sorted(times)[int(len(times) * 0.95)]:.2f} ms; máximo={max(times):.2f} ms"
)
