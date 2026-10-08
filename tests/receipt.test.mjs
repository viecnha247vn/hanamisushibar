// Testar telefonformat och kundblocket på kvittot (namn, telefon, e-post).
import assert from "node:assert/strict";
const { phonePretty } = await import("../lib/util.js");
const { eposReceipt } = await import("../lib/receipt-epos.js");
const settings = (await import("../data/settings.js")).default;

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

for (const W of [32, 35, 48]) {
settings.receiptWidth = W;
const text = xml => [...xml.matchAll(/>([^<]*)&#10;</g)].map(m => m[1].replace(/&amp;/g, "&").replace(/&gt;/g, ">"));
const base = { no: "H1011", kind: "pickup", received: "2026-10-01 09:45", pickupDate: "2026-10-01", pickupTime: "11:00",
  items: [{ qty: 1, name: "Bowl med crunchy chicken", price: 150 }], total: 150, paid: false, payment: "Kort i kassan" };

let lines = text(eposReceipt({ ...base, name: "Queenie", phone: "46790547559", email: "queenie.nguyen.lang.adress@exempel-foretag.se" }));
assert.ok(lines.includes("KUND:"));
assert.ok(lines.includes("Queenie"));
assert.ok(lines.includes("Tel 079-054 75 59"));
assert.ok(lines.join("").includes("queenie.nguyen.lang.adress@exempel-foretag.se"));
assert.ok(lines.every(l => l.length <= W), `ingen rad längre än ${W} tecken`);
console.log("  ✓ kundblock med namn, telefon och e-post, max " + W + " tecken/rad");

lines = text(eposReceipt({ ...base, name: "Anna", phone: "0701234567" }));
assert.ok(lines.includes("Tel 070-123 45 67") && !lines.some(l => l.includes("@")));
lines = text(eposReceipt({ ...base, kind: "table", table: 5 }));
assert.ok(!lines.includes("KUND:"), "bordsbeställning utan kontakt → inget kundblock");
console.log("  ✓ utan e-post / utan kontaktuppgifter");
// Huvud: nummer + typ till vänster, dag + tid till höger. Ej betald i fetstil, betald stort.
const raw = eposReceipt({ ...base, name: "Q", phone: "0701234567" });
lines = text(raw);
const head1 = lines.find(l => l.startsWith("H1011")), head2 = lines.find(l => l.startsWith("HÄMTNING"));
assert.match(head1, /^H1011\s+(IDAG|IMORGON|[A-ZÅÄÖ]{3,4} \d{1,2}\/\d{1,2})$/);   // dagen till höger, oavsett vilken dag testet körs assert.match(head2, /^HÄMTNING\s+KL 11:00$/);
assert.equal(head1.length, W); assert.equal(head2.length, W);
assert.ok(!/dw="true"[^>]*>H1011/.test(raw), "ordernumret i normal bredd");
assert.match(raw, /em="true">EJ BETALD · KORT I KASSAN/);
assert.match(eposReceipt({ ...base, paid: true }), W >= 44 ? /dw="true" dh="true" em="true">BETALD · KORT I KASSAN/ : /dw="true" dh="true" em="true">BETALD&#10;[\s\S]*em="true">KORT I KASSAN/);
lines = text(eposReceipt({ ...base, kind: "table", table: 5 }));
assert.ok(lines.every(l => l.length <= W), "bord: max bredd");
assert.ok(lines.some(l => l.trim() === "BORD 5"));
console.log("  ✓ huvud vänster/höger, ej betald i fetstil, betald stort");


// Kort betalsätt får plats i dubbel bredd även på 58 mm
if (W <= 35) assert.match(eposReceipt({ ...base, paid: true, payment: "Swish" }), /dw="true" dh="true" em="true">BETALD · SWISH/);
// Lång rad och långa önskemål bryts inom bredden
lines = text(eposReceipt({ ...base, message: "Önskar hämta: kl 18.30\nInga sesamfrön, tack! Allergi mot jordnötter i familjen.",
  items: [{ qty: 12, name: "Sushi mix 50 bitar med extra lax och avokado", price: 1290, note: "Byt ut alla räkor mot lax, ingen wasabi" }] }));
assert.ok(lines.every(l => l.length <= W), `långa rader inom ${W}: ` + lines.filter(l => l.length > W).join(" | "));
console.log(`  ✓ [${W} tecken] huvud, betalning, långa rader`);
}
console.log("receipt.test: OK");
