// PROTOTYPE shared widgets: preview canvas, field groups, save bar, export dialog.
// Variants arrange these differently; the layouts themselves are not shared.
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Card, FONTS, FRAMES, SLOTS, SNIPPET_BACKGROUNDS, SlotName, Snippet, cardWarnings, newSnippet } from "./model";
import { CARD_H_MM, CARD_W_MM, RenderResult, renderCard } from "./render";
import { Editor } from "./store";

export function useOverflow(card: Card): SlotName[] {
  return useMemo(() => {
    const c = document.createElement("canvas"); c.width = 260; c.height = 425;
    return renderCard(c.getContext("2d")!, card, 260, () => {}).overflow;
  }, [card]);
}

type DragMode = "artwork" | SlotName;

export function CardCanvas({ card, width, ed, interactive, onPickRegion, highlight }: {
  card: Card; width: number; ed?: Editor; interactive?: boolean;
  onPickRegion?: (r: DragMode) => void; highlight?: DragMode | null;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [tick, rerender] = useReducer((x) => x + 1, 0);
  const res = useRef<RenderResult>({ overflow: [], boxes: {} });
  const H = (width * CARD_H_MM) / CARD_W_MM;
  const dpr = window.devicePixelRatio || 1;

  useEffect(() => {
    const c = ref.current!; const g = c.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    res.current = renderCard(g, card, width, rerender);
    if (highlight) {
      const b = highlight === "artwork" ? { y: 0, h: H, w: width } : res.current.boxes[highlight];
      if (b) { g.strokeStyle = "#2f80ed"; g.setLineDash([4, 3]); g.lineWidth = 2; g.strokeRect((width - b.w) / 2 + 1, b.y + 1, b.w - 2, b.h - 2); g.setLineDash([]); }
    }
  }, [card, width, tick, highlight]);

  const drag = useRef<{ mode: DragMode; x: number; y: number; start: Card } | null>(null);
  const regionAt = (y: number): DragMode => {
    for (const s of SLOTS) { const b = res.current.boxes[s]; if (b && y >= b.y && y <= b.y + b.h) return s; }
    return "artwork";
  };
  const onDown = (e: React.PointerEvent) => {
    if (!interactive || !ed) return;
    const r = (e.target as HTMLElement).getBoundingClientRect();
    const mode = regionAt(e.clientY - r.top);
    onPickRegion?.(mode);
    drag.current = { mode, x: e.clientX, y: e.clientY, start: card };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d || !ed) return;
    const dx = (e.clientX - d.x) / width, dy = (e.clientY - d.y) / width;
    if (d.mode === "artwork") ed.updateCard(card.id, { artPanX: d.start.artPanX + dx, artPanY: d.start.artPanY + dy }, false);
    else {
      const s = d.start.snippets[d.mode]!;
      const centerY = Math.min(1, Math.max(0, s.centerY + (e.clientY - d.y) / H));
      ed.updateCard(card.id, (c) => ({ snippets: { ...c.snippets, [d.mode]: { ...c.snippets[d.mode as SlotName]!, centerY } } }), false);
    }
  };
  const onUp = () => { if (drag.current) { drag.current = null; ed?.commit(); } };
  const onWheel = (e: React.WheelEvent) => {
    if (!interactive || !ed) return;
    const r = (e.target as HTMLElement).getBoundingClientRect();
    const mode = regionAt(e.clientY - r.top);
    const f = e.deltaY < 0 ? 1.05 : 1 / 1.05;
    if (mode === "artwork") ed.updateCard(card.id, { artZoom: Math.max(0.2, Math.min(5, card.artZoom * f)) });
    else ed.updateCard(card.id, (c) => ({ snippets: { ...c.snippets, [mode]: { ...c.snippets[mode]!, zoom: Math.max(0.25, Math.min(2, c.snippets[mode]!.zoom * f)) } } }));
  };

  return (
    <canvas
      ref={ref} width={width * dpr} height={H * dpr}
      style={{ width, height: H, borderRadius: 6, boxShadow: "0 2px 10px rgba(0,0,0,.25)", cursor: interactive ? "grab" : "default", touchAction: "none", background: "#fff" }}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onWheel={onWheel}
      title={interactive ? "Drag the artwork to pan, drag a snippet to move it up/down, scroll to zoom" : undefined}
    />
  );
}

export function Warn({ card }: { card: Card }) {
  const w = cardWarnings(card, useOverflow(card));
  return w.length ? <span className="warn" title={w.join("\n")}>⚠</span> : null;
}

// --- Field groups ---------------------------------------------------------

/** Text input that only commits (saves) on blur, like the real app. */
export function BlurText({ value, onCommit, multiline, ...rest }: { value: string; onCommit: (v: string) => void; multiline?: boolean } & Record<string, any>) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const p = { value: v, onChange: (e: any) => setV(e.target.value), onBlur: () => v !== value && onCommit(v), ...rest };
  return multiline ? <textarea rows={3} {...p} /> : <input {...p} />;
}

