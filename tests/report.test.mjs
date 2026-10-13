// Omsättningsrapporten: lib/report.js (summering, CSV) och /api/admin?view=report med simulerad Apps Script.
import assert from "node:assert/strict";

process.env.ADMIN_KEY = "admin"; process.env.GAS_URL = "https://script.google.com/macros/s/x/exec"; process.env.GAS_SECRET = "s";
delete process.env.STRIPE_FEE_PCT; delete process.env.STRIPE_FEE_FIXED;
const { summarize, reportCsv } = await import("../lib/report.js");

let n = 0; const ok = name => { n++; console.log("  ✓", name); };
console.log("Omsättningsrapport");

const orders = [
  { d: "2026-10-14", no: "H1", kind: "pickup", payment: "Online kort", status: "Klar", paid: true, total: 212, tip: 0, online: true, refunded: 0 },
  { d: "2026-10-14", no: "H2", kind: "table", payment: "Swish", status: "Klar", paid: true, total: 150, tip: 10, online: false, refunded: 0 },
  { d: "2026-10-14", no: "H3", kind: "pickup", payment: "Kort i kassan", status: "Klar", paid: false, total: 100, tip: 0, online: false, refunded: 0 },
  { d: "2026-10-15", no: "H4", kind: "pickup", payment: "Swish", status: "Avbokad", paid: false, total: 999, tip: 0, online: false, refunded: 0 },
  { d: "2026-10-15", no: "H5", kind: "pickup", payment: "Online kort", status: "Avbokad", paid: true, total: 100, tip: 0, online: true, refunded: 100 },
  { d: "2026-11-05", no: "H6", kind: "table", payment: "Online kort", status: "Klar", paid: true, total: 300, tip: 20, online: true, refunded: 50 },
  { d: "trasigt", no: "H7", total: 5 }
];
const rep = summarize(orders, { vatPct: 6 });

const d1 = rep.days.find(d => d.date === "2026-10-14");
assert.equal(d1.orders, 2); assert.equal(d1.gross, 362); assert.equal(d1.net, 362);
assert.equal(d1.online, 212); assert.equal(d1.swish, 150); assert.equal(d1.kassa, undefined); assert.equal(d1.unpaid, 0); assert.equal(d1.tips, 10);
assert.equal(d1.fee, undefined); assert.equal(d1.payout, undefined);   // plattformsavgiften visas aldrig för restaurangen
assert.equal(d1.vat, Math.round((362 - 10) * 6 / 106 * 100) / 100);
assert.equal(d1.pickup, 1); assert.equal(d1.table, 1); assert.equal(d1.avg, 181);
ok("dag: brutto/netto, online/Swish, dricks, moms utan dricks; 'kort i kassan' (test) och plattformsavgift räknas inte");

const d2 = rep.days.find(d => d.date === "2026-10-15");
assert.equal(d2.cancelled, 1); assert.equal(d2.orders, 1); assert.equal(d2.gross, 100); assert.equal(d2.refunded, 100); assert.equal(d2.net, 0);
assert.equal(d2.vat, 0);
ok("avbokad Swish räknas inte; avbokad onlineorder räknas med återbetalningen");

assert.deepEqual(rep.months.map(m => m.month), ["2026-10", "2026-11"]);
const oct = rep.months[0];
assert.equal(oct.orders, 3); assert.equal(oct.net, 362); assert.equal(oct.cancelled, 1);
assert.equal(rep.months[1].net, 250); assert.equal(rep.months[1].refunded, 50);
assert.equal(rep.total.orders, 4); assert.equal(rep.total.net, 612); assert.equal(rep.total.gross, 762);
ok("månader och totalt summeras; trasiga rader hoppas över");

const fromRep = summarize([{ d: "2026-10-12", total: 999, online: true, status: "Klar" }, ...orders], { from: "2026-10-13" });
assert.equal(fromRep.total.net, 612); assert.ok(!fromRep.days.some(d => d.date === "2026-10-12"));
ok("from (reportFrom): allt före startdagen räknas inte");

const empty = summarize([]);
assert.equal(empty.total.net, 0); assert.equal(empty.total.avg, 0); assert.deepEqual(empty.days, []);
ok("tom period ger nollor");

const csv = reportCsv(rep);
assert.ok(csv.startsWith("﻿Datum;Order;Brutto"));
assert.match(csv, /\r\n2026-10-14;2;362;10;0;362;[\d,]+;212;150;0;1;1;0\r\n/);
assert.match(csv, /\r\nTotalt;4;762;/);
assert.match(reportCsv(rep, "months"), /\r\n2026-11;1;300;20;50;250;/);
ok("CSV: semikolon, decimalkomma, BOM för Excel, per dag och per månad");

// --- /api/admin?view=report via routern, Apps Script simulerad ---
const sent = [];
globalThis.fetch = async (url, init) => {
  const { action, payload } = JSON.parse(init.body); sent.push({ action, payload });
  if (action === "reportOrders") return new Response(JSON.stringify({ ok: true, orders, archive: "ok" }), { status: 200 });
  return new Response(JSON.stringify({ ok: false, status: 400, error: "okänd" }), { status: 200 });
};
const { default: handler } = await import("../api/index.js");
function fakeRes() { const r = { statusCode: 200, headers: {}, body: "" }; r.status = c => { r.statusCode = c; return r; }; r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; return r; }; r.end = b => { r.body = b == null ? "" : String(b); return r; }; return r; }
const get = async (query, key = "admin") => { const res = fakeRes(); await handler({ method: "GET", url: "/api/admin", headers: { "x-admin-key": key }, query: { route: "admin", view: "report", ...query } }, res); return res; };

let res = await get({ from: "2026-10-14", to: "2026-10-31" });
assert.equal(res.statusCode, 200);
const body = JSON.parse(res.body);
assert.equal(body.total.net, 612); assert.equal(body.archive, "ok"); assert.equal(body.vatPct, 6);
assert.deepEqual(sent.at(-1), { action: "reportOrders", payload: { from: "2026-10-14", to: "2026-10-31" } });
ok("GET ?view=report → summering som JSON");

res = await get({ from: "2026-10-14", to: "2026-10-31", format: "csv", by: "months" });
assert.equal(res.statusCode, 200); assert.match(res.headers["content-type"], /text\/csv/);
assert.match(res.headers["content-disposition"], /hanami-omsattning-2026-10-14_2026-10-31\.csv/);
assert.match(res.body, /^﻿Datum;/);
ok("GET ?view=report&format=csv → nedladdning");

assert.equal((await get({ from: "2026-10-31", to: "2026-10-14" })).statusCode, 400);
assert.equal((await get({ from: "2025-01-01", to: "2026-12-31" })).statusCode, 400);
assert.equal((await get({ from: "x", to: "2026-10-14" })).statusCode, 400);
assert.equal((await get({ from: "2026-10-14", to: "2026-10-31" }, "fel")).statusCode, 401);
ok("fel datum, för lång period och fel lösenord nekas");

console.log(`\n${n} tester OK`);
