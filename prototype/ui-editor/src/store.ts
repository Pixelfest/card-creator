// PROTOTYPE store: in-memory Set + undo/redo (100 steps). "Live" changes (dragging) don't create
// a history step until committed, mirroring "save when a change is finished".
import { useCallback, useEffect, useRef, useState } from "react";
import { Card, SetDoc, demoSet, newCard, uid } from "./model";

export interface Editor {
  doc: SetDoc;
  selectedId: string | null;
  select: (id: string) => void;
  selected: Card | null;
  /** Change a card. commit=false while dragging; call commit() on release. */
  updateCard: (id: string, patch: Partial<Card> | ((c: Card) => Partial<Card>), commit?: boolean) => void;
  commit: () => void;
  setName: (n: string) => void;
  addCard: () => void;
  duplicateCard: (id: string) => void;
  deleteCard: (id: string) => void;
  moveCard: (id: string, toIndex: number) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  status: string;
  log: string[];
}

export function useEditor(): Editor {
  const [doc, setDoc] = useState<SetDoc>(() => demoSet());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const past = useRef<SetDoc[]>([]);
  const future = useRef<SetDoc[]>([]);
  const base = useRef<SetDoc | null>(null);
  const [, force] = useState(0);
  const [status, setStatus] = useState("All changes saved");
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => { if (!selectedId && doc.cards[0]) setSelectedId(doc.cards[0].id); }, [doc, selectedId]);

  const fakeSave = (what: string) => {
    setStatus("Saving…");
    setLog((l) => [`${new Date().toLocaleTimeString()} saved: ${what}`, ...l].slice(0, 8));
    setTimeout(() => setStatus("All changes saved"), 400);
  };

  const apply = useCallback((next: SetDoc, commit: boolean, what: string) => {
    setDoc((cur) => {
      if (!base.current) base.current = cur;
      if (commit) {
        past.current = [...past.current, base.current].slice(-100);
        future.current = [];
        base.current = null;
        fakeSave(what);
      }
      return next;
    });
    force((x) => x + 1);
  }, []);

  const ed: Editor = {
    doc, selectedId,
    selected: doc.cards.find((c) => c.id === selectedId) ?? null,
    select: setSelectedId,
    updateCard: (id, patch, commit = true) => {
      const cards = doc.cards.map((c) => (c.id === id ? { ...c, ...(typeof patch === "function" ? patch(c) : patch), version: c.version + (commit ? 1 : 0) } : c));
      apply({ ...doc, cards }, commit, `card "${doc.cards.find((c) => c.id === id)?.name}"`);
    },
    commit: () => {
      if (!base.current) return;
      past.current = [...past.current, base.current].slice(-100);
      future.current = []; base.current = null; fakeSave("drag finished"); force((x) => x + 1);
    },
    setName: (name) => apply({ ...doc, name }, true, "set name"),
    addCard: () => {
      const c = newCard(doc.cards.length + 1);
      apply({ ...doc, cards: [...doc.cards, c] }, true, "added card"); setSelectedId(c.id);
    },
    duplicateCard: (id) => {
      const i = doc.cards.findIndex((c) => c.id === id);
      const c = { ...doc.cards[i], id: uid(), name: doc.cards[i].name + " (copy)" };
      const cards = [...doc.cards]; cards.splice(i + 1, 0, c);
      apply({ ...doc, cards }, true, "duplicated card"); setSelectedId(c.id);
    },
    deleteCard: (id) => {
      if (!confirm("Delete this card?")) return;
      apply({ ...doc, cards: doc.cards.filter((c) => c.id !== id) }, true, "deleted card");
      if (selectedId === id) setSelectedId(null);
    },
    moveCard: (id, to) => {
      const cards = [...doc.cards];
      const from = cards.findIndex((c) => c.id === id);
      const [c] = cards.splice(from, 1); cards.splice(to, 0, c);
      apply({ ...doc, cards }, true, "reordered");
    },
    undo: () => {
      const prev = past.current.pop(); if (!prev) return;
      future.current.push(doc); setDoc(prev); fakeSave("undo"); force((x) => x + 1);
    },
    redo: () => {
      const nxt = future.current.pop(); if (!nxt) return;
      past.current.push(doc); setDoc(nxt); fakeSave("redo"); force((x) => x + 1);
    },
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    status, log,
  };

  const edRef = useRef(ed); edRef.current = ed;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.matches("input, textarea, [contenteditable]")) return;
      if (e.ctrlKey && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? edRef.current.redo() : edRef.current.undo(); }
      if (e.ctrlKey && e.key.toLowerCase() === "y") { e.preventDefault(); edRef.current.redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return ed;
}