/** Slider: live preview while dragging, one undo step + save on release. */
export function Slider({ label, value, min, max, step, onLive, onCommit, fmt }: {
  label: string; value: number; min: number; max: number; step: number;
  onLive: (v: number) => void; onCommit: () => void; fmt?: (v: number) => string;
}) {
  return (
    <label className="field">
      <span>{label} <em>{fmt ? fmt(value) : value}</em></span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onLive(+e.target.value)} onPointerUp={onCommit} onKeyUp={onCommit} />
    </label>
  );
}

export function CardFields({ ed, card }: { ed: Editor; card: Card }) {
  return (
    <div className="group">
      <label className="field"><span>Name</span><BlurText value={card.name} onCommit={(name) => ed.updateCard(card.id, { name })} /></label>
      <label className="field"><span>Copies</span>
        <input type="number" min={0} value={card.copies} onChange={(e) => ed.updateCard(card.id, { copies: Math.max(0, +e.target.value) })} />
      </label>
    </div>
  );
}

export function ArtworkFields({ ed, card }: { ed: Editor; card: Card }) {
  return (
    <div className="group">
      <label className="field"><span>Artwork</span>
        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => {
          const f = e.target.files?.[0]; if (!f) return;
          if (f.size > 10 * 1024 * 1024) return alert("Max 10 MB");
          ed.updateCard(card.id, { artworkUrl: URL.createObjectURL(f), artPanX: 0, artPanY: 0, artZoom: 1 });
        }} />
      </label>
      <Slider label="Zoom" value={card.artZoom} min={0.2} max={5} step={0.01} fmt={(v) => `${Math.round(v * 100)}%`}
        onLive={(artZoom) => ed.updateCard(card.id, { artZoom }, false)} onCommit={ed.commit} />
      <Slider label="Pan X" value={card.artPanX} min={-1} max={1} step={0.005} fmt={(v) => v.toFixed(2)}
        onLive={(artPanX) => ed.updateCard(card.id, { artPanX }, false)} onCommit={ed.commit} />
      <Slider label="Pan Y" value={card.artPanY} min={-1.6} max={1.6} step={0.005} fmt={(v) => v.toFixed(2)}
        onLive={(artPanY) => ed.updateCard(card.id, { artPanY }, false)} onCommit={ed.commit} />
      <div className="row">
        <label className="field"><span>Fill colour</span>
          <input type="color" value={card.fill} onChange={(e) => ed.updateCard(card.id, { fill: e.target.value }, false)} onBlur={ed.commit} />
        </label>
        <button onClick={() => ed.updateCard(card.id, { artPanX: 0, artPanY: 0, artZoom: 1 })}>Reset to cover</button>
      </div>
    </div>
  );
}

