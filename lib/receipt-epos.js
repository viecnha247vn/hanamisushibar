// Kvitto som ePOS-Print XML för Epson Server Direct Print. Skrivaren i köket är en Epson TM-m30III
// med 58 mm papper (32 tecken per rad i font A; 80 mm papper = 48). Layouten anpassar sig efter bredden. Samma XML fungerar på TM-T88VII/VI, TM-m30II m.fl.
// Radbredden tas från settings.receiptWidth (eller miljövariabeln RECEIPT_WIDTH).
import settings from "../data/settings.js";
import { whenText } from "./when.js";
import { phonePretty } from "./util.js";

const W = () => settings.receiptWidth || 32;
const x = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** En textrad. Alla attribut anges uttryckligen på varje rad, så ingen formatering "läcker" till nästa rad. */
const t = (s, o = {}) =>
  `<text align="${o.align || "left"}" dw="${!!o.dw}" dh="${!!o.dh}" em="${!!o.em}">${x(s)}&#10;</text>`;
/** vänster … höger på en rad; radbryter vänsterdelen med indrag */
function row(left, right, width, indent = 0) {
  const r = String(right), out = [];
  const lines = wrap(left, width - r.length - 1, indent);
  lines.forEach((l, i) => out.push(i === lines.length - 1 ? l + " ".repeat(Math.max(1, width - l.length - r.length)) + r : l));
  return out;
}
export function wrap(text, width, indent = 0) {
  const words = String(text).split(/\s+/).filter(Boolean), lines = []; let cur = "";
  for (const w of words) {
    const pre = cur ? cur + " " : (lines.length ? " ".repeat(indent) : "");
    if ((pre + w).length <= width) cur = pre + w;
    else { if (cur) lines.push(cur); cur = (lines.length ? " ".repeat(indent) : "") + w; while (cur.length > width) { lines.push(cur.slice(0, width)); cur = " ".repeat(indent) + cur.slice(width); } }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

/** "idag kl 11:45" → ["IDAG", "KL 11:45"], "lör 4/10 kl 12:00" → ["LÖR 4/10", "KL 12:00"] */
function splitWhen(text) {
  const [day, time] = String(text).split(/ kl /);
  return [String(day || "").toUpperCase(), time ? `KL ${time}` : ""];
}

/** Bryter långa ord utan mellanslag (e-postadresser) vid radbredden. */
function wrapHard(s, width) {
  const out = [];
  for (let i = 0; i < s.length; i += width) out.push(s.slice(i, i + width));
  return out;
}

export function eposReceipt(o) {
  const w = W(), isTable = o.kind === "table", rec = o.received || "";
  const p = [];
  p.push('<text lang="en" font="font_a" smooth="true"/>');
  p.push(t(settings.name.toUpperCase(), { align: "center", dh: true, em: true }));
  p.push(t(`${rec.slice(8, 10)}/${Number(rec.slice(5, 7))} ${rec.slice(11, 16)}`, { align: "center" }));
  p.push(t("=".repeat(w)));
  // Huvud: ordernummer och typ till vänster, hämtningsdag och -tid till höger (dubbel höjd, normal bredd)
  //   H1015                                  IDAG
  //   HÄMTNING                           KL 11:45
  const when = isTable ? ["", ""] : splitWhen(whenText(o.pickupDate, o.pickupTime));
  for (const l of row(o.no, when[0], w)) p.push(t(l, { dh: true, em: true }));
  for (const l of row(isTable ? `BORD ${o.table}` : "HÄMTNING", when[1], w)) p.push(t(l, { dh: true, em: true }));
  p.push(t("=".repeat(w)));
  for (const it of o.items) {
    // Rätterna i normal storlek och fetstil – tydligt men sparar papper på 58 mm (dubbel höjd blev för stort)
    for (const l of row(`${String(it.qty || "").padStart(2)}  ${it.name}`, it.price ? String(it.qty * it.price) : "", w, 4)) p.push(t(l, { em: true }));
    // Önskemål för raden – indraget så köket inte missar det
    if (it.note) for (const l of wrap(`>> ${it.note}`, w - 4, 2)) p.push(t("    " + l, { em: true }));
  }
  if (o.message) {
    p.push(t("-".repeat(w)), t("KOMMENTAR:", { em: true }));
    for (const l of wrap(o.message, w)) p.push(t(l, { em: true }));
  }
  p.push(t("-".repeat(w)));
  if (o.tip) for (const l of row("Dricks", `${o.tip} kr`, w)) p.push(t(l));
  for (const l of row("Summa", `${o.total} kr`, w)) p.push(t(l, { em: true }));
  // Betald syns i dubbel storlek och fetstil, obetald i vanlig tunn text
  // Betald: dubbel storlek och fetstil. Ej betald: fetstil så att kassan ser att pengarna ska tas in.
  if (o.paid) {
    const s = `BETALD · ${String(o.payment || "").toUpperCase()}`;
    // dubbel bredd tar två tecken per tecken – får det inte plats skrivs "BETALD" stort och sättet på egen rad
    if (s.length * 2 <= w) p.push(t(s, { dw: true, dh: true, em: true }));
    else { p.push(t("BETALD", { dw: true, dh: true, em: true })); for (const l of wrap(String(o.payment || "").toUpperCase(), w)) p.push(t(l, { em: true })); }
  }
  else for (const l of wrap(`EJ BETALD · ${String(o.payment || "").toUpperCase()}${isTable ? " (vid utgång)" : ""}`, w)) p.push(t(l, { em: true }));
  // Kund: namn och telefon stort så köket kan ringa direkt, e-post i vanlig storlek (kan vara lång)
  const phone = phonePretty(o.phone), mail = String(o.email || "").trim();
  if (o.name || phone || mail) {
    p.push(t("-".repeat(w)), t("KUND:", { em: true }));
    if (o.name) for (const l of wrap(o.name, w)) p.push(t(l, { em: true }));
    if (phone) p.push(t(`Tel ${phone}`, { em: true }));
    if (mail) for (const l of wrapHard(mail, w)) p.push(t(l));
  }
  p.push(t("-".repeat(w)));
  const foot = [`${settings.siteHost}  ·  ${settings.phone}`, `${settings.siteHost} · ${settings.phone}`].find(s => s.length <= w);
  if (foot) p.push(t(foot, { align: "center" }));
  else p.push(t(settings.siteHost, { align: "center" }), t(settings.phone, { align: "center" }));
  p.push('<feed line="1"/><cut type="feed"/>');
  return p.join("\n");
}

/** Svar till skrivaren när det finns ett jobb (Server Direct Print Version 3.00). */
export function sdpDocument(jobs) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<PrintRequestInfo Version="3.00">
${jobs.map(j => `  <ePOSPrint>
    <Parameter>
      <devid>local_printer</devid>
      <timeout>10000</timeout>
      <printjobid>${x(j.no)}</printjobid>
    </Parameter>
    <PrintData>
      <epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">
${eposReceipt(j).split("\n").map(l => "        " + l).join("\n")}
      </epos-print>
    </PrintData>
  </ePOSPrint>`).join("\n")}
</PrintRequestInfo>
`;
}
