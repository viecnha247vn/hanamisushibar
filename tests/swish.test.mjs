// Swish Handel utan Swish och utan Google: lib/swish.js, /api/pay (payment "swishapi"), statusfrågan,
// callbacken /api/swish och återbetalning från köksvyn – med simulerad Swish (setSwishTransport) och Apps Script (fetch).
import assert from "node:assert/strict";

process.env.ADMIN_KEY = "admin"; process.env.SITE_URL = "https://www.hanamisushibar.se";
process.env.GAS_URL = "https://script.google.com/macros/s/x/exec"; process.env.GAS_SECRET = "s";
process.env.SWISH_CERT = Buffer.from("-----BEGIN CERTIFICATE-----\nx\n-----END CERTIFICATE-----").toString("base64");
process.env.SWISH_KEY = "-----BEGIN PRIVATE KEY-----\\ny\\n-----END PRIVATE KEY-----";
process.env.SWISH_PAYEE = "1237066756";

const sw = await import("../lib/swish.js");
let n = 0; const ok = name => { n++; console.log("  ✓", name); };
console.log("Swish Handel");

assert.match(sw.pem(process.env.SWISH_CERT), /^-----BEGIN CERTIFICATE-----\nx\n/);
assert.match(sw.pem(process.env.SWISH_KEY), /^-----BEGIN PRIVATE KEY-----\ny\n/);
assert.match(sw.instructionId(), /^[0-9A-F]{32}$/);
assert.equal(sw.swishMessage("Hanami Sushi Bar – bord 4 · P123 <x>"), "Hanami Sushi Bar  bord 4  P123 x");
assert.equal(sw.amountText(21050), "210.50");
assert.ok(sw.swishConfigured());
ok("certifikat som base64 eller PEM, instructionUUID, tillåtna tecken i meddelandet, belopp");

// --- simulerad Swish ---
const swish = { payments: new Map(), refunds: new Map(), calls: [] };
sw.setSwishTransport(async (method, path, body) => {
  swish.calls.push({ method, path, body });
  let m;
  if (method === "PUT" && (m = path.match(/^\/api\/v2\/paymentrequests\/([0-9A-F]{32})$/))) {
    swish.payments.set(m[1], { id: m[1], status: "CREATED", amount: Number(body.amount), payeePaymentReference: body.payeePaymentReference });
    return { status: 201, headers: { paymentrequesttoken: "tok" + m[1].slice(0, 8) }, data: null };
  }
  if (method === "GET" && (m = path.match(/^\/api\/v1\/paymentrequests\/(\w+)$/))) {
    const p = swish.payments.get(m[1]); return p ? { status: 200, headers: {}, data: p } : { status: 404, headers: {}, data: [{ errorCode: "RP04" }] };
  }
  if (method === "PUT" && (m = path.match(/^\/api\/v2\/refunds\/([0-9A-F]{32})$/))) {
    if (Number(body.amount) > 500) return { status: 422, headers: {}, data: [{ errorCode: "AM04", errorMessage: "Insufficient funds" }] };
    swish.refunds.set(m[1], { id: m[1], status: "PAID", amount: Number(body.amount), payerPaymentReference: body.payerPaymentReference, originalPaymentReference: body.originalPaymentReference });
    return { status: 201, headers: {}, data: null };
  }
  if (method === "GET" && (m = path.match(/^\/api\/v1\/refunds\/(\w+)$/))) return { status: 200, headers: {}, data: swish.refunds.get(m[1]) };
  throw new Error("oväntat Swish-anrop " + method + " " + path);
});

