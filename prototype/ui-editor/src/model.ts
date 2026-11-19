// PROTOTYPE model: mirrors the decisions on the wayfinder map, simplified.

export type SlotName = "header" | "banner" | "textbox";
export const SLOTS: SlotName[] = ["header", "banner", "textbox"];
export type Align = "left" | "center" | "right";

export interface Snippet {
  text: string;
  font: string;
  color: string;
  outline: string | null; // null = none
  sizePt: number;
  align: Align;
  background: string | null; // id from SNIPPET_BACKGROUNDS
  centerY: number; // 0..1 of card height
  zoom: number; // 0.25..2 of card width
}

export interface Card {
  id: string;
  name: string;
  copies: number;
  fill: string;
  artworkUrl: string | null;
  artPanX: number; // offset in card widths
  artPanY: number;
  artZoom: number; // 1 = cover
  frame: string;
  snippets: Partial<Record<SlotName, Snippet>>;
  version: number;
}

export interface SetDoc {
  name: string;
  cards: Card[];
}

export const FRAMES = [
  { id: "frames/44x72/gold-ornate.png", name: "Gold ornate", color: "#c9a227", inner: "#7a5c00" },
  { id: "frames/44x72/stone.png", name: "Stone", color: "#8a8f98", inner: "#444" },
  { id: "frames/44x72/dark-wood.png", name: "Dark wood", color: "#5b3a1e", inner: "#2b1a0c" },
  { id: "frames/44x72/missing.png", name: "(deleted frame)", color: "", inner: "", missing: true },
];

export const FONTS = [
  { id: "fonts/Cinzel-Bold.ttf", name: "Cinzel Bold", css: "Georgia, serif" },
  { id: "fonts/Impact.ttf", name: "Impact", css: "Impact, sans-serif" },
  { id: "fonts/Typewriter.ttf", name: "Typewriter", css: "'Courier New', monospace" },
  { id: "fonts/Trebuchet.ttf", name: "Trebuchet", css: "'Trebuchet MS', sans-serif" },
];

export const SNIPPET_BACKGROUNDS = [
  { id: "snippet-backgrounds/scroll.png", name: "Scroll", aspect: 0.22, color: "#efe1b8", edge: "#8b6b2e" },
  { id: "snippet-backgrounds/ribbon.png", name: "Ribbon", aspect: 0.18, color: "#a3262a", edge: "#5e1013" },
  { id: "snippet-backgrounds/parchment.png", name: "Parchment", aspect: 0.6, color: "#f3ead2", edge: "#a08a5a" },
];

export const SLOT_DEFAULTS: Record<SlotName, Pick<Snippet, "centerY" | "zoom" | "sizePt">> = {
  header: { centerY: 0.06, zoom: 0.8, sizePt: 12 },
  banner: { centerY: 0.16, zoom: 0.9, sizePt: 12 },
  textbox: { centerY: 0.8, zoom: 0.85, sizePt: 9 },
};

export function newSnippet(slot: SlotName): Snippet {
  return {
    text: slot === "textbox" ? "Deal 2 damage 🔥 to any creature." : slot === "header" ? "Name" : "Creature — Dragon",
    font: FONTS[0].id,
    color: slot === "banner" ? "#ffffff" : "#1b1b1b",
    outline: slot === "banner" ? "#000000" : null,
    align: "center",
    background: slot === "header" ? null : slot === "banner" ? SNIPPET_BACKGROUNDS[1].id : SNIPPET_BACKGROUNDS[2].id,
    ...SLOT_DEFAULTS[slot],
  };
}

let n = 0;
export const uid = () => `c${Date.now().toString(36)}${n++}`;

export function newCard(index: number): Card {
  return {
    id: uid(), name: `Card ${index}`, copies: 1, fill: "#ffffff", artworkUrl: null,
    artPanX: 0, artPanY: 0, artZoom: 1, frame: FRAMES[0].id, snippets: {}, version: 1,
  };
}

function demoArt(hue: number): string {
  const c = document.createElement("canvas");
  c.width = 600; c.height = 800;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 600, 800);
  grad.addColorStop(0, `hsl(${hue},70%,60%)`);
  grad.addColorStop(1, `hsl(${hue + 60},70%,25%)`);
  g.fillStyle = grad; g.fillRect(0, 0, 600, 800);
  g.fillStyle = "rgba(255,255,255,.25)";
  for (let i = 0; i < 12; i++) { g.beginPath(); g.arc((i * 137) % 600, (i * 211) % 800, 40 + (i % 4) * 25, 0, 7); g.fill(); }
  return c.toDataURL();
}

export function demoSet(): SetDoc {
  const mk = (name: string, hue: number, copies: number, frame: number, text: string): Card => ({
    ...newCard(0), name, copies, artworkUrl: demoArt(hue), frame: FRAMES[frame].id,
    snippets: {
      header: { ...newSnippet("header"), text: name },
      banner: newSnippet("banner"),
      textbox: { ...newSnippet("textbox"), text },
    },
  });
  return {
    name: "Dragon Deck",
    cards: [
      mk("Fire Drake", 10, 3, 0, "Deal 2 damage 🔥 to any creature."),
      mk("Frost Wyrm", 200, 2, 1, "Freeze ❄️ target card until your next turn."),
      mk("Forest Guardian", 110, 1, 2, "Gain 3 life 🌿. If you control another Guardian, draw a card and then gain 2 extra life for every Guardian you control this turn."),
      { ...mk("Lost Relic", 280, 0, 3, "This card uses a frame that was deleted."), },
    ],
  };
}

export const frameOf = (id: string) => FRAMES.find((f) => f.id === id);
export const fontOf = (id: string) => FONTS.find((f) => f.id === id) ?? FONTS[0];
export const bgOf = (id: string | null) => SNIPPET_BACKGROUNDS.find((b) => b.id === id) ?? null;

export function cardWarnings(card: Card, overflow: SlotName[] = []): string[] {
  const w: string[] = [];
  const f = frameOf(card.frame);
  if (!f || (f as any).missing) w.push(`Frame "${card.frame.split("/").pop()}" is no longer available`);
  for (const s of overflow) w.push(`Text doesn't fit in ${s}`);
  return w;
}
