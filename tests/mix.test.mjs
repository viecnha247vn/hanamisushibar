// Regler för byten i sushimixar: node tests/mix.test.mjs
import assert from "assert";
import { mixPrice } from "../lib/mix.js";
let passed = 0; const test = (n, f) => { f(); passed++; console.log("  ✓ " + n); };
console.log("Sushimix");
test("utan val blir det vanligt pris", () => assert.deepEqual(mixPrice("sushi-3", null), { extra: 0, swaps: 0, detail: "" }));
test("byte av maki är gratis", () => {
  const r = mixPrice("sushi-9", { maki: ["California"] });
  assert.equal(r.extra, 0); assert.equal(r.detail, "Maki: 5 California");
});
test("4 nigiribyten ingår", () => {
  const r = mixPrice("sushi-4", { maki: [""], nigiri: { tonfisk: 5, avokado: 2, krabbstick: 2, lax: 1 } });
  assert.equal(r.swaps, 4); assert.equal(r.extra, 0);
});
test("femte bytet kostar 10 kr, sjätte 20 kr", () => {
  assert.equal(mixPrice("sushi-4", { nigiri: { tonfisk: 6, avokado: 2, krabbstick: 2 } }).extra, 10);
  assert.equal(mixPrice("sushi-4", { nigiri: { tonfisk: 7, avokado: 1, krabbstick: 2 } }).extra, 20);
});
test("köksraden visar valen", () => {
  assert.equal(mixPrice("sushi-3", { maki: ["Philadelphia maki"], nigiri: { lax: 5, "jätteräka": 2 } }).detail,
    "Maki: 5 Philadelphia maki · Nigiri: 5 lax, 2 jätteräkor");
});
test("fel antal eller okända val nekas", () => {
  assert.throws(() => mixPrice("sushi-3", { nigiri: { lax: 8 } }), /exakt 7/);
  assert.throws(() => mixPrice("sushi-3", { maki: ["Dragon"] }), /maki/);
  assert.throws(() => mixPrice("sushi-3", { maki: ["", ""] }), /maki/);
  assert.throws(() => mixPrice("sushi-3", { nigiri: { hummer: 7 } }), /nigiri/);
  assert.throws(() => mixPrice("happy-1", { maki: [""] }), /kan inte ändras/);
});
test("stora mixar: nigiri kan bytas men inte makin", () => {
  assert.equal(mixPrice("sushi-8", { maki: [], nigiri: { lax: 13, "jätteräka": 4, krabbstick: 2, tonfisk: 1 } }).extra, 0);
  assert.equal(mixPrice("sushi-6", { nigiri: { lax: 3, "jätteräka": 2, krabbstick: 2, tonfisk: 3 } }).swaps, 2);
  assert.throws(() => mixPrice("sushi-5", { maki: ["California", ""] }), /kockens val/);
});
test("vegan mix: bara vegetariska bitar", () => {
  assert.equal(mixPrice("sushi-10", { nigiri: { gurka: 4, avokado: 1, tofu: 1 } }).extra, 0);
  assert.equal(mixPrice("sushi-10", { nigiri: { gurka: 5, wakame: 1 } }).extra, 20);
  assert.throws(() => mixPrice("sushi-10", { nigiri: { lax: 6 } }), /nigiri/);
  assert.throws(() => mixPrice("sushi-3", { nigiri: { gurka: 7 } }), /nigiri/);
});
test("nigirimix: gästen väljer alla bitar utan tillägg", () => {
  const r = mixPrice("nigiri-3", { nigiri: { lax: 4, tonfisk: 3, "flamberad lax": 3 } });
  assert.equal(r.extra, 0); assert.equal(r.detail, "Nigiri: 4 lax, 3 tonfisk, 3 flamberad lax");
  assert.equal(mixPrice("nigiri-4", { nigiri: { lax: 12 } }).extra, 0);
  assert.throws(() => mixPrice("nigiri-3", { nigiri: { lax: 9 } }), /exakt 10/);
});
console.log(`${passed} tester OK`);
