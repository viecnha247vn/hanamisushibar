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
assert.equal(S(at("2026-10-08", "09:10")), "2026-10-08 11:30");            // före öppning: idag
assert.equal(S(at("2026-10-08", "19:40")), "2026-10-09 11:30 senare");     // köket hinner inte → imorgon
assert.equal(S(at("2026-10-08", "20:00")), "2026-10-09 11:30 senare");     // vid stängning
assert.equal(S(at("2026-10-08", "23:55")), "2026-10-09 11:30 senare");     // natt
assert.equal(S(at("2026-10-09", "02:00")), "2026-10-09 11:30");            // efter midnatt: samma dag
assert.equal(S(at("2026-10-10", "21:00")), "2026-10-12 11:30 senare");     // lör kväll → sön stängt → mån
assert.equal(S(at("2026-10-11", "13:00")), "2026-10-12 11:30 senare");     // söndag stängt
assert.equal(S(at("2026-10-09", "22:00")), "2026-10-10 12:30 senare");     // fre kväll → lör öppnar 12
assert.equal(S(at("2026-12-23", "21:00")), "2026-12-25 11:30 senare");     // stängd dag hoppas över
assert.equal(S(at("2026-10-08", "22:00"), 60), "2026-10-09 12:00 senare"); // köket har 1 h
console.log("pickup.test: OK");
