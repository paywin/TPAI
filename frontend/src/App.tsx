import { useEffect, useRef, useState } from "react";
import { Block, Script, Settings, words } from "./types";
import { initial } from "./seed";
import { api, validateImport } from "./storage";
import { useSession } from "./session";
import Prompter from "./Prompter";
import "./App.css";

const uid = () => crypto.randomUUID();
const stateNames = {
  MANUAL: "Manual",
  READING: "Acompanhando",
  SILENCE: "Silêncio",
  IMPROVISING: "Fora do roteiro",
  SEARCHING: "Buscando posição",
};
const newBlock = (): Block => ({
  id: uid(),
  title: "Novo bloco",
  text: "",
  duration: "00:30",
  kind: "roteiro",
});
export default function App() {
  const presenter = location.hash === "#presenter";
  const { state, connected, send, sessionId, speechAvailable } = useSession(presenter);
  const [scripts, setScripts] = useState<Script[]>([]);
  const [draft, setDraft] = useState<Script | null>(null);
  const [active, setActive] = useState(0);
  const [page, setPage] = useState<"library" | "editor" | "studio">("library");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [simulation, setSimulation] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const sendRef = useRef(send);
  sendRef.current = send;
  const position = state.reading.position,
    total = words(state.script).length;
  useEffect(() => {
    if (presenter) return;
    let cancelled = false;
    const load = async () => {
      try {
        let loaded = await api<Script[]>("scripts");
        if (!loaded.length && localStorage.getItem("pulso-web-initialized") !== "yes") {
          let legacy: Script[] = [];
          try { legacy = validateImport(JSON.parse(localStorage.getItem("pulso-scripts-v1") || "[]")); } catch { /* Keep original data intact. */ }
          loaded = legacy.length ? legacy : initial;
          for (const script of loaded) await api("scripts/" + script.id, "PUT", script);
        }
        localStorage.setItem("pulso-web-initialized", "yes");
        if (!cancelled) setScripts(loaded);
      } catch {
        if (!cancelled) setNotice("Não foi possível acessar o armazenamento. Verifique as permissões do navegador.");
      }
    };
    void load();
    window.addEventListener("focus", load);
    return () => { cancelled = true; window.removeEventListener("focus", load); };
  }, [presenter]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    if (presenter) return;
    let cursor = state.reading.position,
      last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now(),
        s = stateRef.current;
      if (s.playing && s.reading.state === "MANUAL") {
        cursor += (s.settings.speed / 60) * Math.min((now - last) / 1000, 0.3);
        const end = Math.max(0, words(s.script).length - 1);
        if (Math.floor(cursor) !== s.reading.position || cursor >= end)
          sendRef.current({
            type: "manual",
            position: Math.min(end, Math.floor(cursor)),
            playing: cursor < end,
          });
      } else cursor = s.reading.position;
      last = now;
    }, 100);
    return () => clearInterval(timer);
  }, [presenter, state.playing, state.script?.id]);
  useEffect(() => {
    if (presenter) return;
    const key = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).matches("input,textarea,select") ||
        page !== "studio"
      )
        return;
      if (e.code === "Space") {
        e.preventDefault();
        sendRef.current({ type: "manual", playing: !stateRef.current.playing });
      }
      if (e.code === "Escape") sendRef.current({ type: "manual" });
      if (e.code === "ArrowDown" || e.code === "ArrowUp") {
        e.preventDefault();
        sendRef.current({
          type: "manual",
          position:
            stateRef.current.reading.position +
            (e.code === "ArrowDown" ? 5 : -5),
        });
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [page, presenter]);
  const changePage = (next: typeof page) => {
    if (dirty && !confirm("Descartar as alterações não salvas?")) return;
    setDirty(false);
    setPage(next);
  };
  const edit = (script: Script) => {
    if (dirty && !confirm("Descartar as alterações não salvas?")) return;
    setDraft(structuredClone(script));
    setActive(0);
    setDirty(false);
    setPage("editor");
  };
  const update = (patch: Partial<Script>) => {
    if (draft) {
      setDraft({ ...draft, ...patch });
      setDirty(true);
    }
  };
  const updateBlock = (patch: Partial<Block>) => {
    if (draft)
      update({
        blocks: draft.blocks.map((b, i) =>
          i === active ? { ...b, ...patch } : b,
        ),
      });
  };
  const persist = async (s: Script) => {
    const saved = { ...s, updated: new Date().toISOString() };
    await api("scripts/" + saved.id, "PUT", saved);
    setScripts(await api<Script[]>("scripts"));
    return saved;
  };
  const save = async (present = false) => {
    if (!draft) return;
    if (
      !draft.title.trim() ||
      draft.blocks.some((b) => !/^\d{1,3}:[0-5]\d$/.test(b.duration))
    ) {
      setNotice("Preencha o título e as durações no formato MM:SS.");
      return;
    }
    setBusy(true);
    try {
      const saved = await persist(draft);
      setDraft(saved);
      setDirty(false);
      setNotice(
        connected
          ? "Roteiro salvo."
          : "Salvo neste navegador.",
      );
      if (present) {
        send({ type: "load", script: saved });
        setPage("studio");
      }
    } catch (e) {
      setNotice(String(e));
    } finally {
      setBusy(false);
    }
  };
  const prepare = (s: Script) => {
    send({ type: "load", script: s });
    setPage("studio");
  };
  const settings = (patch: Partial<Settings>) =>
    send({ type: "settings", settings: patch });
  const exportScript = (s: Script) => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(s, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = s.title.replace(/[^\p{L}\p{N} _-]/gu, "") + ".json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const importFile = async (f?: File) => {
    if (!f) return;
    if (f.size > 5_000_000) {
      setNotice("O arquivo deve ter até 5 MB.");
      return;
    }
    try {
      const imported = validateImport(JSON.parse(await f.text()));
      for (const s of imported) await api("scripts/" + s.id, "PUT", s);
      setScripts(await api<Script[]>("scripts"));
      setNotice(`${imported.length} roteiro(s) importado(s).`);
    } catch (e) {
      setNotice(String(e));
    }
  };
  const openPresenter = () => {
    const url = new URL(location.href);
    url.hash = "presenter";
    url.searchParams.set("session", sessionId);
    if (!window.open(url.href, `pulso-presenter-${sessionId}`, "popup,width=1280,height=720"))
      setNotice("Permita pop-ups para abrir a tela do apresentador.");
  };
  const findMonitors = () => setNotice("Arraste a janela do apresentador até o segundo monitor. Dê duplo clique no texto para entrar em tela cheia.");
  if (presenter)
    return (
      <div
        className="presenter"
        onDoubleClick={() => {
          document.documentElement.requestFullscreen().catch(() => {});
        }}
      >
        <Prompter session={state} />
        {!connected && (
          <div className="presenter-status">
            Aguardando o painel do operador
          </div>
        )}
      </div>
    );
  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => changePage("library")}>
          <span className="brand-mark">P</span> PULSO
        </button>
        <span className="edition">TELEPROMPTER / WEB</span>
        <div className="connection">
          <i className={connected ? "on" : ""} />
          {connected ? "Pronto no navegador" : "Modo local"}
        </div>
      </header>
      <div className="workspace">
        <nav className="rail">
          <span className="nav-label">OPERAÇÃO</span>
          <button
            className={page === "library" ? "active" : ""}
            onClick={() => changePage("library")}
          >
            <span>01</span> Roteiros <small>{scripts.length}</small>
          </button>
          <button
            className={page === "editor" ? "active" : ""}
            disabled={!draft}
            onClick={() => changePage("editor")}
          >
            <span>02</span> Editor
          </button>
          <button
            className={page === "studio" ? "active" : ""}
            disabled={!state.script}
            onClick={() => changePage("studio")}
          >
            <span>03</span> Apresentação
          </button>
          <div className="rail-bottom">
            <span className="brand-rule" />
            <p>O ritmo é de quem fala.</p>
            <small>
              Controle local
              <br />
              PULSO Web v0.2
            </small>
          </div>
        </nav>
        <main>
          {notice && (
            <div role="status" className="notice">
              {notice}
              <button aria-label="Fechar aviso" onClick={() => setNotice("")}>
                ×
              </button>
            </div>
          )}
          {page === "library" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="kicker">BIBLIOTECA</div>
                  <h1>Roteiros</h1>
                  <p>Prepare o texto. Encontre o seu ritmo.</p>
                </div>
                <button
                  className="primary"
                  onClick={() => {
                    edit({
                      id: uid(),
                      title: "Novo roteiro",
                      program: "",
                      updated: "",
                      status: "Em edição",
                      blocks: [newBlock()],
                    });
                    setDirty(true);
                  }}
                >
                  + Novo roteiro
                </button>
              </div>
              <div className="library-tools">
                <input
                  aria-label="Buscar roteiros"
                  placeholder="Buscar por título ou programa…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <button onClick={() => file.current?.click()}>
                  Importar JSON
                </button>
                <input
                  ref={file}
                  hidden
                  type="file"
                  accept=".json"
                  onChange={(e) => {
                    void importFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </div>
              <div className="script-table">
                <div className="table-head">
                  <span>ROTEIRO / PROGRAMA</span>
                  <span>BLOCOS</span>
                  <span>SITUAÇÃO</span>
                  <span>AÇÕES</span>
                </div>
                {scripts
                  .filter((s) =>
                    (s.title + " " + s.program)
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  )
                  .map((s, i) => (
                    <article className="script-row" key={s.id}>
                      <div className="script-name">
                        <span className="row-number">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <div>
                          <button onClick={() => edit(s)}>{s.title}</button>
                          <p>{s.program || "Sem programa"}</p>
                        </div>
                      </div>
                      <span className="mono">
                        {String(s.blocks.length).padStart(2, "0")}
                      </span>
                      <span
                        className={
                          "status " + (s.status === "Pronto" ? "ready" : "")
                        }
                      >
                        {s.status}
                      </span>
                      <div className="row-actions">
                        <button onClick={() => edit(s)}>Editar</button>
                        <button
                          className="text-accent"
                          onClick={() => prepare(s)}
                        >
                          Preparar ↗
                        </button>
                        <button
                          aria-label={`Exportar ${s.title}`}
                          onClick={() => exportScript(s)}
                        >
                          ↓
                        </button>
                      </div>
                    </article>
                  ))}
              </div>
              {!scripts.length && (
                <div className="empty">
                  <h2>Sua biblioteca está vazia.</h2>
                  <p>Crie um roteiro ou importe um arquivo JSON.</p>
                </div>
              )}
              {!!scripts.length &&
                !scripts.some((s) =>
                  (s.title + " " + s.program)
                    .toLowerCase()
                    .includes(query.toLowerCase()),
                ) && <div className="empty">Nenhum roteiro encontrado.</div>}
              <div className="library-foot">
                <span>ARMAZENAMENTO LOCAL</span>
                <p>
                  Roteiros no seu computador. Exportação em JSON para transporte
                  e backup.
                </p>
              </div>
            </>
          )}
          {page === "editor" && draft && (
            <>
              <div className="page-heading">
                <div>
                  <div className="kicker">EDITOR DE BLOCOS</div>
                  <h1>{draft.title}</h1>
                  <p>{dirty ? "Alterações não salvas" : "Versão salva"}</p>
                </div>
                <div className="actions">
                  <button disabled={busy} onClick={() => save()}>
                    Salvar
                  </button>
                  <button
                    disabled={busy}
                    className="primary"
                    onClick={() => save(true)}
                  >
                    Salvar e preparar ↗
                  </button>
                </div>
              </div>
              <div className="editor-layout">
                <aside className="block-list">
                  <div className="section-label">ESPELHO DO ROTEIRO</div>
                  {draft.blocks.map((b, i) => (
                    <button
                      key={b.id}
                      className={i === active ? "active" : ""}
                      onClick={() => setActive(i)}
                    >
                      <span className="mono">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span>
                        {b.title}
                        <small>
                          {b.duration} · {b.kind}
                        </small>
                      </span>
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      update({ blocks: [...draft.blocks, newBlock()] });
                      setActive(draft.blocks.length);
                    }}
                  >
                    + Adicionar bloco
                  </button>
                </aside>
                <section className="editor-paper">
                  <div className="field-grid">
                    <label>
                      Título do roteiro
                      <input
                        maxLength={200}
                        value={draft.title}
                        onChange={(e) => update({ title: e.target.value })}
                      />
                    </label>
                    <label>
                      Programa / edição
                      <input
                        maxLength={200}
                        value={draft.program}
                        onChange={(e) => update({ program: e.target.value })}
                      />
                    </label>
                  </div>
                  <div className="block-heading">
                    <label>
                      Nome do bloco
                      <input
                        value={draft.blocks[active].title}
                        onChange={(e) => updateBlock({ title: e.target.value })}
                      />
                    </label>
                    <label>
                      Duração (MM:SS)
                      <input
                        value={draft.blocks[active].duration}
                        onChange={(e) =>
                          updateBlock({ duration: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Tipo
                      <input
                        value={draft.blocks[active].kind}
                        onChange={(e) => updateBlock({ kind: e.target.value })}
                      />
                    </label>
                  </div>
                  <label className="body-label">
                    Texto para leitura
                    <textarea
                      aria-label="Texto do bloco"
                      value={draft.blocks[active].text}
                      onChange={(e) => updateBlock({ text: e.target.value })}
                      placeholder="Escreva ou cole o texto deste bloco…"
                    />
                  </label>
                  <div className="editor-footer">
                    <span>
                      {
                        draft.blocks[active].text.split(/\s+/).filter(Boolean)
                          .length
                      }{" "}
                      palavras
                    </span>
                    <div className="actions">
                      <button
                        disabled={active === 0}
                        onClick={() => {
                          const blocks = [...draft.blocks];
                          [blocks[active - 1], blocks[active]] = [
                            blocks[active],
                            blocks[active - 1],
                          ];
                          update({ blocks });
                          setActive(active - 1);
                        }}
                      >
                        ↑ Mover bloco
                      </button>
                      <button
                        disabled={draft.blocks.length === 1}
                        onClick={() => {
                          if (confirm("Remover este bloco?")) {
                            update({
                              blocks: draft.blocks.filter(
                                (_, i) => i !== active,
                              ),
                            });
                            setActive(Math.max(0, active - 1));
                          }
                        }}
                      >
                        Remover bloco
                      </button>
                    </div>
                  </div>
                </section>
              </div>
              <div className="editor-bottom">
                <label>
                  Situação
                  <select
                    value={draft.status}
                    onChange={(e) =>
                      update({ status: e.target.value as Script["status"] })
                    }
                  >
                    <option>Em edição</option>
                    <option>Pronto</option>
                  </select>
                </label>
                <button
                  className="danger-link"
                  onClick={async () => {
                    if (confirm(`Excluir “${draft.title}”?`)) {
                      try {
                        await api("scripts/" + draft.id, "DELETE");
                        setScripts(await api<Script[]>("scripts"));
                        setDirty(false);
                        setDraft(null);
                        setPage("library");
                      } catch {
                        setNotice(
                          "Não foi possível excluir. Tente novamente.",
                        );
                      }
                    }
                  }}
                >
                  Excluir roteiro
                </button>
              </div>
            </>
          )}
          {page === "studio" && state.script && (
            <>
              <div className="page-heading">
                <div>
                  <div className="kicker">CONTROLE DE APRESENTAÇÃO</div>
                  <h1>{state.script.title}</h1>
                  <p>
                    {state.script.program} · {total} palavras
                  </p>
                </div>
                <button className="primary" onClick={openPresenter}>
                  Abrir tela do apresentador ↗
                </button>
              </div>
              <div className="studio-layout">
                <section className="monitor-panel">
                  <div className="monitor-header">
                    <span>RETORNO DO APRESENTADOR</span>
                    <span
                      className={
                        "tracking " + state.reading.state.toLowerCase()
                      }
                    >
                      {stateNames[state.reading.state]}
                    </span>
                  </div>
                  <Prompter session={state} small />
                  <div className="transport">
                    <button
                      onClick={() => send({ type: "manual", position: 0 })}
                      aria-label="Voltar ao início"
                    >
                      |←
                    </button>
                    <button
                      onClick={() =>
                        send({ type: "manual", position: position - 5 })
                      }
                    >
                      − 5
                    </button>
                    <button
                      className="primary"
                      onClick={() =>
                        send({ type: "manual", playing: !state.playing })
                      }
                    >
                      {state.playing ? "Pausar" : "Rolar manual"}
                    </button>
                    <button
                      onClick={() =>
                        send({ type: "manual", position: position + 5 })
                      }
                    >
                      + 5
                    </button>
                    <button
                      className="takeover"
                      onClick={() => send({ type: "manual" })}
                    >
                      Assumir manual <kbd>Esc</kbd>
                    </button>
                  </div>
                  <div className="position-control">
                    <input
                      aria-label="Posição no roteiro"
                      type="range"
                      min={0}
                      max={Math.max(0, total - 1)}
                      value={position}
                      onChange={(e) =>
                        send({
                          type: "manual",
                          position: Number(e.target.value),
                        })
                      }
                    />
                    <span className="mono">
                      {Math.min(position + 1, total)} / {total}
                    </span>
                  </div>
                  <div className="metrics">
                    <div>
                      <span>ALINHAMENTO</span>
                      <strong>
                        {Math.round(state.reading.confidence * 100)}
                        <small>%</small>
                      </strong>
                    </div>
                    <div>
                      <span>MOTOR</span>
                      <strong>
                        {state.reading.latency_ms}
                        <small> ms</small>
                      </strong>
                    </div>
                    <div>
                      <span>EXECUÇÃO</span>
                      <strong>
                        <small>Navegador</small>
                      </strong>
                    </div>
                  </div>
                  <section className="transcript">
                    <div className="section-label">
                      TRANSCRIÇÃO{" "}
                      {state.settings.provider === "simulator"
                        ? "· SIMULADOR"
                        : ""}
                    </div>
                    <p>
                      {state.transcript?.text ||
                        "A fala reconhecida aparecerá aqui."}
                    </p>
                    <small>
                      {state.transcript
                        ? state.transcript.final
                          ? "Resultado final"
                          : "Resultado parcial"
                        : "Aguardando entrada"}{" "}
                      · Confiança do reconhecimento:{" "}
                      {state.transcript?.confidence ?? "não fornecida"}
                    </small>
                  </section>
                  {state.error && (
                    <div role="status" className="notice">
                      {state.error}
                    </div>
                  )}
                  <div className="block-jumps">
                    {state.script.blocks.map((b, i) => (
                      <button
                        key={b.id}
                        onClick={() =>
                          send({
                            type: "manual",
                            position: words({
                              ...state.script!,
                              blocks: state.script!.blocks.slice(0, i),
                            }).length,
                          })
                        }
                      >
                        {String(i + 1).padStart(2, "0")} {b.title}
                      </button>
                    ))}
                  </div>
                </section>
                <aside className="settings-panel">
                  <div className="section-label">ENTRADA DE ÁUDIO</div>
                  {!speechAvailable && <p className="help">Este navegador não oferece reconhecimento de voz. Use o modo manual ou abra em Chrome/Edge com HTTPS.</p>}
                  <label>
                    Reconhecimento
                    <select
                      value={state.settings.provider}
                      onChange={(e) =>
                        settings({
                          provider: e.target.value as Settings["provider"],
                        })
                      }
                    >
                      <option value="browser">Navegador · português</option>
                      <option value="simulator">Simulador · sem áudio</option>
                    </select>
                  </label>
                  {state.settings.provider !== "simulator" ? (
                    <>
                      <p className="help">Microfone selecionado nas permissões do navegador. O reconhecimento pode enviar áudio ao serviço do navegador e exigir internet.</p>
                      <p className="audio-status" role="status">{state.audio ? "● Microfone ligado" : "○ Microfone desligado"}</p>
                      <button
                        disabled={!connected}
                        onClick={() =>
                          send({
                            type: state.audio ? "audio_stop" : "audio_start",
                          })
                        }
                      >
                        {state.audio ? "Desligar microfone" : "Ligar microfone"}
                      </button>
                    </>
                  ) : (
                    <div className="simulator">
                      <label>
                        Transcrição de teste
                        <textarea
                          value={simulation}
                          onChange={(e) => setSimulation(e.target.value)}
                          placeholder="Digite um trecho do roteiro"
                        />
                      </label>
                      <button
                        disabled={!connected}
                        onClick={() =>
                          send({
                            type: "simulate",
                            text: simulation,
                            final: true,
                            utterance: uid(),
                          })
                        }
                      >
                        Enviar transcrição
                      </button>
                      <button
                        disabled={!connected}
                        onClick={() => send({ type: "silence" })}
                      >
                        Simular silêncio
                      </button>
                    </div>
                  )}
                  <button
                    className="auto-button"
                    disabled={!connected || !total}
                    onClick={() => send({ type: "auto" })}
                  >
                    Acompanhar por voz
                  </button>
                  <div className="section-label ruled">APRESENTADOR</div>
                  <label>
                    Tamanho da fonte{" "}
                    <output>{state.settings.fontSize} px</output>
                    <input
                      type="range"
                      min={24}
                      max={120}
                      value={state.settings.fontSize}
                      onChange={(e) =>
                        settings({ fontSize: Number(e.target.value) })
                      }
                    />
                  </label>
                  <label>
                    Linha de leitura <output>{state.settings.guide}%</output>
                    <input
                      type="range"
                      min={15}
                      max={70}
                      value={state.settings.guide}
                      onChange={(e) =>
                        settings({ guide: Number(e.target.value) })
                      }
                    />
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={state.settings.mirror}
                      onChange={(e) => settings({ mirror: e.target.checked })}
                    />{" "}
                    Espelhar horizontalmente
                  </label>
                  <label>
                    Ritmo manual{" "}
                    <output>{state.settings.speed} palavras/min</output>
                    <input
                      type="range"
                      min={5}
                      max={150}
                      value={state.settings.speed}
                      onChange={(e) =>
                        settings({ speed: Number(e.target.value) })
                      }
                    />
                  </label>
                  <label>
                    Pausa por silêncio{" "}
                    <output>{state.settings.silenceMs} ms</output>
                    <input
                      type="range"
                      min={200}
                      max={3000}
                      step={50}
                      value={state.settings.silenceMs}
                      onChange={(e) =>
                        settings({ silenceMs: Number(e.target.value) })
                      }
                    />
                  </label>
                  <button onClick={findMonitors}>Identificar telas</button>
                  <p className="help">
                    Espaço: rolar / pausar
                    <br />↑ ↓: ajustar posição · Esc: assumir manual
                  </p>
                </aside>
              </div>
            </>
          )}
        </main>
      </div>
      <footer className="app-footer">
        <span>PULSO / ESTÚDIO DE LEITURA</span>
        <span>
          {connected
            ? "IndexedDB · salvo neste navegador"
            : "IndexedDB · cópia local"}{" "}
          <i /> {new Date().getFullYear()}
        </span>
      </footer>
    </div>
  );
}