// --- simulerad Apps Script ---
const pending = new Map(), orders = new Map([["H9100", { stripe: "swish:PR123", total: 300, refunded: 0 }]]), gasCalls = [];
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.startsWith("https://mpc.getswish.net/")) return new Response("<svg>qr " + JSON.parse(init.body).token + "</svg>", { status: 200 });
  const { action, payload } = JSON.parse(init.body); gasCalls.push({ action, payload });
  const reply = o => new Response(JSON.stringify({ ok: true, ...o }), { status: 200 });
  const err = (status, error) => new Response(JSON.stringify({ ok: false, status, error }), { status: 200 });
  if (action === "payPending") { const ref = "PSWISH000000" + pending.size; pending.set(ref, { status: "väntar", total: 210, order: payload.order }); return reply({ ref, total: 210, sum: 200, tip: 10, lines: [] }); }
  if (action === "paySession") { pending.get(payload.ref).sid = payload.sessionId; return reply({}); }
  if (action === "payConfirm") { const p = pending.get(payload.ref);
    if (p.sid !== payload.sessionId) return err(409, "Sessionen stämmer inte.");
    if (p.status === "betald") return reply({ no: p.no, already: true });
    if (payload.amount !== p.total * 100) return err(409, "Belopp");
    Object.assign(p, { status: "betald", no: "H9100", method: payload.method, intent: payload.paymentIntent }); return reply({ no: "H9100" }); }
  if (action === "payFail") { const p = pending.get(payload.ref); if (p.status === "väntar") p.status = payload.status === "expired" ? "utgången" : "misslyckad"; return reply({}); }
  if (action === "payStatus") { const p = pending.get(payload.ref); if (!p || p.sid !== payload.sessionId) return err(404, "Okänd betalning.");
    return reply({ status: p.status, no: p.no || "", total: p.total, method: p.status === "betald" ? "Swish" : "", kind: p.order.kind }); }
  if (action === "refundInfo") { const o = orders.get(payload.no); return o ? reply({ no: payload.no, ...o }) : err(404, "Hittar inte"); }
  if (action === "refunded") { const o = orders.get(payload.no); o.refunded = payload.refundedOre / 100; o.noted = payload; return reply({ no: payload.no }); }
  return err(400, "okänd action " + action);
};

const { default: handler } = await import("../api/index.js");
function fakeRes() { const r = { statusCode: 200, headers: {}, body: "" }; r.status = c => { r.statusCode = c; return r; }; r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; return r; }; r.end = b => { r.body = b == null ? "" : String(b); return r; }; return r; }
const call = async (req) => { const res = fakeRes(); await handler({ query: {}, headers: {}, ...req }, res); let json = null; try { json = JSON.parse(res.body || "null"); } catch {} return { status: res.statusCode, json, body: res.body, headers: res.headers }; };

// Beställningen (öppettider m.m.) testas i pay.test.mjs – här kringgås buildOrder genom att låta payPending svara oavsett.
const orderBody = { type: "pickup-order", payment: "swishapi", tip: 10, items: [{ id: "maki-1", qty: 2 }], name: "Bo Ek", phone: "0701234567", email: "bo@exempel.se", message: "" };
const start = await call({ url: "/api/pay", method: "POST", query: { route: "pay" }, body: orderBody });
if (start.status === 400) {
  console.log("  (hoppar över start – beställning stängd just nu:", start.json.error + ")");
  // Lägg in en väntande betalning direkt så att resten kan testas dygnet runt
  pending.set("PSWISH0000000", { status: "väntar", total: 210, order: { kind: "pickup" } });
  const id = sw.instructionId(); swish.payments.set(id, { id, status: "CREATED", amount: 210, payeePaymentReference: "PSWISH0000000" });
  pending.get("PSWISH0000000").sid = "sw_" + id;
} else {
  assert.equal(start.status, 200, JSON.stringify(start.json));
  const put = swish.calls.find(c => c.method === "PUT");
  assert.equal(put.body.payeeAlias, "1237066756");
  assert.equal(put.body.amount, "210.00");
  assert.equal(put.body.currency, "SEK");
  assert.equal(put.body.callbackUrl, "https://www.hanamisushibar.se/api/swish");
  assert.equal(put.body.payeePaymentReference, start.json.ref);
  assert.equal(put.body.payerAlias, undefined);                       // m-handel: gästen öppnar appen eller skannar QR
  assert.match(start.json.sid, /^sw_[0-9A-F]{32}$/);
  assert.match(start.json.url, /^https:\/\/www\.hanamisushibar\.se\/tack\?ref=PSWISH\w+&sid=sw_[0-9A-F]{32}&tok=tok/);
  ok("start: Swish-förfrågan till rätt nummer, belopp, callback; tacksidan får ref, sid och token");
}
const ref = "PSWISH0000000", sid = pending.get(ref).sid, id = sid.slice(3);

