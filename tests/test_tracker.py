import pytest

from backend.tracker import ScriptTracker

TEXT = "Boa noite. Está começando o Panorama. Hoje vamos olhar para as ideias que aproximam a cidade das pessoas. Novas rotas de mobilidade conectam bairros e encurtam distâncias. Nossa equipe foi às ruas ouvir quem faz esse caminho todos os dias. Neste fim de semana praças recebem música cinema e atividades gratuitas."


def tracker():
    t = ScriptTracker(TEXT)
    t.automatic()
    return t


@pytest.mark.parametrize("delay", [0.1, 0.6, 3.0])
def test_reading_at_different_speeds(delay):
    t = tracker()
    for i, phrase in enumerate(
        [
            "Boa noite está começando",
            "o panorama hoje vamos",
            "olhar para as ideias",
            "que aproximam a cidade",
        ]
    ):
        t.voice(True, i * delay)
        result = t.transcript(phrase, True, str(i))
        assert result["state"] == "READING"
    assert result["position"] == 15


def test_silence_and_short_pause():
    t = tracker()
    t.transcript("boa noite está começando", True)
    position = t.reading.position
    t.voice(True, 0)
    t.voice(False, 0.2)
    assert t.reading.state == "READING"
    t.voice(False, 1)
    assert t.reading.state == "SILENCE"
    t.voice(False, 20)
    assert t.reading.position == position


def test_improvisation_and_return():
    t = tracker()
    t.transcript("boa noite está começando", True)
    pos = t.reading.position
    t.voice(True)
    t.transcript("preciso comentar outra coisa", True, "a")
    t.transcript("sobre futebol internacional agora", True, "b")
    assert t.reading.state == "IMPROVISING"
    assert t.reading.position == pos
    t.transcript("o panorama hoje vamos", True, "c")
    assert t.reading.state == "READING"


def test_partial_revisions_and_duplicates():
    t = tracker()
    t.transcript("boa noite está", False, "1")
    first = t.reading.position
    t.transcript("boa noite está", False, "1")
    assert t.reading.position == first
    t.transcript("boa noite está começando o panorama", True, "1")
    assert t.reading.position == 5


def test_repeat_words_and_asr_error():
    t = tracker()
    t.transcript("boa boa noite esta comecando", True)
    assert t.reading.position == 3
    t.transcript("boa noite está", True, "repeat")
    assert t.reading.position == 2


def test_jump_requires_confirmation():
    t = tracker()
    phrase = "Neste fim de semana praças recebem música"
    t.transcript(phrase, False, "1")
    assert t.reading.position == 0
    assert t.reading.state == "SEARCHING"
    t.transcript(phrase, True, "1")
    assert t.reading.position > 35


def test_single_word_false_positive_does_not_move():
    t = tracker()
    t.transcript("boa noite está começando", True)
    pos = t.reading.position
    t.transcript("cidade", True, "x")
    assert t.reading.position == pos


def test_manual_overrides_audio_and_recovers():
    t = tracker()
    t.manual(12)
    t.transcript("boa noite está começando", True)
    t.voice(False, 100)
    assert t.reading.position == 12 and t.reading.state == "MANUAL"
    t.automatic()
    t.transcript("ideias que aproximam a cidade", True, "return")
    assert t.reading.state == "READING"


def test_failure_is_not_silence():
    t = tracker()
    t.transcript("boa noite está começando", True)
    pos = t.reading.position
    t.failure()
    assert t.reading.state == "SEARCHING" and t.reading.position == pos


def test_empty_and_boundary():
    t = ScriptTracker("")
    t.automatic()
    t.transcript("qualquer coisa", True)
    t.manual(100)
    assert t.reading.position == 0
    t = tracker()
    t.manual(-50)
    assert t.reading.position == 0


def test_ambiguous_distant_phrase_holds():
    t = ScriptTracker(
        "inicio texto "
        + "palavra " * 40
        + "esta frase foi repetida "
        + "outra " * 40
        + "esta frase foi repetida"
    )
    t.automatic()
    for i in range(3):
        t.transcript("esta frase foi repetida", True, str(i))
    assert t.reading.position == 0


def test_skip_short_sentence():
    t = tracker()
    t.transcript("boa noite está começando", True)
    t.transcript("Novas rotas de mobilidade conectam bairros", True, "skip")
    assert t.reading.position == 23


def test_long_script_recovers_using_rare_anchor():
    t = ScriptTracker(
        "palavras comuns " * 5000
        + "reportagem exclusiva sobre astronomia nacional"
        + " texto seguinte" * 5000
    )
    t.automatic()
    t.transcript("reportagem exclusiva sobre astronomia nacional", False, "1")
    assert t.reading.position == 0
    t.transcript("reportagem exclusiva sobre astronomia nacional", True, "1")
    assert t.reading.position == 10004
    assert t.reading.latency_ms < 1000  # Generous regression bound, not an SLA.