export function FrameFields({ ed, card, asTiles }: { ed: Editor; card: Card; asTiles?: boolean }) {
  const frames = FRAMES.filter((f) => !(f as any).missing);
  const missing = !frames.some((f) => f.id === card.frame);
  return (
    <div className="group">
      {missing && <div className="warnbox">⚠ Frame "{card.frame.split("/").pop()}" is no longer available, pick another.</div>}
      {asTiles ? (
        <div className="tiles">
          {frames.map((f) => (
            <button key={f.id} className={f.id === card.frame ? "tile on" : "tile"} onClick={() => ed.updateCard(card.id, { frame: f.id })}>
              <span style={{ border: `6px solid ${f.color}`, outline: `2px solid ${f.inner}`, outlineOffset: -8 }} />{f.name}
            </button>
          ))}
        </div>
      ) : (
        <label className="field"><span>Frame</span>
          <select value={card.frame} onChange={(e) => ed.updateCard(card.id, { frame: e.target.value })}>
            {missing && <option value={card.frame}>(missing)</option>}
            {frames.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}

const SLOT_LABEL: Record<SlotName, string> = { header: "Header", banner: "Banner", textbox: "Textbox" };
export const slotLabel = (s: SlotName) => SLOT_LABEL[s];

export function SnippetFields({ ed, card, slot }: { ed: Editor; card: Card; slot: SlotName }) {
  const s = card.snippets[slot];
  const overflow = useOverflow(card).includes(slot);
  const set = (patch: Partial<Snippet>, commit = true) =>
    ed.updateCard(card.id, (c) => ({ snippets: { ...c.snippets, [slot]: { ...c.snippets[slot]!, ...patch } } }), commit);
  if (!s) return (
    <div className="group"><button onClick={() => ed.updateCard(card.id, (c) => ({ snippets: { ...c.snippets, [slot]: newSnippet(slot) } }))}>+ Add {SLOT_LABEL[slot].toLowerCase()}</button></div>
  );
  return (
    <div className="group">
      {overflow && <div className="warnbox">⚠ Text doesn't fit, even at 50% size.</div>}
      <label className="field"><span>Text (emoji welcome 🐉)</span><BlurText multiline value={s.text} onCommit={(text) => set({ text })} /></label>
      <div className="row">
        <label className="field"><span>Font</span>
          <select value={s.font} onChange={(e) => set({ font: e.target.value })}>
            {FONTS.map((f) => <option key={f.id} value={f.id} style={{ fontFamily: f.css }}>{f.name}</option>)}
          </select>
        </label>
        <label className="field"><span>Size (pt)</span>
          <input type="number" min={5} max={36} value={s.sizePt} onChange={(e) => set({ sizePt: Math.min(36, Math.max(5, +e.target.value)) })} />
        </label>
      </div>
      <div className="row">
        <label className="field"><span>Colour</span><input type="color" value={s.color} onChange={(e) => set({ color: e.target.value }, false)} onBlur={ed.commit} /></label>
        <label className="field"><span>Outline</span>
          <span className="row">
            <input type="checkbox" checked={!!s.outline} onChange={(e) => set({ outline: e.target.checked ? "#000000" : null })} />
            {s.outline && <input type="color" value={s.outline} onChange={(e) => set({ outline: e.target.value }, false)} onBlur={ed.commit} />}
          </span>
        </label>
        <span className="field"><span>Align</span>
          <span className="seg">
            {(["left", "center", "right"] as const).map((a) => (
              <button key={a} className={s.align === a ? "on" : ""} onClick={() => set({ align: a })}>{a === "left" ? "⟸" : a === "center" ? "≡" : "⟹"}</button>
            ))}
          </span>
        </span>
      </div>
      <label className="field"><span>Background</span>
        <select value={s.background ?? ""} onChange={(e) => set({ background: e.target.value || null })}>
          <option value="">None</option>
          {SNIPPET_BACKGROUNDS.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </label>
      <Slider label="Vertical position" value={s.centerY} min={0} max={1} step={0.005} fmt={(v) => `${Math.round(v * 100)}%`}
        onLive={(centerY) => set({ centerY }, false)} onCommit={ed.commit} />
      <Slider label="Zoom" value={s.zoom} min={0.25} max={2} step={0.01} fmt={(v) => `${Math.round(v * 100)}%`}
        onLive={(zoom) => set({ zoom }, false)} onCommit={ed.commit} />
      <button className="danger" onClick={() => ed.updateCard(card.id, (c) => { const sn = { ...c.snippets }; delete sn[slot]; return { snippets: sn }; })}>Remove {SLOT_LABEL[slot].toLowerCase()}</button>
    </div>
  );
}

export function SaveBar({ ed, onExport }: { ed: Editor; onExport: () => void }) {
  return (
    <div className="savebar">
      <button disabled={!ed.canUndo} onClick={ed.undo} title="Undo (Ctrl+Z)">↶ Undo</button>
      <button disabled={!ed.canRedo} onClick={ed.redo} title="Redo (Ctrl+Y)">↷ Redo</button>
      <span className="status">{ed.status === "Saving…" ? "⏳" : "✓"} {ed.status}</span>
      <button onClick={() => navigator.clipboard?.writeText(location.href)}>🔗 Copy link</button>
      <button className="primary" onClick={onExport}>Export to Word…</button>
    </div>
  );
}

export function ExportDialog({ ed, onClose }: { ed: Editor; onClose: () => void }) {
  const [sel, setSel] = useState<Record<string, boolean>>(() => Object.fromEntries(ed.doc.cards.map((c) => [c.id, c.copies > 0])));
  const [step, setStep] = useState<"select" | "progress" | "done">("select");
  const chosen = ed.doc.cards.filter((c) => sel[c.id] && c.copies > 0);
  const total = chosen.reduce((a, c) => a + c.copies, 0);
  const warnings = chosen.flatMap((c) => cardWarnings(c).map((w) => `${c.name}: ${w}`));
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Export "{ed.doc.name}" to Word</h3>
        {step === "select" && <>
          <table className="exp">
            <tbody>
              {ed.doc.cards.map((c) => (
                <tr key={c.id} className={c.copies === 0 ? "dim" : ""}>
                  <td><input type="checkbox" disabled={c.copies === 0} checked={!!sel[c.id] && c.copies > 0} onChange={(e) => setSel({ ...sel, [c.id]: e.target.checked })} /></td>
                  <td>{c.name}</td><td>× {c.copies}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p><b>{total}</b> cards on <b>{Math.ceil(total / 12)}</b> A4 page(s), 12 per page.</p>
          {warnings.length > 0 && <div className="warnbox">⚠ {warnings.map((w) => <div key={w}>{w}</div>)}</div>}
          <p className="hint">Print at <b>100% / Actual size</b>: don't use "Fit to page".</p>
          <div className="row end">
            <button onClick={onClose}>Cancel</button>
            <button className="primary" disabled={!total} onClick={() => { setStep("progress"); setTimeout(() => setStep("done"), 1200); }}>
              {warnings.length ? "Export anyway" : "Export"}
            </button>
          </div>
        </>}
        {step === "progress" && <div className="progress"><div /></div>}
        {step === "done" && <><p>✓ "{ed.doc.name}.docx" would download now (prototype).</p><div className="row end"><button onClick={onClose}>Close</button></div></>}
      </div>
    </div>
  );
}
