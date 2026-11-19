// PROTOTYPE renderer: stand-in for the shared canvas renderer. Procedural placeholder assets.
import { Card, SLOTS, SlotName, bgOf, fontOf, frameOf } from "./model";

export const CARD_W_MM = 44;
export const CARD_H_MM = 72;
const images = new Map<string, HTMLImageElement>();

function img(url: string, onLoad: () => void) {
  let i = images.get(url);
  if (!i) { i = new Image(); i.onload = onLoad; i.src = url; images.set(url, i); }
  return i.complete && i.naturalWidth ? i : null;
}

export interface RenderResult { overflow: SlotName[]; boxes: Partial<Record<SlotName, { y: number; h: number; w: number }>> }

export function renderCard(ctx: CanvasRenderingContext2D, card: Card, W: number, rerender: () => void): RenderResult {
  const H = (W * CARD_H_MM) / CARD_W_MM;
  const out: RenderResult = { overflow: [], boxes: {} };
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
  ctx.fillStyle = card.fill; ctx.fillRect(0, 0, W, H);

  if (card.artworkUrl) {
    const i = img(card.artworkUrl, rerender);
    if (i) {
      const cover = Math.max(W / i.naturalWidth, H / i.naturalHeight) * card.artZoom;
      const iw = i.naturalWidth * cover, ih = i.naturalHeight * cover;
      ctx.drawImage(i, (W - iw) / 2 + card.artPanX * W, (H - ih) / 2 + card.artPanY * W, iw, ih);
    }
  }

  const f = frameOf(card.frame);
  if (f && !(f as any).missing) {
    const t = W * 0.06;
    ctx.lineWidth = t; ctx.strokeStyle = f.color; ctx.strokeRect(t / 2, t / 2, W - t, H - t);
    ctx.lineWidth = W * 0.012; ctx.strokeStyle = f.inner; ctx.strokeRect(t, t, W - 2 * t, H - 2 * t);
    ctx.fillStyle = f.color; ctx.fillRect(0, 0, W, H * 0.11); // top border band
  }

  const ptToPx = (pt: number) => (pt * 0.3528 * H) / CARD_H_MM;
  for (const slot of [...SLOTS].reverse()) {
    const s = card.snippets[slot];
    if (!s) continue;
    const bw = W * s.zoom;
    const pad = bw * 0.08;
    const font = fontOf(s.font).css;
    let size = ptToPx(s.sizePt);
    const bg = bgOf(s.background);
    const lineH = () => size * 1.2;
    const wrap = () => {
      ctx.font = `${size}px ${font}`;
      const lines: string[] = [];
      for (const para of s.text.split("\n")) {
        let line = "";
        for (const word of para.split(" ")) {
          const t = line ? line + " " + word : word;
          if (ctx.measureText(t).width > bw - 2 * pad && line) { lines.push(line); line = word; } else line = t;
        }
        lines.push(line);
      }
      return lines;
    };
    let lines = wrap();
    let bh = bg ? bw * bg.aspect : lines.length * lineH() + size * 0.4;
    if (bg) {
      const min = ptToPx(s.sizePt) * 0.5;
      while (lines.length * lineH() > bh * 0.9 && size > min) { size *= 0.94; lines = wrap(); }
      if (lines.length * lineH() > bh * 0.9) out.overflow.push(slot);
    }
    const x = (W - bw) / 2, y = s.centerY * H - bh / 2;
    out.boxes[slot] = { y, h: bh, w: bw };
    if (bg) {
      ctx.fillStyle = bg.color; ctx.strokeStyle = bg.edge; ctx.lineWidth = W * 0.008;
      ctx.beginPath(); ctx.roundRect(x, y, bw, bh, bh * 0.25); ctx.fill(); ctx.stroke();
    }
    ctx.font = `${size}px ${font}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = s.align;
    const tx = s.align === "left" ? x + pad : s.align === "right" ? x + bw - pad : W / 2;
    const top = s.centerY * H - (lines.length * lineH()) / 2 + lineH() / 2;
    lines.forEach((l, k) => {
      const ly = top + k * lineH();
      if (s.outline) {
        ctx.lineJoin = "round"; ctx.lineWidth = size * 0.24; ctx.strokeStyle = s.outline; ctx.strokeText(l, tx, ly);
      }
      ctx.fillStyle = s.color; ctx.fillText(l, tx, ly);
    });
  }
  ctx.restore();
  return out;
}
