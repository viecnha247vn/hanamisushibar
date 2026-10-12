// Testar onlinebetalningen utan Stripe och utan Google: lib/stripe.js (formkodning, signatur, avgift),
// /api/pay via routern och webhooken api/stripe-webhook.js med en simulerad Apps Script (gas) och ett simulerat Stripe (fetch).
import assert from "node:assert/strict";

process.env.ADMIN_KEY = "admin"; process.env.SDP_KEY = "k"; process.env.SITE_URL = "https://hanamisushibar.se";
process.env.STRIPE_SECRET_KEY = "sk_test_x"; process.env.STRIPE_ACCOUNT = "acct_hanami"; process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
process.env.STRIPE_VAT_PCT = "6";
process.env.GAS_URL = "https://script.google.com/macros/s/x/exec"; process.env.GAS_SECRET = "s";

const { encodeForm, applicationFeeOre, verifyWebhook, signWebhook } = await import("../lib/stripe.js");

let n = 0; const ok = name => { n++; console.log("  ✓", name); };
console.log("Onlinebetalning (Vercel)");

// --- lib/stripe.js ---
assert.equal(encodeForm({ a: 1, b: { c: "x" }, d: [{ e: 2 }, { e: 3 }], f: [ "t1" ], g: undefined }).toString(),
  "a=1&b%5Bc%5D=x&d%5B0%5D%5Be%5D=2&d%5B1%5D%5Be%5D=3&f%5B0%5D=t1");
ok("encodeForm nästlar nycklar som Stripe vill");
assert.equal(applicationFeeOre(30000), 1400);            // 4 % av 300 kr = 12 kr + 2 kr
assert.equal(applicationFeeOre(500), 220);
assert.equal(applicationFeeOre(0), 0);
ok("plattformsavgift 4 % + 2 kr i öre");
const body = JSON.stringify({ id: "evt_1", type: "checkout.session.completed", data: { object: { id: "cs_1" } } });
assert.equal(verifyWebhook(body, signWebhook(body, "whsec_test")).id, "evt_1");
assert.throws(() => verifyWebhook(body, signWebhook(body, "whsec_fel")), /stämmer inte/);
assert.throws(() => verifyWebhook(body, signWebhook(body, "whsec_test", Math.floor(Date.now() / 1000) - 3600)), /gammal/);
assert.throws(() => verifyWebhook(body + " ", signWebhook(body, "whsec_test")), /stämmer inte/);
ok("webhook-signatur: rätt, fel hemlighet, för gammal, ändrad kropp");

