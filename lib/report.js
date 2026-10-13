// Omsättningsrapport för köksvyn (Rapport): summerar beställningsrader från Apps Script (reportOrders)
// per dag, per månad och totalt. Ren funktion – testas i tests/report.test.mjs.
//
// Regler
//   • Avbokad order räknas inte – utom onlinebetald (pengarna togs; ev. återbetalning syns som Återbetalt).
//   • Brutto = Summa inkl. dricks. Netto = Brutto − Återbetalt.
//   • Moms (ingår) = (Netto − Dricks) × p / (100 + p). Dricks är inte momspliktig.
//   • Q89-avgift = 4 % + 2 kr per onlineorder (samma formel som Stripe drar, lib/stripe.js). Behålls vid återbetalning.
//   • Via Stripe = vad Hanami får från Stripe: Online − Återbetalt − Q89-avgift.
//   • Ej markerad betald = Swish/kort i kassan där köket inte bockat "Betald" – kontrollera mot Swish/kassan.
import { applicationFeeOre } from "./stripe.js";

const KEYS = ["orders", "gross", "tips", "refunded", "net", "online", "swish", "kassa", "unpaid", "fee", "payout", "vat", "pickup", "table", "cancelled"];
const blank = () => Object.fromEntries(KEYS.map(k => [k, 0]));
const r2 = n => Math.round(n * 100) / 100;

export function summarize(orders, { vatPct = 6 } = {}) {
  const days = new Map(), months = new Map(), total = blank();
  const bucket = (map, key) => map.get(key) || map.set(key, blank()).get(key);

  for (const o of orders || []) {
    const date = String(o.d || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const targets = [bucket(days, date), bucket(months, date.slice(0, 7)), total];
    if (o.status === "Avbokad" && !o.online) { targets.forEach(t => t.cancelled++); continue; }
    const amount = Number(o.total) || 0, tip = Number(o.tip) || 0, refunded = Math.min(Number(o.refunded) || 0, amount);
    const fee = o.online ? applicationFeeOre(Math.round(amount * 100)) / 100 : 0;
    const method = o.online ? "online" : /swish/i.test(o.payment || "") ? "swish" : "kassa";
    for (const t of targets) {
      t.orders++; t.gross += amount; t.tips += tip; t.refunded += refunded; t[method] += amount; t.fee += fee;
      t[o.kind === "table" ? "table" : "pickup"]++;
      if (!o.online && !o.paid) t.unpaid += amount;
    }
  }

  const finish = t => {
    t.net = t.gross - t.refunded;
    t.vat = Math.max(0, (t.net - t.tips) * vatPct / (100 + vatPct));
    t.payout = t.online - t.refunded - t.fee;
    t.avg = t.orders ? t.net / t.orders : 0;
    for (const k of [...KEYS, "avg"]) t[k] = r2(t[k]);
    return t;
  };
  return {
    vatPct,
    days: [...days].sort(([a], [b]) => a.localeCompare(b)).map(([date, t]) => ({ date, ...finish(t) })),
    months: [...months].sort(([a], [b]) => a.localeCompare(b)).map(([month, t]) => ({ month, ...finish(t) })),
    total: finish(total)
  };
}

/** CSV för bokföringen (semikolon + decimalkomma, öppnas direkt i svensk Excel/Numbers). */
export function reportCsv(rep, by = "days") {
  const head = ["Datum", "Order", "Brutto", "Dricks", "Återbetalt", "Netto", `Moms ${rep.vatPct} % (ingår)`, "Online kort", "Swish", "Kort i kassan",
    "Ej markerad betald", "Q89-avgift", "Via Stripe", "Hämtning", "Bord", "Avbokade"];
  const num = n => String(n).replace(".", ",");
  const line = (label, t) => [label, t.orders, t.gross, t.tips, t.refunded, t.net, t.vat, t.online, t.swish, t.kassa, t.unpaid, t.fee, t.payout, t.pickup, t.table, t.cancelled]
    .map((v, i) => i === 0 ? v : num(v)).join(";");
  const rows = by === "months" ? rep.months.map(m => line(m.month, m)) : rep.days.map(d => line(d.date, d));
  return "﻿" + [head.join(";"), ...rows, line("Totalt", rep.total)].join("\r\n") + "\r\n";
}
