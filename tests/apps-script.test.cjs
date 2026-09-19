// Testar Apps Script-koden mot en simulerad Google Sheet: node tests/apps-script.test.cjs
const assert = require("assert");
const { makeEnv } = require("./gas-mock.cjs");

let passed = 0;
function test(name, fn) { fn(); passed++; console.log("  ✓ " + name); }

const E = makeEnv();
E.api.setup();
Object.assign(E.props, { NOTIFY_EMAIL: "kok@test.se", ELKS_USER: "u", ELKS_PASSWORD: "p", VERCEL_DEPLOY_HOOK: "https://api.vercel.com/hook" });
const today = E.ctx.Utilities.formatDate(new Date(), "Europe/Stockholm", "yyyy-MM-dd");

console.log("Apps Script");
test("setup skapar flikar, triggers och nyckel", () => {
  assert.deepEqual(Object.keys(E.sheets).sort(), ["Beställningar", "Bokningar", "Logg", "Meny"]);
  assert.deepEqual(E.log.triggers, ["handleEdit", "resetSoldOut"]);
  assert.ok(E.props.API_SECRET.length > 30);
});
test("setup kan köras igen utan att dubblera menyn", () => {
  const n = E.sheets["Meny"].getLastRow(); E.api.setup(); assert.equal(E.sheets["Meny"].getLastRow(), n);
});
test("fel nyckel nekas", () => assert.equal(E.call("health", {}, "fel").status, 401));
test("menyn läses från arket", () => {
  const m = E.call("menu").menu;
  assert.ok(m.length > 10 && m[0].items.length > 0);
});
let order;
test("beställning räknar pris från arket, inte från webbläsaren", () => {
  order = E.call("order", { kind: "pickup", name: "Anna", phone: "+46701234567", pickupDate: today, pickupTime: "18:00", whenText: "idag kl 18:00",
    items: [{ id: "maki-1", qty: 1, price: 1 }, { id: "poke-1", qty: 2 }] });
  assert.equal(order.ok, true); assert.equal(order.total, 145 + 2 * 165); assert.match(order.no, /^H\d+$/);
});
test("okänd rätt och 0-kronorsrätt nekas", () => {
  assert.equal(E.call("order", { kind: "table", table: "1", items: [{ id: "finns-inte", qty: 1 }] }).status, 400);
  assert.equal(E.call("order", { kind: "table", table: "1", items: [{ id: "tillbehor-21", qty: 1 }] }).status, 400);
});
test("slut idag stoppar beställning och syns i availability", () => {
  E.call("adminSoldOut", { id: "maki-2", soldOut: true });
  assert.equal(E.call("availability").items["maki-2"].available, false);
  assert.equal(E.call("order", { kind: "table", table: "1", items: [{ id: "maki-2", qty: 1 }] }).status, 409);
  E.api.resetSoldOut();
  assert.equal(E.call("availability").items["maki-2"].available, true);
});
test("köksvyn listar dagens beställningar", () => {
  const list = E.call("adminOrders", { date: today }).orders;
  assert.equal(list[0].no, order.no); assert.equal(list[0].items.length, 2);
});
test("status Klar skickar sms en gång", () => {
  const before = E.log.sms.length;
  E.call("adminStatus", { kind: "order", no: order.no, status: "Klar" });
  E.call("adminStatus", { kind: "order", no: order.no, status: "Klar" });
  assert.equal(E.log.sms.length, before + 1);
  assert.match(E.log.sms.at(-1).payload.message, /klar att hämtas/);
});
test("bokning + bekräftelse via köksvyn", () => {
  const b = E.call("booking", { date: today, time: "19:00", guests: 3, name: "Erik", phone: "+46709876543", whenText: "idag kl 19:00" });
  assert.equal(b.ok, true);
  E.call("adminStatus", { kind: "booking", no: b.no, status: "Bekräftad" });
  assert.match(E.log.sms.at(-1).payload.message, /Ditt bord är bokat/);
  assert.equal(E.call("adminBookings", { from: today }).bookings[0].status, "Bekräftad");
});
test("ändring av Status direkt i arket skickar sms", () => {
  const b = E.call("booking", { date: today, time: "19:30", guests: 2, name: "Sara", phone: "+46700000000", whenText: "idag kl 19:30" });
  const sh = E.sheets["Bokningar"]; const row = sh.data.findIndex(r => r[1] === b.no) + 1;
  sh.data[row - 1][8] = "Avböjd";
  E.api.handleEdit({ range: sh.getRange(row, 9), value: "Avböjd" });
  assert.match(E.log.sms.at(-1).payload.message, /fullbokat/);
});
test("dold rätt försvinner från menyn direkt efter redigering", () => {
  const sh = E.sheets["Meny"]; const row = sh.data.findIndex(r => r[3] === "lunch-1") + 1;
  sh.data[row - 1][7] = false; E.api.handleEdit({ range: sh.getRange(row, 8), value: false });
  assert.equal(E.call("menu").menu[0].items.some(i => i.id === "lunch-1"), false);
});
test("skrivarkö: nya beställningar hämtas, markeras utskrivna och kan skrivas ut igen", () => {
  const q1 = E.call("printQueue").jobs;
  assert.ok(q1.some(j => j.no === order.no) && q1[0].items.length > 0);
  E.call("printDone", { no: order.no });
  assert.ok(!E.call("printQueue").jobs.some(j => j.no === order.no));
  assert.match(E.call("adminOrders", { date: today }).orders.find(o => o.no === order.no).printed, /^\d\d:\d\d$/);
  const job = E.call("printJob", { no: order.no }).job;
  assert.equal(job.no, order.no); assert.equal(job.total, order.total); assert.equal(job.items[0].name, "California");
  E.call("printAgain", { no: order.no });
  assert.ok(E.call("printQueue").jobs.some(j => j.no === order.no));
  E.call("printDone", { no: order.no });
});
test("publicera anropar Vercel deploy hook", () => {
  E.api.publishSite(); assert.equal(E.log.hooks.at(-1).url, "https://api.vercel.com/hook");
});
test("inga fel i loggen", () => assert.deepEqual(E.sheets["Logg"].data.slice(1).filter(r => r[1] === "ERROR"), []));
console.log(`\n${passed} tester OK`);