// --- simulerat Stripe + Apps Script via global fetch ---
const calls = { gas: [], stripe: [] };
const orders = new Map([["H9001", { no: "H9001", stripe: "pi_1", total: 210 }], ["H9002", { no: "H9002", stripe: "", total: 99 }]]);
let refundedOre = 0;   // vad Stripe redan återbetalat på pi_1
const pending = new Map();
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.startsWith(process.env.GAS_URL)) {
    const { action, payload } = JSON.parse(init.body); calls.gas.push({ action, payload });
    const reply = o => new Response(JSON.stringify({ ok: true, ...o }), { status: 200 });
    if (action === "payPending") { const ref = "PTEST0000000" + pending.size; const lines = payload.order.items.map(i => ({ id: i.id, name: "Rätt " + i.id, qty: i.qty, price: 100 }));
      const sum = lines.reduce((s, l) => s + l.qty * l.price, 0); pending.set(ref, { status: "väntar", total: sum + payload.order.tip, order: payload.order }); return reply({ ref, lines, sum, tip: payload.order.tip, total: sum + payload.order.tip }); }
    if (action === "paySession") { pending.get(payload.ref).sid = payload.sessionId; return reply({}); }
    if (action === "payConfirm") { const p = pending.get(payload.ref); if (!p) return new Response(JSON.stringify({ ok: false, status: 404, error: "Okänd" }), { status: 200 });
      if (p.status === "betald") return reply({ no: p.no, already: true });   // samma ordning som Pay.js: idempotens före beloppskontroll
      if (payload.amount !== p.total * 100) return new Response(JSON.stringify({ ok: false, status: 409, error: "Belopp" }), { status: 200 });
      p.status = "betald"; p.no = "H9001"; p.method = payload.method; return reply({ no: p.no, total: p.total }); }
    if (action === "payFail") { const p = pending.get(payload.ref); if (p && p.status === "väntar") p.status = payload.status === "expired" ? "utgången" : "misslyckad"; return reply({}); }
    if (action === "payStatus") { const p = pending.get(payload.ref); if (!p || p.sid !== payload.sessionId) return new Response(JSON.stringify({ ok: false, status: 404, error: "Okänd betalning." }), { status: 200 });
      return reply({ status: p.status, no: p.no || "", total: p.total, method: p.method || "", kind: p.order.kind, table: p.order.table || "", whenText: "" }); }
    if (action === "refundInfo") { const o = orders.get(payload.no); if (!o) return new Response(JSON.stringify({ ok: false, status: 404, error: "Hittar inte" }), { status: 200 });
      return reply({ no: payload.no, stripe: o.stripe, total: o.total, refunded: 0 }); }
    if (action === "refunded") { const o = payload.no ? orders.get(payload.no) : [...orders.values()].find(x => x.stripe === payload.stripe);
      if (!o) return new Response(JSON.stringify({ ok: false, status: 404, error: "Hittar ingen" }), { status: 200 });
      o.noted = payload.refundedOre; return reply({ no: o.no, refunded: payload.refundedOre / 100 }); }
    return new Response(JSON.stringify({ ok: false, status: 400, error: "okänd action " + action }), { status: 200 });
  }
  if (u.startsWith("https://api.stripe.com/v1/tax_rates")) {
    calls.stripe.push({ taxRates: init.method });
    if (init.method === "GET") return new Response(JSON.stringify({ data: [{ id: "txr_12", percentage: 12, country: "SE", inclusive: true, metadata: { q89: "moms" } }] }), { status: 200 });
    const form = Object.fromEntries(new URLSearchParams(init.body));
    assert.deepEqual([form.percentage, form.inclusive, form.country], ["6", "true", "SE"]);
    return new Response(JSON.stringify({ id: "txr_6", percentage: 6 }), { status: 200 });
  }
  if (u.startsWith("https://api.stripe.com/v1/checkout/sessions")) {
    const form = Object.fromEntries(new URLSearchParams(init.body)); calls.stripe.push(form);
    return new Response(JSON.stringify({ id: "cs_test_abc", url: "https://checkout.stripe.com/c/pay/cs_test_abc" }), { status: 200 });
  }
  if (u.startsWith("https://api.stripe.com/v1/payment_intents/")) {
    return new Response(JSON.stringify({ id: "pi_1", latest_charge: { id: "ch_1", status: "succeeded", amount_captured: 21000, amount_refunded: refundedOre, payment_method_details: { type: "card" } } }), { status: 200 });
  }
  if (u.startsWith("https://api.stripe.com/v1/refunds")) {
    const form = Object.fromEntries(new URLSearchParams(init.body)); calls.stripe.push({ refund: form, idem: init.headers["Idempotency-Key"] });
    refundedOre += Number(form.amount);
    return new Response(JSON.stringify({ id: "re_" + refundedOre, status: "succeeded", amount: Number(form.amount) }), { status: 200 });
  }
  throw new Error("oväntad fetch " + u);
};

const { default: handler } = await import("../api/index.js");
const { default: webhook } = await import("../api/stripe-webhook.js");
function fakeRes() { const r = { statusCode: 200, headers: {}, body: "" }; r.status = c => { r.statusCode = c; return r; }; r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; return r; }; r.end = b => { r.body = b == null ? "" : String(b); return r; }; return r; }
const call = async (req) => { const res = fakeRes(); await handler({ query: {}, headers: {}, ...req }, res); return { status: res.statusCode, json: JSON.parse(res.body || "null") }; };

// Öppet just nu? Testet ska fungera dygnet runt → bordsbeställning kräver öppet; vi testar med tid inom öppettid via "table" bara om öppet, annars pickup-fel ska vara "stängt".
const nowSE = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Stockholm" }));
const h = nowSE.getHours(), wd = nowSE.getDay();
const open = wd !== 0 && h >= (wd === 6 ? 12 : 11) && h < 20;

