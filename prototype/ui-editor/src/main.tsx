// PROTOTYPE entry: ?page=home|collection|editor&variant=A|B|C
import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import "./styles.css";
import { useEditor } from "./store";
import { VARIANTS } from "./variants";

type Key = keyof typeof VARIANTS;
const KEYS = Object.keys(VARIANTS) as Key[];

function PrototypeSwitcher({ current, onChange }: { current: Key; onChange: (k: Key) => void }) {
  const go = (d: number) => onChange(KEYS[(KEYS.indexOf(current) + d + KEYS.length) % KEYS.length]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });
  return (
    <div className="switcher">
      <button onClick={() => go(-1)}>◀</button>
      <span>PROTOTYPE · {current} ({VARIANTS[current][0]})</span>
      <button onClick={() => go(1)}>▶</button>
    </div>
  );
}

function Home() {
  const [allowed, setAllowed] = useState(true);
  return (
    <div className="page">
      <h1>🃏 Card Creator</h1>
      <label className="proto-toggle"><input type="checkbox" checked={allowed} onChange={(e) => setAllowed(e.target.checked)} /> (prototype) pretend my IP is allowlisted</label>
      {allowed
        ? <button className="primary big" onClick={() => (location.search = "?page=collection")}>+ New collection</button>
        : <p className="hint">Creating collections is restricted. Ask the owner for a collection link.</p>}
      <h3>Recently opened (this browser only)</h3>
      <ul className="recent">
        <li><a href="?page=collection">Dragon Game</a> <span className="hint">opened today</span></li>
        <li><a href="?page=collection">Untitled collection</a> <span className="hint">opened 3 days ago</span></li>
      </ul>
    </div>
  );
}

function Collection() {
  const [name, setName] = useState("Dragon Game");
  const [sets, setSets] = useState([
    { id: "a1", name: "Dragon Deck", cards: 4, changed: "today 14:02" },
    { id: "b2", name: "Event cards", cards: 18, changed: "yesterday" },
  ]);
  return (
    <div className="page">
      <a href="?page=home">← Home</a>
      <input className="settitle" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="row">
        <button className="primary" onClick={() => setSets([...sets, { id: Math.random().toString(36).slice(2, 6), name: "Untitled set", cards: 0, changed: "just now" }])}>+ New set</button>
        <button onClick={() => navigator.clipboard?.writeText(location.href)}>🔗 Copy collection link</button>
      </div>
      <table className="sets">
        <thead><tr><th>Set</th><th>Cards</th><th>Last changed</th><th /></tr></thead>
        <tbody>
          {sets.map((s) => (
            <tr key={s.id}>
              <td><input value={s.name} onChange={(e) => setSets(sets.map((x) => x.id === s.id ? { ...x, name: e.target.value } : x))} /></td>
              <td>{s.cards}</td><td>{s.changed}</td>
              <td className="row">
                <a href="?page=editor&variant=A">Open</a>
                <button onClick={() => setSets([...sets, { ...s, id: s.id + "c", name: s.name + " (copy)", changed: "just now" }])}>⧉ Duplicate</button>
                <button className="danger" onClick={() => prompt(`Type "${s.name}" to delete this set`) === s.name && setSets(sets.filter((x) => x.id !== s.id))}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EditorPage() {
  const ed = useEditor();
  const params = new URLSearchParams(location.search);
  const [v, setV] = useState<Key>((params.get("variant") as Key) in VARIANTS ? (params.get("variant") as Key) : "A");
  const change = (k: Key) => {
    params.set("variant", k); history.replaceState(null, "", "?" + params.toString()); setV(k);
  };
  const Comp = VARIANTS[v][1];
  return <><Comp ed={ed} /><PrototypeSwitcher current={v} onChange={change} /></>;
}

function App() {
  const page = new URLSearchParams(location.search).get("page") ?? "editor";
  return page === "home" ? <Home /> : page === "collection" ? <Collection /> : <EditorPage />;
}

createRoot(document.getElementById("root")!).render(<App />);
