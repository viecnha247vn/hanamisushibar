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
  order = E.call("order", { kind: "pickup", name: "Anna", phone: "+46701234567", email: "anna@exempel.se",
    pickupDate: today, pickupTime: "18:00", whenText: "idag kl 18:00",
    items: [{ id: "maki-1", qty: 1, price: 1, note: "utan avokado" }, { id: "poke-1", qty: 2 }] });
  assert.equal(order.ok, true); assert.equal(order.total, 145 + 2 * 165); assert.match(order.no, /^H\d+$/);
});
test("radnotering sparas och följer med till kök och utskrift", () => {
  const row = E.sheets["Beställningar"].data.find(r => r[1] === order.no);
  assert.ok(String(row.join(" ")).includes("utan avokado"));
  const job = E.call("printJob", { no: order.no }).job;
  assert.equal(job.items[0].note, "utan avokado");
  assert.equal(E.call("adminOrders", { date: today }).orders[0].items[0].note, "utan avokado");
});
test("gästen får bekräftelse per e-post", () => {
  const mail = E.log.mails.find(m => (m.to || "") === "anna@exempel.se");
  assert.ok(mail, "inget mejl till gästen");
  assert.match(mail.subject, new RegExp(order.no));
  assert.ok(mail.htmlBody.includes("utan avokado"), "radnoteringen saknas i mejlet");
  const sh = E.sheets["Beställningar"];
  const col = sh.data[0].indexOf("Bekräftelse");
  const row = sh.data.find(r => r[1] === order.no);
  assert.match(String(row[col] || ""), /^\d\d:\d\d$/, "Bekräftelse-kolumnen fylldes inte i");
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
  const b = E.call("booking", { date: today, time: "19:00", guests: 3, name: "Erik", phone: "+46709876543", email: "erik@exempel.se", whenText: "idag kl 19:00" });
  assert.ok(E.log.mails.some(m => (m.to || "") === "erik@exempel.se"), "gästen fick ingen bokningsbekräftelse");
  assert.equal(b.ok, true);
  E.call("adminStatus", { kind: "booking", no: b.no, status: "Bekräftad" });
  assert.match(E.log.sms.at(-1).payload.message, /Ditt bord är bokat/);
  assert.equal(E.call("adminBookings", { from: today }).bookings[0].status, "Bekräftad");
});
test("ändring av Status direkt i arket skickar sms", () => {
  const b = E.call("booking", { date: today, time: "19:30", guests: 2, name: "Sara", phone: "+46700000000", whenText: "idag kl 19:30" });
  const sh = E.sheets["Bokningar"];
  const statusCol = sh.data[0].indexOf("Status") + 1;          // kolumnen kan flytta när nya fält tillkommer
  const row = sh.data.findIndex(r => r[1] === b.no) + 1;
  sh.data[row - 1][statusCol - 1] = "Avböjd";
  E.api.handleEdit({ range: sh.getRange(row, statusCol), value: "Avböjd" });
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
test("byte i sushimix: tillägg läggs på arkets pris och valen följer med till köket", () => {
  const o = E.call("order", { kind: "table", table: "2", items: [{ id: "sushi-4", qty: 2, extra: 10, detail: "Maki: 5 California", note: "extra ingefära" }] });
  assert.equal(o.total, 2 * (205 + 10));
  const row = E.sheets["Beställningar"].data.find(r => r[1] === o.no);
  assert.match(row[10], /Maki: 5 California · extra ingefära/);
  assert.equal(E.call("order", { kind: "table", table: "2", items: [{ id: "sushi-4", qty: 1, extra: -10 }] }).status, 400);
  assert.equal(E.call("order", { kind: "table", table: "2", items: [{ id: "varmt-1", qty: 1, extra: 15, detail: "Extra gyoza × 1" }] }).total, 129 + 15);
});
test("köket kan höja förberedelsetiden och för tidiga hämtningar nekas", () => {
  assert.equal(E.call("adminSettings").leadMinutes, 0);
  E.call("adminLead", { minutes: 90 });
  assert.equal(E.call("adminSettings").leadMinutes, 90);
  assert.equal(E.call("availability").leadMinutes, 90);
  const nowMin = Number(E.ctx.Utilities.formatDate(new Date(), "Europe/Stockholm", "HH")) * 60 +
                 Number(E.ctx.Utilities.formatDate(new Date(), "Europe/Stockholm", "mm"));
  const soon = pad2(Math.floor(((nowMin + 20) % 1440) / 60)) + ":" + pad2((nowMin + 20) % 60);
  const r = E.call("order", { kind: "pickup", name: "Anna", phone: "+46701234567", pickupDate: today, pickupTime: soon,
    whenText: "idag", items: [{ id: "maki-1", qty: 1 }] });
  assert.equal(r.status, 400);
  assert.match(r.error, /90 minuter/);
  assert.equal(E.call("adminLead", { minutes: 2 }).status, 400);
  E.call("adminLead", { minutes: 15 });
});
test("menyändringar från koden förs in i arket en gång", () => {
  const r = E.call("applyMenuPatches", { patches: [{ id: "test-1",
    set: { "barn-1": { name: "Testsushi" } }, hide: ["bubble-3"], notes: { bubble: "Ny text" },
    add: [{ after: "tillbehor-10", id: "tillbehor-99", name: "Testrätt", price: 33 }] }] });
  assert.deepEqual(r.applied, ["test-1"]);
  const menu = E.call("menu").menu, items = menu.flatMap(c => c.items);
  assert.equal(items.find(i => i.id === "barn-1").name, "Testsushi");
  assert.equal(items.find(i => i.id === "tillbehor-99").price, 33);
  assert.equal(menu.find(c => c.id === "tillbehor").items.findIndex(i => i.id === "tillbehor-99"),
               menu.find(c => c.id === "tillbehor").items.findIndex(i => i.id === "tillbehor-10") + 1);
  assert.ok(!items.find(i => i.id === "bubble-3"));
  assert.equal(menu.find(c => c.id === "bubble").note, "Ny text");
  assert.deepEqual(E.call("applyMenuPatches", { patches: [{ id: "test-1", set: { "barn-1": { name: "Igen" } } }] }).applied, []);
});
function pad2(n) { return String(n).padStart(2, "0"); }
test("betald-markering sparas och följer med till kvittot", () => {
  const o = E.call("order", { kind: "table", table: "5", items: [{ id: "maki-1", qty: 1 }] });
  assert.equal(E.call("printJob", { no: o.no }).job.paid, false);
  E.call("adminPaid", { no: o.no, paid: true });
  assert.equal(E.call("printJob", { no: o.no }).job.paid, true);
  assert.equal(E.call("adminOrders", { date: today }).orders.find(x => x.no === o.no).paid, true);
  E.call("adminPaid", { no: o.no, paid: false });
  assert.equal(E.call("printJob", { no: o.no }).job.paid, false);
  assert.equal(E.call("adminPaid", { no: "H0", paid: true }).status, 404);
});
test("dricks läggs på summan och syns på kvittot", () => {
  const o = E.call("order", { kind: "table", table: "7", tip: 20, items: [{ id: "maki-1", qty: 1 }] });
  assert.equal(o.total, 145 + 20);
  assert.equal(E.call("printJob", { no: o.no }).job.tip, 20);
  const row = E.sheets["Beställningar"].data.find(r => r[1] === o.no);
  assert.equal(Number(row[11]), 20);
  assert.equal(E.call("order", { kind: "table", table: "7", tip: 5000, items: [{ id: "maki-1", qty: 1 }] }).status, 400);
  assert.equal(E.call("order", { kind: "table", table: "7", tip: -5, items: [{ id: "maki-1", qty: 1 }] }).status, 400);
});
console.log(`\n${passed} tester OK`);