const orderBody = { type: "table-order", table: "4", payment: "online", tip: 10, items: [{ id: "maki-1", qty: 2 }], name: "", phone: "", email: "bo@exempel.se", message: "" };
let payRes = await call({ url: "/api/pay", method: "POST", query: { route: "pay" }, body: orderBody });
if (open) {
  assert.equal(payRes.status, 200, JSON.stringify(payRes.json));
  assert.equal(payRes.json.url, "https://checkout.stripe.com/c/pay/cs_test_abc");
  assert.match(payRes.json.ref, /^PTEST/);
  const f = calls.stripe.at(-1);
  assert.equal(f["payment_intent_data[transfer_data][destination]"], "acct_hanami");
  assert.equal(f["payment_intent_data[on_behalf_of]"], "acct_hanami");
  assert.equal(f["payment_intent_data[application_fee_amount]"], String(Math.round(21000 * 0.04) + 200));   // 2×100 kr + 10 kr dricks = 210 kr
  assert.equal(f["line_items[0][price_data][unit_amount]"], "10000");
  assert.equal(f["line_items[1][price_data][product_data][name]"], "Dricks till köket");
  assert.equal(f["line_items[0][tax_rates][0]"], "txr_6");             // STRIPE_VAT_PCT=6 → momssats skapas (12 % ignoreras)
  assert.equal(f["line_items[1][tax_rates][0]"], undefined);           // ingen moms på dricks
  assert.equal(f["client_reference_id"], payRes.json.ref);
  assert.equal(f["payment_method_types[0]"], "card"); assert.equal(f["payment_method_types[1]"], undefined);
  assert.match(f["success_url"], /\/tack\?ref=PTEST.*sid=\{CHECKOUT_SESSION_ID\}/);
  assert.deepEqual(calls.gas.map(c => c.action), ["payPending", "paySession"]);
  ok("/api/pay: kontroll → payPending → Checkout (endast kort, destination, on_behalf_of, avgift, dricks) → paySession");
} else {
  assert.equal(payRes.status, 400); assert.match(payRes.json.error, /stängd/i);
  ok("/api/pay utanför öppettid nekas som /api/submit (kör testet igen dagtid för fullt flöde)");
}

// /api/submit får inte ta emot payment: online
const sub = await call({ url: "/api/submit", method: "POST", query: { route: "submit" }, body: orderBody });
assert.equal(sub.status, 400); assert.match(sub.json.error, /api\/pay/);
ok("/api/submit avvisar payment=online");

// --- webhook ---
// Som i produktion: Vercel-request är en ström, req.body är en getter som tolkar JSON, Stripe skickar INDENTERAD JSON
{
  const { Readable } = await import("node:stream");
  const { rawBody } = await import("../api/stripe-webhook.js");
  const pretty = JSON.stringify({ id: "evt_p", type: "checkout.session.expired", data: { object: { id: "cs_p", metadata: { ref: "PX" } } } }, null, 2);
  const req = Readable.from([Buffer.from(pretty)]);
  let touched = false;
  Object.defineProperty(req, "body", { get() { touched = true; return JSON.parse(pretty); } });
  const raw = await rawBody(req);
  assert.equal(raw, pretty); assert.equal(touched, false);
  assert.equal(verifyWebhook(raw, signWebhook(pretty, "whsec_test")).id, "evt_p");
  ok("webhook läser rå ström före req.body (indenterad JSON, Vercel-getter rörs inte)");
}
const ref = open ? payRes.json.ref : (() => { const r = "PTEST0000000X"; pending.set(r, { status: "väntar", total: 210, sid: "cs_test_abc", order: { kind: "table", table: "4" } }); return r; })();
async function hook(event, { secret = "whsec_test", method = "POST" } = {}) {
  const raw = JSON.stringify(event); const res = fakeRes();
  const req = { method, headers: { "stripe-signature": signWebhook(raw, secret) }, body: raw };
  await webhook(req, res); return { status: res.statusCode, json: (() => { try { return JSON.parse(res.body); } catch { return res.body; } })() };
}
const completed = { id: "evt_c", type: "checkout.session.completed", data: { object: { id: "cs_test_abc", payment_status: "paid", payment_intent: "pi_1", amount_total: 21000, client_reference_id: ref, metadata: { ref } } } };

let r = await hook(completed, { secret: "whsec_fel" });
assert.equal(r.status, 400); ok("webhook med fel signatur → 400, ingen order");

r = await hook({ ...completed, data: { object: { ...completed.data.object, payment_status: "unpaid" } } });
assert.equal(r.status, 200); assert.equal(r.json.ignored, "not paid yet"); ok("completed utan betalning ignoreras");

r = await hook(completed);
assert.equal(r.status, 200); assert.equal(r.json.no, "H9001");
assert.equal(calls.gas.at(-1).action, "payConfirm"); assert.equal(calls.gas.at(-1).payload.method, "card"); assert.equal(calls.gas.at(-1).payload.amount, 21000);
ok("completed + paid → payConfirm med betalsätt (card) och belopp");

r = await hook(completed);
assert.equal(r.status, 200); assert.equal(r.json.already, true); ok("samma händelse igen → idempotent, ingen ny order");

