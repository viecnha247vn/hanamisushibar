process.env.HOURS_FORCE = "open";   // testerna ska inte bero på klockan (stängt-läget testas separat)
// Kundskärmen /skarm: /api/board visar bara ordernummer och status – inga personuppgifter eller belopp.
import assert from "node:assert/strict";
process.env.GAS_URL = "https://script.google.com/macros/s/x/exec"; process.env.GAS_SECRET = "s";
const orders = [   // som listOrders_: nyast först
  { no: "H5", kind: "pickup", status: "Ny", pickupTime: "17:30", name: "Bo Ek", phone: "070 123", total: 300 },
  { no: "H4", kind: "table", table: "7", status: "Tillagas", name: "", phone: "", total: 120 },
  { no: "H3", kind: "pickup", status: "Klar", pickupTime: "17:00", name: "Al Ny", phone: "070 999", total: 99 },
  { no: "H2", kind: "pickup", status: "Tillagas", pickupTime: "16:45", name: "X", phone: "1", total: 1 },
  { no: "H1", kind: "pickup", status: "Hämtad", pickupTime: "16:00", name: "Y", phone: "2", total: 2 }
];
globalThis.fetch = async (url, init) => { assert.equal(JSON.parse(init.body).action, "adminOrders"); return new Response(JSON.stringify({ ok: true, orders }), { status: 200 }); };
const { default: handler } = await import("../api/index.js");
const call = async query => { const r = { statusCode: 200, headers: {}, body: "" }; r.status = c => { r.statusCode = c; return r; }; r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; return r; }; r.end = b => { r.body = String(b); return r; };
  await handler({ method: "GET", url: "/api/board", headers: {}, query: { route: "board", ...query } }, r); return { ...r, json: JSON.parse(r.body) }; };
console.log("Kundskärm");
let r = await call({});
assert.deepEqual(r.json.cooking.map(o => o.no), ["H2", "H5"]);     // äldst först, bordsordrar bara med ?bord=1
assert.deepEqual(r.json.ready.map(o => o.no), ["H3"]);
assert.ok(!/Bo Ek|070|300/.test(r.body), "inga namn, telefonnummer eller belopp");
assert.match(r.headers["cache-control"], /s-maxage/);
console.log("  ✓ bara ordernummer och tid; Ny+Tillagas → Tillagas, Klar → Klar att hämta; Hämtad syns inte");
r = await call({ bord: "1" });
assert.deepEqual(r.json.cooking.map(o => o.no), ["H2", "H4", "H5"]); assert.equal(r.json.cooking[1].table, "7");
console.log("  ✓ ?bord=1 tar med bordsbeställningar");
process.env.HOURS_FORCE = "closed";
globalThis.fetch = async () => { throw new Error("stängt: Apps Script ska inte anropas"); };
r = await call({});
assert.equal(r.json.closed, true); assert.deepEqual(r.json.cooking, []); assert.match(r.headers["cache-control"], /s-maxage=120/);
console.log("  ✓ stängt: svarar direkt utan Apps Script, längre cache");
const { openNow } = await import("../lib/hours.js");
delete process.env.HOURS_FORCE;
assert.equal(openNow(undefined, undefined, new Date("2026-10-28T09:30:00Z")), true);    // ons 10:30 (öppnar 11)
assert.equal(openNow(undefined, undefined, new Date("2026-10-28T08:00:00Z")), true);    // ons 09:00 (2 h före)
assert.equal(openNow(undefined, undefined, new Date("2026-10-28T07:59:00Z")), false);   // ons 08:59
assert.equal(openNow(undefined, undefined, new Date("2026-10-28T20:30:00Z")), false);   // ons 21:30 (stänger 20 + 1 h)
assert.equal(openNow(undefined, undefined, new Date("2026-11-01T12:00:00Z")), false);   // söndag stängt
console.log("  ✓ openNow: 2 h före öppning – 1 h efter stängning, söndag stängt");
console.log("\n4 tester OK");
