// Testar telefonformat och kundblocket på kvittot (namn, telefon, e-post).
import assert from "node:assert/strict";
const { phonePretty } = await import("../lib/util.js");
const { eposReceipt } = await import("../lib/receipt-epos.js");

const cases = [
  ["+46790547559", "079-054 75 59"],
  ["46790547559",  "079-054 75 59"],   // Sheets har tappat "+"
  [46790547559,    "079-054 75 59"],   // och gjort det till ett tal
  ["0790547559",   "079-054 75 59"],
  ["079-054 75 59","079-054 75 59"],
  ["0046790547559","079-054 75 59"],
  ["+46431472999", "0431472999"],      // fast nummer: utan landskod, oformaterat
  ["+4512345678",  "+4512345678"],     // utländskt behåller landskod
  ["", ""], [null, ""]
];
for (const [inp, want] of cases) assert.equal(phonePretty(inp), want, `phonePretty(${JSON.stringify(inp)})`);
console.log(`  ✓ phonePretty: ${cases.length} fall`);

const text = xml => [...xml.matchAll(/>([^<]*)&#10;</g)].map(m => m[1].replace(/&amp;/g, "&").replace(/&gt;/g, ">"));
const base = { no: "H1011", kind: "pickup", received: "2026-10-01 09:45", pickupDate: "2026-10-01", pickupTime: "11:00",
  items: [{ qty: 1, name: "Bowl med crunchy chicken", price: 150 }], total: 150, paid: false, payment: "Kort i kassan" };

let lines = text(eposReceipt({ ...base, name: "Queenie", phone: "46790547559", email: "queenie.nguyen.lang.adress@exempel-foretag.se" }));
assert.ok(lines.includes("KUND:"));
assert.ok(lines.includes("Queenie"));
assert.ok(lines.includes("Tel 079-054 75 59"));
assert.ok(lines.join("").includes("queenie.nguyen.lang.adress@exempel-foretag.se"));
assert.ok(lines.every(l => l.length <= 48), "ingen rad längre än 48 tecken");
console.log("  ✓ kundblock med namn, telefon och e-post, max 48 tecken/rad");

lines = text(eposReceipt({ ...base, name: "Anna", phone: "0701234567" }));
assert.ok(lines.includes("Tel 070-123 45 67") && !lines.some(l => l.includes("@")));
lines = text(eposReceipt({ ...base, kind: "table", table: 5 }));
assert.ok(!lines.includes("KUND:"), "bordsbeställning utan kontakt → inget kundblock");
console.log("  ✓ utan e-post / utan kontaktuppgifter");
// Huvud: nummer + typ till vänster, dag + tid till höger. Ej betald i fetstil, betald stort.
const raw = eposReceipt({ ...base, name: "Q", phone: "0701234567" });
lines = text(raw);
const head1 = lines.find(l => l.startsWith("H1011")), head2 = lines.find(l => l.startsWith("HÄMTNING"));
assert.match(head1, /^H1011\s+\S+$/); assert.match(head2, /^HÄMTNING\s+KL 11:00$/);
assert.equal(head1.length, 48); assert.equal(head2.length, 48);
assert.ok(!/dw="true"[^>]*>H1011/.test(raw), "ordernumret i normal bredd");
assert.match(raw, /em="true">EJ BETALD · KORT I KASSAN/);
assert.match(eposReceipt({ ...base, paid: true }), /dw="true" dh="true" em="true">BETALD · KORT I KASSAN/);
lines = text(eposReceipt({ ...base, kind: "table", table: 5 }));
assert.ok(lines.some(l => l.trim() === "BORD 5"));
console.log("  ✓ huvud vänster/höger, ej betald i fetstil, betald stort");
console.log("receipt.test: OK");