r = await hook({ ...completed, data: { object: { ...completed.data.object, amount_total: 100 } } });
assert.equal(r.status, 200); assert.equal(r.json.already, true); ok("redan betald ref ändras inte av avvikande belopp");

const st = await call({ url: "/api/pay", method: "GET", query: { route: "pay", ref, sid: "cs_test_abc" } });
assert.equal(st.status, 200); assert.equal(st.json.status, "betald"); assert.equal(st.json.no, "H9001");
const bad = await call({ url: "/api/pay", method: "GET", query: { route: "pay", ref, sid: "cs_fel" } });
assert.equal(bad.status, 404); ok("GET /api/pay: status med rätt sid, 404 med fel sid");

const ref2 = "PTEST0000000Y"; pending.set(ref2, { status: "väntar", total: 100, sid: "cs_2", order: { kind: "pickup" } });
r = await hook({ id: "evt_e", type: "checkout.session.expired", data: { object: { id: "cs_2", client_reference_id: ref2, metadata: { ref: ref2 } } } });
assert.equal(r.json.failed, true); assert.equal(pending.get(ref2).status, "utgången"); ok("expired → payFail");

r = await hook(completed, { method: "GET" }); assert.equal(r.status, 405); ok("GET på webhooken → 405");

// --- återbetalning från köksvyn (/api/admin kind: refund) + webhook charge.refunded ---
{
  const adm = b => call({ url: "/api/admin", method: "POST", query: { route: "admin" }, headers: { "x-admin-key": "admin" }, body: JSON.stringify(b) });
  let a = await adm({ kind: "refund", no: "H9001", amount: 50 });
  assert.equal(a.status, 200); assert.equal(a.json.amount, 50); assert.equal(a.json.remaining, 160); assert.equal(a.json.noted, true);
  const f = calls.stripe.at(-1);
  assert.equal(f.refund.payment_intent, "pi_1"); assert.equal(f.refund.amount, "5000");
  assert.equal(f.refund.reverse_transfer, "true"); assert.equal(f.refund.refund_application_fee, "false");
  assert.equal(f.refund["metadata[order]"], "H9001"); assert.equal(f.idem, "refund-pi_1-0-5000");
  assert.equal(orders.get("H9001").noted, 5000);
  ok("köksvyn: delåterbetalning 50 kr → Stripe (reverse_transfer, avgiften behålls) + arket");

  a = await adm({ kind: "refund", no: "H9001", amount: 200 });
  assert.equal(a.status, 400); assert.match(a.json.error, /mellan 1 och 160 kr/);
  a = await adm({ kind: "refund", no: "H9001", amount: 0.5 }); assert.equal(a.status, 400);
  a = await adm({ kind: "refund", no: "H9002" }); assert.equal(a.status, 400); assert.match(a.json.error, /inte betald online/);
  a = await adm({ kind: "refund", no: "H0000" }); assert.equal(a.status, 404);
  const noKey = await call({ url: "/api/admin", method: "POST", query: { route: "admin" }, headers: { "x-admin-key": "fel" }, body: JSON.stringify({ kind: "refund", no: "H9001" }) });
  assert.equal(noKey.status, 401);
  ok("köksvyn: för stort belopp, under 1 kr, Swish-order, okänd order och fel lösenord nekas");

  a = await adm({ kind: "refund", no: "H9001" });
  assert.equal(a.status, 200); assert.equal(a.json.amount, 160); assert.equal(a.json.remaining, 0); assert.equal(orders.get("H9001").noted, 21000);
  a = await adm({ kind: "refund", no: "H9001" }); assert.equal(a.status, 409); assert.match(a.json.error, /redan helt/);
  ok("köksvyn: utan belopp → resten; därefter 'redan helt återbetald'");

  r = await hook({ id: "evt_r", type: "charge.refunded", data: { object: { id: "ch_1", payment_intent: "pi_1", amount_captured: 21000, amount_refunded: 21000 } } });
  assert.equal(r.status, 200); assert.equal(r.json.refunded, "H9001");
  assert.equal(calls.gas.at(-1).action, "refunded"); assert.equal(calls.gas.at(-1).payload.stripe, "pi_1");
  r = await hook({ id: "evt_r2", type: "charge.refunded", data: { object: { id: "ch_x", payment_intent: "pi_utan_order", amount_captured: 100, amount_refunded: 100 } } });
  assert.equal(r.status, 200); assert.match(r.json.ignored, /no order/);
  ok("webhook charge.refunded → arket via payment intent; okänd betalning ignoreras (200, ingen retry)");
}

console.log(`\n${n} tester OK`);
