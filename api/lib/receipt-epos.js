// Kvitto som ePOS-Print XML för Epson Server Direct Print (TM-T88VII, TM-T88VI, TM-m30II/III …).
// Radbredd från settings.receiptWidth (TM-T88VII med 80 mm papper: 42 tecken, font A).
import settings from "../data/settings.js";
import { whenText } from "./when.js";

const W = () => settings.receiptWidth || 42;
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

export function eposReceipt(o) {
  const w = W(), isTable = o.kind === "table", rec = o.received || "";
  const p = [];
  p.push('<text lang="en" font="font_a" smooth="true"/>');
  p.push(t(settings.name.toUpperCase(), { align: "center", dh: true, em: true }));
  p.push(t(`${rec.slice(8, 10)}/${Number(rec.slice(5, 7))} ${rec.slice(11, 16)}`, { align: "center" }));
  p.push(t("=".repeat(w)));
  p.push(t(o.no, { dw: true, dh: true, em: true, align: "left" }));
  p.push(t(isTable ? `BORD ${o.table}` : "HÄMTNING", { dw: true, dh: true, em: true }));
  if (!isTable) p.push(t(whenText(o.pickupDate, o.pickupTime).toUpperCase(), { dh: true, em: true }));
  p.push(t("=".repeat(w)));
  for (const it of o.items) {
    for (const l of row(`${String(it.qty || "").padStart(2)}  ${it.name}`, it.price ? String(it.qty * it.price) : "", w, 4)) p.push(t(l, { dh: true, em: true }));
    // Önskemål för raden – indraget, understruket så köket inte missar det
    if (it.note) for (const l of wrap(`>> ${it.note}`, w - 4, 2)) p.push(t("    " + l, { dh: true, em: true }));
  }
  if (o.message) {
    p.push(t("-".repeat(w)), t("KOMMENTAR:", { em: true }));
    for (const l of wrap(o.message, w)) p.push(t(l, { dh: true }));
  }
  p.push(t("-".repeat(w)));
  for (const l of row("Summa", `${o.total} kr`, w)) p.push(t(l, { em: true }));
  p.push(t(`Betalning: ${o.payment}${isTable ? " (betalas vid utgång)" : ""}`));
  const contact = [o.name, o.phone].filter(Boolean).join("  ");
  if (contact) p.push(t(contact));
  p.push(t("-".repeat(w)));
  p.push(t(`${settings.siteHost}  ·  ${settings.phone}`, { align: "center" }));
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
