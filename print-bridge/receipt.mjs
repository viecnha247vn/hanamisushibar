// Kvittolayout för köket. Ändra här om köket vill ha annan ordning eller text.
import { Receipt } from "./escpos.mjs";

const pad2 = n => String(n).padStart(2, "0");

export function orderReceipt(o, cfg) {
  const r = new Receipt({ width: cfg.width });
  const isTable = o.kind === "table";
  const received = o.received || "";                 // "2026-09-16 18:12"
  const clock = received.slice(11, 16);
  const when = isTable ? "" : pickupLabel(o.pickupDate, o.pickupTime);

  // Huvud
  r.align("center").bold(true).size(1, 2).text(cfg.name).bold(false).size(1, 1);
  r.text(`${received.slice(8, 10)}/${Number(received.slice(5, 7))} ${clock}`);
  r.line("=");

  // Ordernummer + typ, stort
  r.align("left").bold(true).size(2, 2).text(o.no).size(1, 1).bold(false);
  r.bold(true).size(2, 2);
  if (isTable) r.text(`BORD ${o.table}`);
  else { r.text("HÄMTNING"); r.size(1, 2).text(when.toUpperCase()); }
  r.size(1, 1).bold(false);
  r.line("=");

  // Rader
  r.bold(true).size(1, 2);
  for (const it of o.items) r.row(`${String(it.qty || "").padStart(2)}  ${it.name}`, it.price ? `${it.qty * it.price}` : "", { indent: 4 });
  r.size(1, 1).bold(false);

  // Kommentar – tydligt
  if (o.message) { r.line("-"); r.bold(true).text("KOMMENTAR:").bold(false); r.size(1, 2).paragraph(o.message).size(1, 1); }

  r.line("-");
  r.bold(true).row("Summa", `${o.total} kr`).bold(false);
  r.text(`Betalning: ${o.payment}${isTable ? " (betalas vid utgång)" : ""}`);
  if (o.name || o.phone) r.text([o.name, o.phone].filter(Boolean).join("  "));
  r.line("-");
  r.align("center").text(`${cfg.site}  ·  ${cfg.phone}`);
  if (cfg.footer) r.text(cfg.footer);
  r.feed(2).cut();
  return r.bytes();
}

export function testReceipt(cfg) {
  const r = new Receipt({ width: cfg.width });
  r.align("center").bold(true).size(1, 2).text(cfg.name).size(1, 1).bold(false);
  r.text("Skrivarbryggan är igång").text(new Date().toLocaleString("sv-SE", { timeZone: "Europe/Stockholm" }));
  r.text("åäö ÅÄÖ é – test av tecken");
  r.line("-").align("left").row(" 2  Lax poke", "330").row(" 1  Tempura-räka bowl med lång text som bryts", "169", { indent: 4 });
  r.feed(2).cut();
  return r.bytes();
}

function pickupLabel(date, time) {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Stockholm" }));
  const iso = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const label = date === iso(now) ? "idag" : date === iso(tomorrow) ? "imorgon" : date;
  return `${label} kl ${time}`;
}
