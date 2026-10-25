import { GLYPHS } from "./glyphs";
import type { Entity } from "./types";

/**
 * Route shields, drawn on a canvas so the map (as a style image) and the cards (as an <img>) share them.
 * National routes follow the mainland-China expressway sign: a green plate under a red header,
 * with the territory code in the header where the sign would carry Chinese text. Territorial
 * routes follow the British Columbia highway shield: the route's own symbol in a dark crest
 * above the number. A territory may choose another design for its routes (route_shield in its
 * division record): "maritime" is an oval, sea-blue above a wave line, with the route's symbol
 * over the number.
 */
const FONT = "'Bahnschrift', 'DIN Alternate', 'Roboto Condensed', 'Segoe UI', Arial, sans-serif";
const NATIONAL = { plate: "#00753A", header: "#D7261E", edge: "#ffffff", text: "#ffffff" };
const TERRITORIAL = { crest: "#1D3557", body: "#ffffff", text: "#1D3557" };
const MARITIME = { sea: "#0B5C99", foam: "#5BB8E8", body: "#ffffff", text: "#0B5C99" };

export interface Shield {
  canvas: HTMLCanvasElement;
  /** CSS pixels. */
  width: number;
  height: number;
  ratio: number;
}

function parseRef(ref: string) {
  const m = /^([A-Z]+)-([A-Z]+)-(\d+)$/.exec(ref);
  return m ? { series: m[1], region: m[2], number: m[3] } : null;
}

export const hasShield = (e: Entity) => e.kind === "route" && !!e.ref && !!parseRef(e.ref) && /^(national|territorial)_/.test(e.network ?? "");

function canvas(w: number, h: number, ratio: number) {
  const c = document.createElement("canvas");
  c.width = Math.ceil(w * ratio);
  c.height = Math.ceil(h * ratio);
  const ctx = c.getContext("2d")!;
  ctx.scale(ratio, ratio);
  return { c, ctx };
}

function textWidth(text: string, font: string) {
  const ctx = document.createElement("canvas").getContext("2d")!;
  ctx.font = font;
  return ctx.measureText(text).width;
}

function drawGlyph(ctx: CanvasRenderingContext2D, name: string, cx: number, cy: number, size: number, color: string) {
  const parts = GLYPHS[name];
  if (!parts) return;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(size / 24, size / 24);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const p of parts) {
    const path = new Path2D(p.d);
    if (p.stroke) {
      ctx.lineWidth = p.stroke;
      ctx.stroke(path);
    } else ctx.fill(path, "evenodd");
  }
  ctx.restore();
}

