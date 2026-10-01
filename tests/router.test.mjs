// Testar api/index.js: att varje adress hamnar hos rätt hanterare, oavsett hur Vercel levererar sökvägen,
// och att skrivarens adress /api/sdp/<nyckel> fungerar (det var den som gav Vercels 404 med catch-all-filen).
import assert from "node:assert/strict";

process.env.SDP_KEY = "testnyckel123";
process.env.SDP_ID = "hanami-kok";
process.env.CLOUDPRNT_KEY = "star123";
process.env.ADMIN_KEY = "admin";
// Ingen GAS_URL → hanterare som pratar med arket svarar 500 "Tekniskt fel", vilket räcker för att se att de nåddes.

const { default: handler, pathSegments } = await import("../api/index.js");

function fakeRes() {
  const r = { statusCode: 200, headers: {}, body: "" };
  r.status = c => { r.statusCode = c; return r; };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; return r; };
  r.end = b => { r.body = b == null ? "" : String(b); return r; };
  return r;
}
async function call({ url, method = "GET", query = {}, headers = {}, body }) {
  const req = { url, method, query, headers, body };
  const res = fakeRes();
  await handler(req, res);
  return res;
}
const json = r => { try { return JSON.parse(r.body); } catch { return null; } };

let n = 0;
const ok = (name) => { n++; console.log("  ✓", name); };

// 1. pathSegments – tre leveranssätt
assert.deepEqual(pathSegments({ query: { route: "sdp/abc" }, headers: {}, url: "/api/index?route=sdp%2Fabc" }), ["sdp", "abc"]);
assert.deepEqual(pathSegments({ query: { route: "sdp%2Fabc" }, headers: {}, url: "/api/index" }), ["sdp", "abc"]);
assert.deepEqual(pathSegments({ query: { route: ["sdp", "abc"] }, headers: {}, url: "/api/index" }), ["sdp", "abc"]);
assert.deepEqual(pathSegments({ query: {}, headers: { "x-vercel-original-pathname": "/api/sdp/abc" }, url: "/api/index" }), ["sdp", "abc"]);
assert.deepEqual(pathSegments({ query: {}, headers: {}, url: "/api/sdp/abc?x=1" }), ["sdp", "abc"]);
assert.deepEqual(pathSegments({ query: {}, headers: {}, url: "/api/index" }), []);
assert.deepEqual(pathSegments({ query: {}, headers: {}, url: "/api/submit" }), ["submit"]);
ok("pathSegments tolkar query, header och url");

// 2. Skrivaren: rätt nyckel + GetRequest når sdp-hanteraren (utan ark → 500 från hanteraren, INTE Vercel-404)
let r = await call({ url: "/api/index?route=sdp%2Ftestnyckel123", method: "POST", query: { route: "sdp/testnyckel123" },
  headers: { "content-type": "application/x-www-form-urlencoded" }, body: "ConnectionType=GetRequest&ID=hanami-kok&Name=X" });
assert.equal(r.statusCode, 500); assert.match(json(r).error, /Tekniskt fel/);
ok("/api/sdp/<rätt nyckel> når Server Direct Print-hanteraren");

// 3. Fel nyckel → 404 "Not found" (från sdp.js, inte "Okänd adress")
r = await call({ url: "/api/index", method: "POST", query: { route: "sdp/felnyckel" }, body: "ConnectionType=GetRequest&ID=hanami-kok" });
assert.equal(r.statusCode, 404); assert.equal(json(r).error, "Not found");
ok("fel nyckel → 404 Not found");

// 4. Rätt nyckel men fel ID → 403
r = await call({ url: "/api/index", method: "POST", query: { route: "sdp/testnyckel123" }, body: "ConnectionType=GetRequest&ID=annan" });
assert.equal(r.statusCode, 403);
ok("fel skrivar-ID → 403");

// 5. Body som Vercel redan tolkat till objekt
r = await call({ url: "/api/index", method: "POST", query: { route: "sdp/testnyckel123" }, body: { ConnectionType: "SetResponse", ID: "hanami-kok", ResponseFile: "<PrintResponseInfo/>" } });
assert.equal(r.statusCode, 200);
ok("SetResponse med tolkad body → 200");

// 6. Okända adresser → router-404 med tydligt meddelande
r = await call({ url: "/api/index", query: { route: "finnsinte" } });
assert.equal(r.statusCode, 404); assert.match(json(r).error, /Okänd adress: \/api\/finnsinte/);
r = await call({ url: "/api/index", query: { route: "submit/extra" } });
assert.equal(r.statusCode, 404);
r = await call({ url: "/api/index", query: { route: "sdp" } });            // nyckel saknas
assert.equal(r.statusCode, 404);
ok("okända adresser → 404 Okänd adress");

// 7. Vanliga adresser når sina hanterare
r = await call({ url: "/api/index", query: { route: "admin" } });
assert.equal(r.statusCode, 401);                                            // admin kräver x-admin-key
r = await call({ url: "/api/index", query: { route: "health" } });
assert.equal(r.statusCode, 500); assert.equal(json(r).ok, false);          // health utan ark
r = await call({ url: "/api/index", method: "POST", query: { route: "cloudprnt/star123" }, body: {} });
assert.notEqual(r.statusCode, 404);
ok("/api/admin, /api/health, /api/cloudprnt når sina hanterare");

console.log(`router.test: ${n} grupper OK`);
