// PROTOTYPE: three structurally different Set editor layouts.
import { useState } from "react";
import { SLOTS, SlotName } from "./model";
import { Editor } from "./store";
import { ArtworkFields, BlurText, CardCanvas, CardFields, ExportDialog, FrameFields, SaveBar, SnippetFields, Warn, slotLabel } from "./shared";

function DragList({ ed, render, className }: { ed: Editor; render: (c: Editor["doc"]["cards"][number], i: number) => React.ReactNode; className: string }) {
  const [dragId, setDragId] = useState<string | null>(null);
  return (
    <div className={className}>
      {ed.doc.cards.map((c, i) => (
        <div key={c.id} draggable onDragStart={() => setDragId(c.id)} onDragOver={(e) => e.preventDefault()}
          onDrop={() => { if (dragId && dragId !== c.id) ed.moveCard(dragId, i); setDragId(null); }}
          onClick={() => ed.select(c.id)} className={"item" + (ed.selectedId === c.id ? " sel" : "")}>
          {render(c, i)}
        </div>
      ))}
    </div>
  );
}

function SetTitle({ ed }: { ed: Editor }) {
  return <BlurText className="settitle" value={ed.doc.name} onCommit={ed.setName} />;
}

// ---------------------------------------------------------------------------
// A: Workbench. Card list left, preview centre, accordion inspector right.
export function VariantA({ ed }: { ed: Editor }) {
  const [exp, setExp] = useState(false);
  const [open, setOpen] = useState<string>("card");
  const card = ed.selected;
  const sections: [string, string, React.ReactNode][] = card ? [
    ["card", "Card", <CardFields ed={ed} card={card} />],
    ["art", "Artwork", <ArtworkFields ed={ed} card={card} />],
    ["frame", "Frame", <FrameFields ed={ed} card={card} />],
    ...SLOTS.map((s) => [s, slotLabel(s) + (card.snippets[s] ? "" : " (none)"), <SnippetFields ed={ed} card={card} slot={s} />] as [string, string, React.ReactNode]),
  ] : [];
  return (
    <div className="va">
      <header><a href="?page=collection">← Collection</a><SetTitle ed={ed} /><SaveBar ed={ed} onExport={() => setExp(true)} /></header>
      <aside className="va-list">
        <DragList ed={ed} className="list" render={(c) => <>
          <span className="grip">⋮⋮</span><span className="nm">{c.name}</span><Warn card={c} /><span className="cp">×{c.copies}</span>
          <button title="Duplicate" onClick={(e) => { e.stopPropagation(); ed.duplicateCard(c.id); }}>⧉</button>
          <button title="Delete" onClick={(e) => { e.stopPropagation(); ed.deleteCard(c.id); }}>🗑</button>
        </>} />
        <button className="add" onClick={ed.addCard}>+ Add card</button>
      </aside>
      <main className="va-preview">{card && <CardCanvas card={card} width={330} ed={ed} interactive />}<p className="hint">Drag artwork to pan · drag a snippet to move it · scroll to zoom</p></main>
      <aside className="va-insp">
        {sections.map(([k, label, body]) => (
          <section key={k}>
            <h4 onClick={() => setOpen(open === k ? "" : k)}>{open === k ? "▾" : "▸"} {label}</h4>
            {open === k && body}
          </section>
        ))}
      </aside>
      {exp && <ExportDialog ed={ed} onClose={() => setExp(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// B: Gallery. The whole Set as a grid of real card thumbnails; editing happens in a drawer with tabs.
export function VariantB({ ed }: { ed: Editor }) {
  const [exp, setExp] = useState(false);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<string>("card");
  const card = ed.selected;
  return (
    <div className="vb">
      <header><a href="?page=collection">← Collection</a><SetTitle ed={ed} /><SaveBar ed={ed} onExport={() => setExp(true)} /></header>
      <DragList ed={ed} className="grid" render={(c) => (
        <div onDoubleClick={() => setEditing(true)}>
          <CardCanvas card={c} width={150} />
          <div className="cap"><Warn card={c} /> <b>{c.name}</b> <span className="cp">×{c.copies}</span></div>
          <div className="acts">
            <button onClick={() => { ed.select(c.id); setEditing(true); }}>Edit</button>
            <button onClick={(e) => { e.stopPropagation(); ed.duplicateCard(c.id); }}>⧉</button>
            <button onClick={(e) => { e.stopPropagation(); ed.deleteCard(c.id); }}>🗑</button>
          </div>
        </div>
      )} />
      <button className="add big" onClick={() => { ed.addCard(); setEditing(true); }}>+ Add card</button>
      {editing && card && (
        <div className="drawer">
          <div className="drawer-head"><b>{card.name}</b><button onClick={() => setEditing(false)}>✕ Close</button></div>
          <div className="drawer-body">
            <div><CardCanvas card={card} width={280} ed={ed} interactive /></div>
            <div className="tabs-wrap">
              <nav className="tabs">
                {[["card", "Card"], ["art", "Artwork"], ["frame", "Frame"], ...SLOTS.map((s) => [s, slotLabel(s)])].map(([k, l]) => (
                  <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
                ))}
              </nav>
              {tab === "card" && <CardFields ed={ed} card={card} />}
              {tab === "art" && <ArtworkFields ed={ed} card={card} />}
              {tab === "frame" && <FrameFields ed={ed} card={card} asTiles />}
              {SLOTS.includes(tab as SlotName) && <SnippetFields ed={ed} card={card} slot={tab as SlotName} />}
            </div>
          </div>
        </div>
      )}
      {exp && <ExportDialog ed={ed} onClose={() => setExp(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// C: Canvas-first. Big card in the middle, click a region of the card to get a floating panel for it.
// Cards live in a filmstrip at the bottom.
export function VariantC({ ed }: { ed: Editor }) {
  const [exp, setExp] = useState(false);
  const [region, setRegion] = useState<"card" | "artwork" | "frame" | SlotName>("artwork");
  const card = ed.selected;
  const pick = (r: "artwork" | SlotName) => setRegion(r);
  return (
    <div className="vc">
      <header><a href="?page=collection">← Collection</a><SetTitle ed={ed} /><SaveBar ed={ed} onExport={() => setExp(true)} /></header>
      <main className="vc-stage">
        {card && <>
          <div className="vc-tools">
            {(["card", "artwork", "frame", ...SLOTS] as const).map((r) => (
              <button key={r} className={region === r ? "on" : ""} onClick={() => setRegion(r)}>
                {r === "card" ? "🃏 Card" : r === "artwork" ? "🖼 Artwork" : r === "frame" ? "▣ Frame" : "T " + slotLabel(r) + (card.snippets[r] ? "" : " +")}
              </button>
            ))}
          </div>
          <CardCanvas card={card} width={380} ed={ed} interactive onPickRegion={pick}
            highlight={region === "card" || region === "frame" ? null : region} />
          <div className="vc-pop">
            <h4>{region === "card" ? "Card" : region === "artwork" ? "Artwork" : region === "frame" ? "Frame" : slotLabel(region)}</h4>
            {region === "card" && <CardFields ed={ed} card={card} />}
            {region === "artwork" && <ArtworkFields ed={ed} card={card} />}
            {region === "frame" && <FrameFields ed={ed} card={card} asTiles />}
            {SLOTS.includes(region as SlotName) && <SnippetFields ed={ed} card={card} slot={region as SlotName} />}
          </div>
        </>}
      </main>
      <footer className="film">
        <DragList ed={ed} className="strip" render={(c) => <>
          <CardCanvas card={c} width={64} />
          <div className="cap"><Warn card={c} />{c.name} ×{c.copies}</div>
        </>} />
        <div className="film-acts">
          <button onClick={ed.addCard}>+ Add</button>
          {card && <button onClick={() => ed.duplicateCard(card.id)}>⧉ Duplicate</button>}
          {card && <button onClick={() => ed.deleteCard(card.id)}>🗑 Delete</button>}
        </div>
      </footer>
      {exp && <ExportDialog ed={ed} onClose={() => setExp(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// D: owner's pick. C's canvas-first editing, but cards in a regular list on the left, and the
// part buttons moved to the right, next to the part properties.
export function VariantD({ ed }: { ed: Editor }) {
  const [exp, setExp] = useState(false);
  const [region, setRegion] = useState<"card" | "artwork" | "frame" | SlotName>("artwork");
  const card = ed.selected;
  return (
    <div className="vd">
      <header><a href="?page=collection">← Collection</a><SetTitle ed={ed} /><SaveBar ed={ed} onExport={() => setExp(true)} /></header>
      <aside className="vd-list">
        <DragList ed={ed} className="list" render={(c) => <>
          <span className="grip">⋮⋮</span><span className="nm">{c.name}</span><Warn card={c} /><span className="cp">×{c.copies}</span>
          <button title="Duplicate" onClick={(e) => { e.stopPropagation(); ed.duplicateCard(c.id); }}>⧉</button>
          <button title="Delete" onClick={(e) => { e.stopPropagation(); ed.deleteCard(c.id); }}>🗑</button>
        </>} />
        <button className="add" onClick={ed.addCard}>+ Add card</button>
      </aside>
      <main className="vd-stage">
        {card && <CardCanvas card={card} width={360} ed={ed} interactive onPickRegion={setRegion}
          highlight={region === "card" || region === "frame" ? null : region} />}
      </main>
      {card && <aside className="vd-side">
        <div className="vc-tools">
          {(["card", "artwork", "frame", ...SLOTS] as const).map((r) => (
            <button key={r} className={region === r ? "on" : ""} onClick={() => setRegion(r)}>
              {r === "card" ? "🃏 Card" : r === "artwork" ? "🖼 Artwork" : r === "frame" ? "▣ Frame" : "T " + slotLabel(r) + (card.snippets[r] ? "" : " +")}
            </button>
          ))}
        </div>
        <div className="vc-pop">
          <h4>{region === "card" ? "Card" : region === "artwork" ? "Artwork" : region === "frame" ? "Frame" : slotLabel(region)}</h4>
          {region === "card" && <CardFields ed={ed} card={card} />}
          {region === "artwork" && <ArtworkFields ed={ed} card={card} />}
          {region === "frame" && <FrameFields ed={ed} card={card} asTiles />}
          {SLOTS.includes(region as SlotName) && <SnippetFields ed={ed} card={card} slot={region as SlotName} />}
        </div>
      </aside>}
      {exp && <ExportDialog ed={ed} onClose={() => setExp(false)} />}
    </div>
  );
}

export const VARIANTS = { A: ["Workbench", VariantA], B: ["Gallery + drawer", VariantB], C: ["Canvas-first", VariantC], D: ["C + list, parts on the right", VariantD] } as const;