function national(series: string, region: string, number: string, ratio: number): Shield {
  const label = `${series}${number}`;
  const font = `700 11.5px ${FONT}`;
  const h = 25;
  const w = Math.max(28, Math.ceil(textWidth(label, font)) + 12);
  const { c, ctx } = canvas(w, h, ratio);
  ctx.beginPath();
  ctx.roundRect(0.5, 0.5, w - 1, h - 1, 3.5);
  ctx.fillStyle = NATIONAL.edge;
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 0.8;
  ctx.stroke();
  const [ix, iy, iw, ih] = [1.8, 1.8, w - 3.6, h - 3.6];
  const band = ih * 0.34;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(ix, iy, iw, ih, 2.4);
  ctx.clip();
  ctx.fillStyle = NATIONAL.plate;
  ctx.fillRect(ix, iy, iw, ih);
  ctx.fillStyle = NATIONAL.header;
  ctx.fillRect(ix, iy, iw, band);
  ctx.restore();
  ctx.fillStyle = NATIONAL.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 6.4px ${FONT}`;
  ctx.fillText(region.split("").join(" "), w / 2, iy + band / 2 + 0.3);
  ctx.font = font;
  ctx.fillText(label, w / 2, iy + band + (ih - band) / 2 + 0.6);
  return { canvas: c, width: w, height: h, ratio };
}

function territorial(number: string, glyph: string | undefined, ratio: number): Shield {
  const font = `700 ${number.length > 2 ? 9.6 : 10.8}px ${FONT}`;
  const h = 28;
  const w = Math.max(23, Math.ceil(textWidth(number, font)) + 10);
  const { c, ctx } = canvas(w, h, ratio);
  const shape = new Path2D();
  const [x0, x1, y0] = [1, w - 1, 1];
  shape.moveTo(x0 + 2.5, y0);
  shape.lineTo(x1 - 2.5, y0);
  shape.quadraticCurveTo(x1, y0, x1, y0 + 2.5);
  shape.lineTo(x1, h * 0.5);
  shape.bezierCurveTo(x1, h * 0.78, w * 0.74, h * 0.9, w / 2, h - 1);
  shape.bezierCurveTo(w * 0.26, h * 0.9, x0, h * 0.78, x0, h * 0.5);
  shape.lineTo(x0, y0 + 2.5);
  shape.quadraticCurveTo(x0, y0, x0 + 2.5, y0);
  shape.closePath();
  ctx.fillStyle = TERRITORIAL.body;
  ctx.fill(shape);
  ctx.save();
  ctx.clip(shape);
  ctx.fillStyle = TERRITORIAL.crest;
  ctx.fillRect(0, 0, w, h * 0.45);
  ctx.restore();
  ctx.strokeStyle = TERRITORIAL.crest;
  ctx.lineWidth = 1.4;
  ctx.stroke(shape);
  if (glyph) drawGlyph(ctx, glyph, w / 2, h * 0.235, h * 0.33, "#ffffff");
  ctx.fillStyle = TERRITORIAL.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = font;
  ctx.fillText(number, w / 2, h * 0.66);
  return { canvas: c, width: w, height: h, ratio };
}

function maritime(number: string, glyph: string | undefined, ratio: number): Shield {
  const font = `700 ${number.length > 2 ? 9.6 : 10.8}px ${FONT}`;
  const h = 28;
  const w = Math.max(26, Math.ceil(textWidth(number, font)) + 12);
  const { c, ctx } = canvas(w, h, ratio);
  const shape = new Path2D();
  shape.ellipse(w / 2, h / 2, w / 2 - 1, h / 2 - 1, 0, 0, Math.PI * 2);
  ctx.fillStyle = MARITIME.body;
  ctx.fill(shape);
  const sea = h * 0.5;
  const wave = (y: number) => {
    const p = new Path2D();
    p.moveTo(0, y);
    for (let k = 0; k < 3; k++) {
      const x = (w / 3) * k;
      p.quadraticCurveTo(x + w / 12, y - 1.6, x + w / 6, y);
      p.quadraticCurveTo(x + w / 4, y + 1.6, x + w / 3, y);
    }
    return p;
  };
  ctx.save();
  ctx.clip(shape);
  const top = wave(sea);
  top.lineTo(w, 0);
  top.lineTo(0, 0);
  top.closePath();
  ctx.fillStyle = MARITIME.sea;
  ctx.fill(top);
  ctx.strokeStyle = MARITIME.foam;
  ctx.lineWidth = 1.1;
  ctx.stroke(wave(sea + 2.2));
  ctx.restore();
  ctx.strokeStyle = MARITIME.sea;
  ctx.lineWidth = 1.4;
  ctx.stroke(shape);
  if (glyph) drawGlyph(ctx, glyph, w / 2, h * 0.27, h * 0.36, "#ffffff");
  ctx.fillStyle = MARITIME.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = font;
  ctx.fillText(number, w / 2, h * 0.73);
  return { canvas: c, width: w, height: h, ratio };
}

export function drawShield(route: Entity, ratio = 2): Shield | null {
  const p = route.ref ? parseRef(route.ref) : null;
  if (!p) return null;
  if (route.network?.startsWith("national_")) return national(p.series, p.region, p.number, ratio);
  return (route.shield_style === "maritime" ? maritime : territorial)(p.number, route.shield, ratio);
}

/** Map style image id of a route's shield; resolved on demand by MapView. */
export const shieldImageId = (ref: string) => `rshield|${ref}`;

const urls = new Map<string, { src: string; width: number; height: number }>();

/** The shield as an image URL for the cards and lists, cached per route. */
export function shieldUrl(route: Entity) {
  const hit = urls.get(route.id);
  if (hit) return hit;
  const s = drawShield(route, 3);
  if (!s) return null;
  const out = { src: s.canvas.toDataURL(), width: s.width, height: s.height };
  urls.set(route.id, out);
  return out;
}
