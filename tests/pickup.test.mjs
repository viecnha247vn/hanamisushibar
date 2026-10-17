// Testar hämtningstid dygnet runt (lib/pickup.js): idag när det är öppet, annars nästa öppna dag.
import assert from "node:assert/strict";
const settings = (await import("../data/settings.js")).default;
const { pickupSlot } = await import("../lib/pickup.js");
settings.hours = { 0: null, 1: [11, 20], 2: [11, 20], 3: [11, 20], 4: [11, 20], 5: [11, 20], 6: [12, 20] };
settings.closedDates = ["2026-12-24"];
const at = (date, hm) => ({ date, minutes: Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3)) });
const hm = m => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const S = (now, lead = 30) => { const s = pickupSlot(now, lead); return `${s.date} ${hm(s.minutes)}${s.later ? " senare" : ""}`; };

assert.equal(S(at("2026-10-08", "14:02")), "2026-10-08 14:35");            // tors, öppet
assert.equal(S(at("2026-10-08", "09:10")), "2026-10-08 11:00");            // före öppning: klar kl öppning
assert.equal(S(at("2026-10-08", "10:50")), "2026-10-08 11:20");            // strax före öppning: nu + förberedelsetid
assert.equal(S(at("2026-10-08", "10:50"), 15), "2026-10-08 11:05");
assert.equal(S(at("2026-10-08", "19:40")), "2026-10-08 20:10");            // sent: får bli efter stängning
assert.equal(S(at("2026-10-08", "20:00"), 15), "2026-10-08 20:15");        // beställt vid stängning → 20.15
assert.equal(S(at("2026-10-08", "20:01")), "2026-10-09 11:00 senare");     // efter stängning → imorgon kl öppning
assert.equal(S(at("2026-10-08", "23:55")), "2026-10-09 11:00 senare");     // natt
assert.equal(S(at("2026-10-09", "02:00")), "2026-10-09 11:00");            // efter midnatt: samma dag kl öppning
assert.equal(S(at("2026-10-10", "21:00")), "2026-10-12 11:00 senare");     // lör kväll → sön stängt → mån
assert.equal(S(at("2026-10-11", "13:00")), "2026-10-12 11:00 senare");     // söndag stängt
assert.equal(S(at("2026-10-09", "22:00")), "2026-10-10 12:00 senare");     // fre kväll → lör öppnar 12
assert.equal(S(at("2026-12-23", "21:00")), "2026-12-25 11:00 senare");     // stängd dag hoppas över
assert.equal(S(at("2026-10-08", "22:00"), 60), "2026-10-09 11:00 senare"); // nästa dag alltid kl öppning
console.log("pickup.test: OK");

// "Hämta senare": dag + tid i kassan
const { laterSlots, pickLaterSlot } = await import("../lib/pickup.js");
settings.pickupDaysAhead = 3;
let ls = laterSlots(at("2026-10-08", "14:02"), 30);                       // tors
assert.deepEqual(ls.map(d => d.date), ["2026-10-08", "2026-10-09", "2026-10-10"]);  // sön stängt, 3 dagar fram
assert.equal(ls[0].min, 14 * 60 + 32); assert.equal(ls[0].max, 20 * 60);
assert.equal(ls[1].min, 11 * 60); assert.equal(ls[2].min, 12 * 60);                 // lör öppnar 12
assert.equal(laterSlots(at("2026-10-08", "20:05"), 30)[0].date, "2026-10-09");      // efter stängning: idag finns inte
assert.deepEqual(pickLaterSlot("2026-10-09", "12:30", at("2026-10-08", "21:00")), { date: "2026-10-09", time: "12:30" });
assert.deepEqual(pickLaterSlot("2026-10-09", "12:20", at("2026-10-08", "21:00")), { date: "2026-10-09", time: "12:20" }); // valfri tid
assert.deepEqual(pickLaterSlot("2026-10-08", "15:40", at("2026-10-08", "15:06")), { date: "2026-10-08", time: "15:40" });
assert.equal(pickLaterSlot("2026-10-11", "12:00", at("2026-10-08", "21:00")), null);  // söndag stängt
assert.equal(pickLaterSlot("2026-10-08", "14:00", at("2026-10-08", "14:20")), null);  // passerad tid
assert.equal(pickLaterSlot("2026-10-09", "20:15", at("2026-10-08", "21:00")), null);  // efter stängning
assert.equal(pickLaterSlot("2026-10-09", "10:45", at("2026-10-08", "21:00")), null);  // före öppning
assert.equal(pickLaterSlot("2026-10-09", "12:3", at("2026-10-08", "21:00")), null);   // fel format
console.log("pickup.test (hämta senare): OK");

// buildOrder: vald senare dag → whenText och datum följer valet (inte "idag")
{
  const { buildOrder } = await import("../lib/routes/submit.js");
  const { nowLocal } = await import("../lib/util.js");
  settings.hours = { 0: [11, 20], 1: [11, 20], 2: [11, 20], 3: [11, 20], 4: [11, 20], 5: [11, 20], 6: [11, 20] }; settings.closedDates = [];
  const day = laterSlots(nowLocal(), 0).find(d => d.date !== nowLocal().date);
  const o = buildOrder({ type: "pickup-order", name: "Bo", phone: "0701234567", items: [{ id: "maki-1", qty: 1 }], laterDate: day.date, laterTime: "12:30" });
  assert.equal(o.asap, false); assert.equal(o.pickupDate, day.date); assert.equal(o.pickupTime, "12:30");
  assert.match(o.whenText, /^(imorgon|[a-zåäö]+ \d+\/\d+) kl 12:30$/);
  assert.throws(() => buildOrder({ type: "pickup-order", name: "Bo", phone: "0701234567", items: [{ id: "maki-1", qty: 1 }], laterDate: day.date, laterTime: "21:00" }), /går inte längre/);
  console.log("pickup.test (buildOrder senare dag): OK");
}
