// Omsättningsrapport för köksvyn (Rapport): summerar beställningsrader från Apps Script (reportOrders)
// per dag, per månad och totalt. Ren funktion – testas i tests/report.test.mjs.
//
// Regler
//   • Avbokad order räknas inte – utom onlinebetald (pengarna togs; ev. återbetalning syns som Återbetalt).
//   • Brutto = Summa inkl. dricks. Netto = Brutto − Återbetalt.
//   • Moms (ingår) = (Netto − Dricks) × p / (100 + p). Dricks är inte momspliktig.
//   • Transaktionsavgift = avgiften per onlineorder (applicationFeeOre, samma som Avstämningsrapporten), behålls vid
//     återbetalning. Till bankkonto (kort) = Online kort − Återbetalt online − Transaktionsavgift. Ordet Q89 visas inte.
//   • Ej markerad betald = Swish där köket inte bockat "Betald" – kontrollera mot Swish.
//   • "Kort i kassan" räknas inte (betalsättet finns inte längre, raderna var test). Inget före reportFrom räknas.

import { applicationFeeOre } from "./stripe.js";

const KEYS = ["orders", "gross", "tips", "refunded", "net", "online", "swish", "unpaid", "vat", "pickup", "table", "cancelled",
  "fee", "onlineRefunded", "payout"];
const blank = () => Object.fromEntries(KEYS.map(k => [k, 0]));
const r2 = n => Math.round(n * 100) / 100;

export function summarize(orders, { vatPct = 6, from = "" } = {}) {
  const days = new Map(), months = new Map(), total = blank();
  const bucket = (map, key) => map.get(key) || map.set(key, blank()).get(key);

  for (const o of orders || []) {
    const date = String(o.d || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || (from && date < from)) continue;
    const method = o.online ? "online" : /swish/i.test(o.payment || "") ? "swish" : "kassa";
    if (method === "kassa") continue;
    const targets = [bucket(days, date), bucket(months, date.slice(0, 7)), total];
    if (o.status === "Avbokad" && !o.online) { targets.forEach(t => t.cancelled++); continue; }
    const amount = Number(o.total) || 0, tip = Number(o.tip) || 0, refunded = Math.min(Number(o.refunded) || 0, amount);
    const fee = o.online ? applicationFeeOre(Math.round(amount * 100)) / 100 : 0;
    for (const t of targets) {
      t.orders++; t.gross += amount; t.tips += tip; t.refunded += refunded; t[method] += amount;
      t[o.kind === "table" ? "table" : "pickup"]++;
      if (!o.online && !o.paid) t.unpaid += amount;
      if (o.online) { t.fee += fee; t.onlineRefunded += refunded; }
    }
  }

  const finish = t => {
    t.net = t.gross - t.refunded;
    t.payout = t.online - t.onlineRefunded - t.fee;
    t.vat = Math.max(0, (t.net - t.tips) * vatPct / (100 + vatPct));
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
  const head = ["Datum", "Order", "Brutto", "Dricks", "Återbetalt", "Netto", `Moms ${rep.vatPct} % (ingår)`, "Online kort", "Swish",
    "Ej markerad betald", "Hämtning", "Bord", "Avbokade",
    "Transaktionsavgift", "Till bankkonto (kort)"];
  const num = n => String(n).replace(".", ",");
  const line = (label, t) => [label, t.orders, t.gross, t.tips, t.refunded, t.net, t.vat, t.online, t.swish, t.unpaid, t.pickup, t.table, t.cancelled, t.fee, t.payout]
    .map((v, i) => i === 0 ? v : num(v)).join(";");
  const rows = by === "months" ? rep.months.map(m => line(m.month, m)) : rep.days.map(d => line(d.date, d));
  return "﻿" + [head.join(";"), ...rows, line("Totalt", rep.total)].join("\r\n") + "\r\n";
}