let st = await call({ url: "/api/pay", method: "GET", query: { route: "pay", ref, sid } });
assert.equal(st.json.status, "väntar");
swish.payments.get(id).status = "PAID"; swish.payments.get(id).paymentReference = "PR777";
st = await call({ url: "/api/pay", method: "GET", query: { route: "pay", ref, sid } });
assert.equal(st.json.status, "betald"); assert.equal(st.json.no, "H9100");
assert.equal(pending.get(ref).intent, "swish:PR777"); assert.equal(pending.get(ref).method, "swish");
ok("statusfrågan: väntar → Swish PAID → ordern skapas (payConfirm swish, referens swish:PR777)");

const cb = await call({ url: "/api/swish", method: "POST", query: { route: "swish" }, body: { id, payeePaymentReference: ref, status: "PAID", amount: 1 } });
assert.equal(cb.status, 200); assert.equal(gasCalls.filter(c => c.action === "payConfirm").length, 2);   // idempotent i arket
const fake = await call({ url: "/api/swish", method: "POST", query: { route: "swish" }, body: { id: "0".repeat(32), payeePaymentReference: ref, status: "PAID" } });
assert.equal(fake.status, 500);   // finns inte hos Swish → ingenting skrivs
assert.equal(gasCalls.filter(c => c.action === "payConfirm").length, 2);
ok("callback: läser alltid Swish själv – falsk callback skapar ingen order");

// Avbruten betalning
pending.set("PSWISH0000009", { status: "väntar", total: 210, order: { kind: "pickup" }, sid: "sw_" + "A".repeat(32) });
swish.payments.set("A".repeat(32), { id: "A".repeat(32), status: "ERROR", errorCode: "TM01", payeePaymentReference: "PSWISH0000009" });
st = await call({ url: "/api/pay", method: "GET", query: { route: "pay", ref: "PSWISH0000009", sid: "sw_" + "A".repeat(32) } });
assert.equal(st.json.status, "utgången");
ok("Swish-förfrågan som gått ut (TM01) → utgången, ingen order");

const qr = await call({ url: "/api/pay", method: "GET", query: { route: "pay", qr: "tokABC12345" } });
assert.equal(qr.headers["content-type"], "image/svg+xml"); assert.match(qr.body, /qr tokABC12345/);
ok("QR-kod (SVG) för datorer");

const adm = b => call({ url: "/api/admin", method: "POST", query: { route: "admin" }, headers: { "x-admin-key": "admin" }, body: JSON.stringify(b) });
let r = await adm({ kind: "refund", no: "H9100", amount: 100 });
assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(r.json.status, "succeeded"); assert.equal(r.json.remaining, 200);
const rput = swish.calls.filter(c => c.method === "PUT" && c.path.startsWith("/api/v2/refunds")).at(-1).body;
assert.equal(rput.originalPaymentReference, "PR123"); assert.equal(rput.payerAlias, "1237066756"); assert.equal(rput.amount, "100.00");
assert.equal(rput.payerPaymentReference, "H9100T10000");
assert.equal(orders.get("H9100").noted.refundedOre, 10000); assert.equal(orders.get("H9100").noted.capturedOre, 30000);
r = await adm({ kind: "refund", no: "H9100" });
assert.equal(r.json.refunded, 300); assert.equal(r.json.remaining, 0);
r = await adm({ kind: "refund", no: "H9100" });
assert.equal(r.status, 409);
ok("återbetalning från köksvyn: delbelopp, sedan resten, sedan nekad – arket antecknar totalt");

orders.set("H9101", { stripe: "swish:PR9", total: 900, refunded: 0 });
r = await adm({ kind: "refund", no: "H9101" });
assert.equal(r.status, 422); assert.match(r.json.error, /AM04/); assert.equal(orders.get("H9101").noted, undefined);
ok("Swish nekar (t.ex. för lite pengar på kontot) → tydligt fel, inget antecknas");

const rid = [...swish.refunds.keys()][0];
const rcb = await call({ url: "/api/swish", method: "POST", query: { route: "swish" }, body: { id: rid, originalPaymentReference: "PR123", status: "PAID" } });
assert.equal(rcb.status, 200); assert.equal(rcb.json.refunded, "H9100");
ok("callback för återbetalning antecknar ordernr och totalbelopp från referensen");

console.log(`\n${n} tester OK`);
