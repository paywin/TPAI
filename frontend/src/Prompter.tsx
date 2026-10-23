import { memo, useEffect, useMemo, useRef } from "react";
import { Session, words } from "./types";
const WordGroup = memo(function WordGroup({
  tokens,
  start,
  active,
}: {
  tokens: string[];
  start: number;
  active: number;
}) {
  return (
    <>
      {tokens.map((w, i) => (
        <span
          key={i}
          data-word={start + i}
          className={i === active ? "current-word" : ""}
        >
          {w}{" "}
        </span>
      ))}
    </>
  );
});
export default function Prompter({
  session,
  small = false,
}: {
  session: Session;
  small?: boolean;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const target = useRef(0),
    y = useRef(0);
  const mode = useRef(session.reading.state);
  mode.current = session.reading.state;
  const tokens = useMemo(() => words(session.script), [session.script]);
  const groups = useMemo(
    () =>
      Array.from({ length: Math.ceil(tokens.length / 80) }, (_, i) =>
        tokens.slice(i * 80, (i + 1) * 80),
      ),
    [tokens],
  );
  useEffect(() => {
    y.current = 0;
  }, [session.script?.id]);
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const measure = () => {
      const word = el.querySelector<HTMLElement>(
        `[data-word="${session.reading.position}"]`,
      );
      if (word)
        target.current =
          word.offsetTop - (el.clientHeight * session.settings.guide) / 100;
    };
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(el);
    return () => resize.disconnect();
  }, [
    session.reading.position,
    session.settings.fontSize,
    session.settings.guide,
    tokens,
  ]);
  useEffect(() => {
    let frame: number,
      last = performance.now();
    const animate = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (mode.current === "READING" || mode.current === "MANUAL")
        y.current += (target.current - y.current) * (1 - Math.exp(-dt * 7));
      if (viewport.current) viewport.current.scrollTop = Math.max(0, y.current);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div className={"prompter-wrap " + (small ? "small" : "")}>
      <div
        className="reading-line"
        style={{ top: `${session.settings.guide}%` }}
      >
        <span>▶</span>
      </div>
      <div
        className="prompter-viewport"
        ref={viewport}
        style={{
          fontSize: small
            ? Math.max(24, session.settings.fontSize * 0.55)
            : session.settings.fontSize,
          transform: session.settings.mirror ? "scaleX(-1)" : undefined,
        }}
      >
        <div
          className="prompter-copy"
          style={{ paddingTop: small ? "100px" : "35vh" }}
        >
          {tokens.length ? (
            groups.map((group, i) => (
              <WordGroup
                key={i}
                tokens={group}
                start={i * 80}
                active={
                  session.reading.position >= i * 80 &&
                  session.reading.position < (i + 1) * 80
                    ? session.reading.position - i * 80
                    : -1
                }
              />
            ))
          ) : (
            <span>Carregue um roteiro no painel do operador.</span>
          )}
        </div>
      </div>
    </div>
  );
}
