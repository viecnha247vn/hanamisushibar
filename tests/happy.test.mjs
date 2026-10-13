// Happy hour för hämtning: beställ när som helst, hämta 16–17 (lib/happy.js + buildOrder i lib/routes/submit.js).
import assert from "node:assert/strict";
import settings from "../data/settings.js";
const { happySlots, pickHappySlot } = await import("../lib/happy.js");
const { buildOrder } = await import("../lib/routes/submit.js");

let n = 0; const ok = name => { n++; console.log("  ✓", name); };
console.log("Happy hour – hämtning 16–17");
const at = (date, hm) => { const [h, m] = hm.split(":").map(Number); return { date, minutes: h * 60 + m }; };
// 2026-10-12 = måndag, 2026-10-17 = lördag (öppet 12–20), 2026-10-18 = söndag (stängt)
const LEAD = 30;

let s = happySlots(at("2026-10-12", "10:00"), LEAD);
assert.deepEqual(s[0], { date: "2026-10-12", times: ["16:00", "16:15", "16:30", "16:45"] });
assert.equal(s.length, 4, "idag + 3 dagar framåt");
ok("morgon: idag 16.00–16.45 + tre dagar till");

s = happySlots(at("2026-10-12", "16:10"), LEAD);
assert.deepEqual(s[0].times, ["16:45"]);   // 16:10 + 30 = 16:40 → nästa kvart
ok("mitt i happy hour: bara tider köket hinner (16.45)");

s = happySlots(at("2026-10-12", "16:40"), LEAD);
assert.equal(s[0].date, "2026-10-13"); assert.deepEqual(s[0].times, ["16:00", "16:15", "16:30", "16:45"]);
ok("för sent idag → från imorgon");

s = happySlots(at("2026-10-17", "21:00"), LEAD);
assert.ok(!s.some(d => d.date === "2026-10-18"), "söndag är stängd");
assert.equal(s[0].date, "2026-10-19");
ok("lördag kväll: söndag (stängt) hoppas över → måndag");

assert.deepEqual(pickHappySlot("", "", at("2026-10-12", "09:00"), LEAD), { date: "2026-10-12", time: "16:00" });
assert.deepEqual(pickHappySlot("2026-10-14", "16:30", at("2026-10-12", "09:00"), LEAD), { date: "2026-10-14", time: "16:30" });
assert.equal(pickHappySlot("2026-10-12", "17:00", at("2026-10-12", "09:00"), LEAD), undefined);
assert.equal(pickHappySlot("2026-10-12", "15:45", at("2026-10-12", "09:00"), LEAD), undefined);
assert.equal(pickHappySlot("2026-10-12", "16:00", at("2026-10-12", "16:00"), LEAD), undefined);
assert.equal(pickHappySlot("2026-10-30", "16:00", at("2026-10-12", "09:00"), LEAD), undefined);
assert.equal(pickHappySlot("2026-10-18", "16:00", at("2026-10-17", "09:00"), LEAD), undefined);
ok("valideringen: rätt tid godkänns; 17.00, 15.45, passerad tid, för långt fram och stängd dag nekas");

// --- buildOrder (det /api/submit och /api/pay kör) med verklig klocka: välj en giltig tid från happySlots() ---
const base = { type: "pickup-order", name: "Anna", phone: "0701234567", payment: "online", items: [{ id: "happy-1", qty: 1 }] };
const live = happySlots();
assert.ok(live.length > 0, "inga tider de närmaste dagarna");
const last = live.at(-1), t = last.times.at(-1);
const o = buildOrder({ ...base, happyDate: last.date, happyTime: t });
assert.equal(o.pickupDate, last.date); assert.equal(o.pickupTime, t); assert.equal(o.asap, false); assert.equal(o.happy, true);
assert.match(o.whenText, new RegExp(` kl ${t}$`));
ok("buildOrder: gästens val blir hämtningstid (asap av, whenText)");

const auto = buildOrder(base);
assert.equal(auto.pickupDate, live[0].date); assert.equal(auto.pickupTime, live[0].times[0]);
ok("buildOrder utan val (gammal sida) → första lediga happy hour-tid");

assert.throws(() => buildOrder({ ...base, happyDate: last.date, happyTime: "18:00" }), /välj en ny tid/);
assert.throws(() => buildOrder({ ...base, items: [{ id: "happy-1", qty: 1 }, { id: "lunch-1", qty: 1 }] }), /Beställ dem var för sig/);
ok("buildOrder: ogiltig tid och lunch + happy hour i samma beställning nekas med tydligt besked");

const plain = buildOrder({ ...base, items: [{ id: "maki-1", qty: 1 }] });
assert.equal(plain.asap, true); assert.equal(plain.happy, undefined);
ok("utan happy hour-rätter: som förut (så snart som möjligt)");

console.log(`\n${n} tester OK  (happy hour ${settings.happyHour.from}–${settings.happyHour.to})`);
