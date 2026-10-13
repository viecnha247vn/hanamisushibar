// Plattformsrapport för Queenie89 AB (lib/platform.js + /api/platform). Data = verkliga Stripe-balanstransaktioner 2026-10-13.
import assert from "node:assert/strict";
process.env.GAS_SECRET = "hemlig"; process.env.STRIPE_SECRET_KEY = "sk_test_x"; process.env.STRIPE_ACCOUNT = "acct_h";
process.env.GAS_URL = "https://script.google.com/macros/s/x/exec"; process.env.ADMIN_KEY = "admin";
const { summarizePlatform, stockholmMidnight } = await import("../lib/platform.js");
let n = 0; const ok = s => { n++; console.log("  ✓", s); };
console.log("Q89 plattformsrapport");

assert.equal(new Date(stockholmMidnight("2026-10-13") * 1000).toISOString(), "2026-10-12T22:00:00.000Z");   // sommartid
assert.equal(new Date(stockholmMidnight("2026-11-02") * 1000).toISOString(), "2026-11-01T23:00:00.000Z");   // vintertid
ok("dagsgräns 00.00 Stockholm (sommar- och vintertid)");

const bts = [
  { type: "application_fee", amount: 2156, fee: 0, net: 2156 },
  { type: "transfer", amount: -48900, fee: 0, net: -48900 },
  { type: "charge", amount: 48900, fee: 914, net: 47986 },
  { type: "transfer_refund", amount: 1200, fee: 0, net: 1200 },
  { type: "refund", amount: -1200, fee: 0, net: -1200 },
  { type: "application_fee", amount: 248, fee: 0, net: 248 },
  { type: "transfer", amount: -1200, fee: 0, net: -1200 },
  { type: "charge", amount: 1200, fee: 198, net: 1002 }
];
const charges = [
  { id: "ch_a", status: "succeeded", created: 1791892300, amount: 1200, amount_refunded: 1200, application_fee_amount: 248, description: "Hanami Sushi Bar – hämtning – PA9", metadata: { restaurant: "hanami" }, balance_transaction: { fee: 198 } },
  { id: "ch_b", status: "succeeded", created: 1791901465, amount: 48900, amount_refunded: 0, application_fee_amount: 2156, description: "Hanami Sushi Bar – hämtning – P8A", metadata: { restaurant: "hanami" }, balance_transaction: { fee: 914 } },
  { id: "ch_x", status: "failed", amount: 999 }
];
const r = summarizePlatform(bts, charges);
assert.equal(r.charges, 501); assert.equal(r.chargeCount, 2);
assert.equal(r.appFees, 24.04); assert.equal(r.appFeeCount, 2);
assert.equal(r.stripeFees, 11.12);
assert.equal(r.profit, 12.92);                       // 24,04 − 11,12
assert.equal(r.refunds, 12); assert.equal(r.refundCount, 1);
assert.equal(r.toRestaurants, 501); assert.equal(r.fromRestaurants, 12);
assert.equal(r.net, 12.92);                          // genomströmningen nettar till resultatet
ok("verklig dag: avgifter 24,04 − Stripe 11,12 = resultat 12,92 = saldots nettoförändring");

assert.equal(r.orders.length, 2);
assert.deepEqual(r.orders[1], { time: 1791901465, desc: "Hanami Sushi Bar – hämtning – P8A", restaurant: "hanami", amount: 489, refunded: 0, appFee: 21.56, stripeFee: 9.14, margin: 12.42, method: "" });
assert.equal(r.orders[0].refunded, 12); assert.equal(r.orders[0].margin, 0.5);
ok("per order: belopp, Q89-avgift, Stripe-avgift, kvar; misslyckade hoppas över");

const r2 = summarizePlatform([{ type: "application_fee_refund", amount: -248, net: -248, fee: 0 }, { type: "stripe_fee", amount: -2500, net: -2500, fee: 0 }, { type: "payout", amount: -10000, net: -10000, fee: 0 }]);
assert.equal(r2.appFeeRefunds, 2.48); assert.equal(r2.otherFees, 25); assert.equal(r2.payouts, 100); assert.equal(r2.profit, -27.48);
ok("återbetald avgift, övriga Stripe-avgifter (Connect) och utbetalning");

// --- /api/platform: bara med rätt nyckel ---
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.includes("/v1/balance_transactions")) return new Response(JSON.stringify({ data: bts, has_more: false }), { status: 200 });
  if (u.includes("/v1/charges")) return new Response(JSON.stringify({ data: charges, has_more: false }), { status: 200 });
  if (u.includes("/v1/balance")) return new Response(JSON.stringify({ available: [{ currency: "sek", amount: 0 }], pending: [{ currency: "sek", amount: 2654 }] }), { status: 200 });
  throw new Error("oväntad fetch " + u);
};
const { default: handler } = await import("../api/index.js");
function fakeRes() { const r = { statusCode: 200, headers: {}, body: "" }; r.status = c => { r.statusCode = c; return r; }; r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; return r; }; r.end = b => { r.body = b == null ? "" : String(b); return r; }; return r; }
const get = async (headers, date = "2026-10-13") => { const res = fakeRes(); await handler({ method: "GET", url: "/api/platform", headers, query: { route: "platform", date } }, res); return { status: res.statusCode, json: JSON.parse(res.body || "null") }; };
let res = await get({ "x-report-key": "hemlig" });
assert.equal(res.status, 200); assert.equal(res.json.profit, 12.92); assert.equal(res.json.balance.pending, 26.54);
assert.equal((await get({})).status, 401);
assert.equal((await get({ "x-report-key": "fel!!!" })).status, 401);
assert.equal((await get({ "x-admin-key": "admin" })).status, 401, "köksvyns lösenord ska inte räcka");
assert.equal((await get({ "x-report-key": "hemlig" }, "igår")).status, 400);
ok("/api/platform: bara med GAS-nyckeln (inte köksvyns lösenord), datum krävs");

console.log(`\n${n} tester OK`);
