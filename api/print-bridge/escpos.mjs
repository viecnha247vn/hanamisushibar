// Bygger ESC/POS-data för Epson TM-T20III (80 mm, 48 tecken/rad med Font A).
// Inga externa bibliotek. Svenska tecken via kodsida PC858 (ESC t 19).

const ESC = 0x1b, GS = 0x1d;

// Tecken utanför ASCII → byte i PC858. Övriga får sina diakritiska tecken borttagna.
const CP858 = { "å": 0x86, "ä": 0x84, "ö": 0x94, "Å": 0x8f, "Ä": 0x8e, "Ö": 0x99, "é": 0x82, "É": 0x90, "ü": 0x81, "Ü": 0x9a,
  "ø": 0x9b, "Ø": 0x9d, "æ": 0x91, "Æ": 0x92, "ñ": 0xa4, "ç": 0x87, "à": 0x85, "è": 0x8a, "ê": 0x88, "€": 0xd5, "–": 0x2d, "—": 0x2d,
  "×": 0x78, "…": 0x2e, "’": 0x27, "‘": 0x27, "”": 0x22, "“": 0x22, "·": 0xfa, "°": 0xf8, "½": 0xab, "¼": 0xac };

export function encode(str) {
  const out = [];
  for (const ch of String(str)) {
    const code = ch.codePointAt(0);
    if (code < 0x80) { out.push(code); continue; }
    if (ch in CP858) { out.push(CP858[ch]); continue; }
    const base = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    out.push(base && base.codePointAt(0) < 0x80 ? base.codePointAt(0) : 0x3f);
  }
  return out;
}

/** Visuell längd (efter kodning = en byte per tecken). */
const len = s => encode(s).length;

export class Receipt {
  constructor({ width = 48 } = {}) { this.width = width; this.buf = []; this.reset(); }
  raw(...bytes) { this.buf.push(...bytes); return this; }
  reset() { return this.raw(ESC, 0x40, ESC, 0x74, 19, ESC, 0x52, 5); }   // init, PC858, internationell teckenuppsättning: Sverige
  align(a) { return this.raw(ESC, 0x61, { left: 0, center: 1, right: 2 }[a] ?? 0); }
  bold(on) { return this.raw(ESC, 0x45, on ? 1 : 0); }
  size(w = 1, h = 1) { return this.raw(GS, 0x21, ((w - 1) << 4) | (h - 1)); }
  invert(on) { return this.raw(GS, 0x42, on ? 1 : 0); }
  feed(n = 1) { return this.raw(ESC, 0x64, n); }
  cut() { return this.raw(GS, 0x56, 66, 0); }                             // partial cut med matning
  text(s) { return this.raw(...encode(s), 0x0a); }
  line(ch = "-") { return this.text(ch.repeat(this.width)); }

  /** vänster … höger på samma rad (radbryter vänsterdelen om det behövs) */
  row(left, right, { indent = 0 } = {}) {
    const r = String(right), gap = 1;
    const avail = this.width - len(r) - gap;
    const lines = wrap(left, avail, indent);
    lines.forEach((l, i) => {
      if (i === lines.length - 1) this.text(l + " ".repeat(Math.max(gap, this.width - len(l) - len(r))) + r);
      else this.text(l);
    });
    return this;
  }
  paragraph(s, indent = 0) { wrap(s, this.width, indent).forEach(l => this.text(l)); return this; }
  bytes() { return Buffer.from(this.buf); }
}

/** Radbrytning på ordgräns; fortsättningsrader indenteras. */
export function wrap(text, width, indent = 0) {
  const words = String(text).split(/\s+/).filter(Boolean), lines = [];
  let cur = "";
  for (const w of words) {
    const pre = cur ? cur + " " : (lines.length ? " ".repeat(indent) : "");
    if (len(pre + w) <= width) cur = pre + w;
    else { if (cur) lines.push(cur); cur = (lines.length ? " ".repeat(indent) : "") + w; while (len(cur) > width) { lines.push(cur.slice(0, width)); cur = " ".repeat(indent) + cur.slice(width); } }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}
