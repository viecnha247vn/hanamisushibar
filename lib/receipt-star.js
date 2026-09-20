// Kvitto i Star Document Markup (text/vnd.star.markup) och som ren text (text/plain).
// Layout för 80 mm (mC-Print3: 48 tecken/rad med font A). Ändra här om köket vill ha annan ordning.
import settings from "../data/settings.js";
import { whenText } from "./when.js";

const WIDTH = 48;
const esc = s => String(s ?? "").replace(/[\\\[\]]/g, c => "\\" + c);          // [ ] \ har betydelse i löpande text
const escP = s => String(s ?? "").replace(/[\\\[\]:;]/g, c => "\\" + c);       // inuti [column: …] även : och ;
const kr = n => `${n} kr`;

function lines(o) {
  const isTable = o.kind === "table";
  const received = o.received || "";                                   // "2026-09-16 18:12"
  return {
    isTable,
    date: `${received.slice(8, 10)}/${Number(received.slice(5, 7))} ${received.slice(11, 16)}`,
    when: isTable ? `BORD ${o.table}` : "HÄMTNING",
    when2: isTable ? "" : whenText(o.pickupDate, o.pickupTime).toUpperCase(),
    items: o.items.map(i => [`${String(i.qty || "").padStart(2)}  ${i.name}`, i.price ? String(i.qty * i.price) : "", i.note || ""]),
    total: kr(o.total),
    paid: !!o.paid,
    payment: o.paid ? `BETALD · ${String(o.payment || "").toUpperCase()}`
                    : `Ej betald · ${o.payment}${isTable ? " (betalas vid utgång)" : ""}`,
    contact: [o.name, o.phone].filter(Boolean).join("  "),
    message: o.message || ""
  };
}

/** Star Document Markup – skrivaren sköter radbrytning, kolumner och storlek. */
export function starMarkup(o) {
  const L = lines(o), out = [];
  out.push("[align: centre][bold: on][magnify: width 1; height 2]", esc(settings.name.toUpperCase()), "[magnify: width 1; height 1][bold: off]", esc(L.date), "=".repeat(WIDTH));
  out.push("[align: left][bold: on][magnify: width 2; height 2]", esc(o.no), esc(L.when));
  if (L.when2) out.push("[magnify: width 1; height 2]" + esc(L.when2));
  out.push("[magnify: width 1; height 1][bold: off]", "=".repeat(WIDTH));
  out.push("[bold: on][magnify: width 1; height 2]");
  for (const [l, r, note] of L.items) {
    out.push(`[column: left: ${escP(l)}; right: ${escP(r)}]`);
    if (note) out.push("    >> " + esc(note));
  }
  out.push("[magnify: width 1; height 1][bold: off]");
  if (L.message) out.push("-".repeat(WIDTH), "[bold: on]KOMMENTAR:[bold: off]", "[magnify: width 1; height 2]" + esc(L.message) + "[magnify: width 1; height 1]");
  out.push("-".repeat(WIDTH), `[bold: on][column: left: Summa; right: ${escP(L.total)}][bold: off]`,
    L.paid ? `[bold: on][magnify: width 2; height 2]${esc(L.payment)}[magnify: width 1; height 1][bold: off]` : esc(L.payment));
  if (L.contact) out.push(esc(L.contact));
  out.push("-".repeat(WIDTH), "[align: centre]" + esc(`${settings.siteHost || "hanamisushibar.se"}  ·  ${settings.phone}`), "[cut: feed; partial]");
  return out.join("\n") + "\n";
}

/** Ren text – reserv om skrivaren inte tar markup. */
export function plainText(o) {
  const L = lines(o), row = (l, r) => l.length + r.length + 1 > WIDTH ? `${l}\n${" ".repeat(WIDTH - r.length)}${r}` : `${l}${" ".repeat(WIDTH - l.length - r.length)}${r}`;
  const out = [center(settings.name.toUpperCase()), center(L.date), "=".repeat(WIDTH), o.no, L.when];
  if (L.when2) out.push(L.when2);
  out.push("=".repeat(WIDTH));
  for (const [l, r, note] of L.items) { out.push(row(l, r)); if (note) out.push("    >> " + note); }
  if (L.message) out.push("-".repeat(WIDTH), "KOMMENTAR: " + L.message);
  out.push("-".repeat(WIDTH), row("Summa", L.total), L.payment);
  if (L.contact) out.push(L.contact);
  out.push("-".repeat(WIDTH), center(`${settings.siteHost || "hanamisushibar.se"}  ·  ${settings.phone}`), "\n\n\n");
  return out.join("\n");
}
const center = s => " ".repeat(Math.max(0, Math.floor((WIDTH - s.length) / 2))) + s;
