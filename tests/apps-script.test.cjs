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
  assert.deepEqual(Object.keys(E.sheets).sort(), ["Beställningar", "Betalningar", "Bokningar", "Logg", "Meny"]);
  assert.deepEqual(E.log.triggers, ["handleEdit", "resetSoldOut", "nightlyCleanup"]);
  assert.equal(E.props.CLEANUP_ENABLED, "off");
  assert.ok(E.props.API_SECRET.length > 30);
});
test("setupCheck rapporterar utan att ändra", () => {
  const n = E.log.alerts.length; E.api.setupCheck();
  assert.match(E.log.alerts[n], /Beställningar: \d+ rader/); assert.match(E.log.alerts[n], /Triggers: /);   // mocken har inga riktiga triggers
});
test("loggen kapas i ett anrop när den blir stor", () => {
  const sh = E.sheets["Logg"]; for (let i = 0; i < 3100; i++) sh.appendRow(["2026-01-01 00:00:00", "INFO", "x", ""]);
  E.ctx.log_("INFO", "test", "efter kapning");
  assert.ok(sh.getLastRow() - 1 <= 1001, "max ~1000 rader kvar: " + (sh.getLastRow() - 1));
  assert.equal(sh.data[sh.getLastRow() - 1][2], "test");
  sh.deleteRows(2, sh.getLastRow() - 1);                   // städa efter testet
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
test("hämtning asap: tiden räknas av Apps Script från köksvyns förberedelsetid", () => {
  const nowMin = Number(E.ctx.Utilities.formatDate(new Date(), "Europe/Stockholm", "HH")) * 60 +
                 Number(E.ctx.Utilities.formatDate(new Date(), "Europe/Stockholm", "mm"));
  const hhmm = m => pad2(Math.floor(m / 60)) + ":" + pad2(m % 60);
  const base = { kind: "pickup", name: "Anna", phone: "+46701234567", asap: true, defaultLead: 30,
    pickupDate: today, pickupTime: "00:00", whenText: "x", items: [{ id: "maki-1", qty: 1 }] };
  if (nowMin > 1380) return;                                    // testet körs inte runt midnatt
  E.call("adminLead", { minutes: 45 });
  let r = E.call("order", { ...base, openFrom: 0, closeAt: 1440 });
  const want = hhmm(Math.ceil((nowMin + 45) / 5) * 5);
  assert.equal(r.pickupTime, want); assert.equal(r.whenText, "idag kl " + want);
  const row = E.sheets["Beställningar"].data.find(x => x[1] === r.no);
  assert.ok(row.includes(want), "arket får den räknade tiden, inte klientens");
  // före öppning: räknas från öppningstiden
  const open = Math.min(nowMin + 60, 1300);
  r = E.call("order", { ...base, openFrom: open, closeAt: 1440 });
  assert.equal(r.pickupTime, hhmm(Math.ceil((Math.max(nowMin, open) + 45) / 5) * 5));
  // köket hinner inte före stängning
  r = E.call("order", { ...base, openFrom: 0, closeAt: nowMin + 20 });
  assert.equal(r.status, 400); assert.match(r.error, /hinner tyvärr inte/);
  // stängt
  r = E.call("order", { ...base, openFrom: 0, closeAt: Math.max(1, nowMin) });
  assert.equal(r.status, 400);
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
  E.call("applyMenuPatches", { patches: [{ id: "test-2", cats: { sushi: { name: "Sushi mix" } } }] });
  assert.equal(E.call("menu").menu.find(c => c.id === "sushi").name, "Sushi mix");
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

/* ---------- onlinebeställning på/av ---------- */
test("köket kan stänga onlinebeställning: servern nekar, menyn syns, bokning fungerar", () => {
  assert.equal(E.call("availability").ordering.open, true);
  const r1 = E.call("adminOrdering", { open: false, message: "Stängt för Swish-byte, ring oss!" });
  assert.equal(r1.open, false); assert.equal(r1.message, "Stängt för Swish-byte, ring oss!");
  assert.equal(E.call("availability").ordering.open, false);
  assert.equal(E.call("adminSettings").ordering.message, "Stängt för Swish-byte, ring oss!");
  const o = E.call("order", { kind: "table", table: "1", items: [{ id: "maki-1", qty: 1 }] });
  assert.equal(o.status, 423); assert.match(o.error, /Swish-byte/);
  const b = E.call("booking", { date: today, time: "19:00", guests: 2, name: "Anna", phone: "+46701234567", whenText: "idag kl 19:00" });
  assert.equal(b.ok, true, "bordsbokning påverkas inte");
  assert.equal(E.call("health").ordering, "closed");
  E.api.testOrder();                                        // intern testbeställning går igenom ändå
  const r2 = E.call("adminOrdering", { open: true });
  assert.equal(r2.open, true); assert.match(r2.message, /tillfälligt stängd/);   // standardtext tillbaka
  assert.equal(E.call("order", { kind: "table", table: "1", items: [{ id: "maki-1", qty: 1 }] }).ok, true);
});

/* ---------- städning ---------- */
console.log("Städning");
const fmt = (d) => E.ctx.Utilities.formatDate(d, "Europe/Stockholm", "yyyy-MM-dd");
const ago = n => fmt(new Date(Date.now() - n * 864e5)) + " 12:00";
const ahead = n => fmt(new Date(Date.now() + n * 864e5));
function seedOrder(no, received, status, extra) {
  const sh = E.sheets["Beställningar"], head = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  const o = Object.assign({ "Mottagen": received, "Ordernr": no, "Typ": "Hämtning", "Hämtas datum": received.slice(0, 10), "Hämtas tid": "18:00",
    "Namn": "Kalle Kund", "Telefon": "+46701234567", "E-post": "kalle@test.se", "Betalning": "Swish",
    "Beställning": "1 × Maki\n     ↳ utan avokado", "Summa": 145, "Kommentar": "allergisk mot nötter", "Status": status,
    "Rader (data)": JSON.stringify([{ id: "maki-1", qty: 1, note: "utan avokado" }]) }, extra || {});
  sh.appendRow(head.map(h => (o[h] === undefined ? "" : o[h])));
}
function seedBooking(no, received, date, status) {
  const sh = E.sheets["Bokningar"], head = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  const o = { "Mottagen": received, "Boknr": no, "Datum": date, "Tid": "18:00", "Gäster": 2, "Namn": "Bokare", "Telefon": "+46701234567", "Status": status };
  sh.appendRow(head.map(h => (o[h] === undefined ? "" : o[h])));
}
const ordersBefore = E.sheets["Beställningar"].getLastRow() - 1;
seedOrder("H1", ago(45), "Hämtad");                       // gammal, klar → arkiveras
seedOrder("H2", ago(45), "Avbokad");                      // gammal, avbokad → raderas
seedOrder("H3", ago(3), "Avbokad");                       // nyligen avbokad → kvar
seedOrder("H4", ago(10), "Hämtad");                       // nyligen → kvar
seedOrder("H5", ago(45), "Ny", { "Hämtas datum": ahead(2) }); // beställd för länge sen men hämtas om 2 dagar → kvar
seedBooking("B1", ago(60), fmt(new Date(Date.now() - 50 * 864e5)), "Bekräftad"); // gammal → arkiveras
seedBooking("B2", ago(60), ahead(20), "Bekräftad");       // bokad för länge sen, besöket är om 20 dagar → kvar
E.sheets["Logg"].appendRow([ago(20).replace(" 12:00", " 03:00:00"), "INFO", "Gammal", "x"]);
const logBefore = E.sheets["Logg"].getLastRow() - 1;

test("provkörning räknar men ändrar inget", () => {
  const r = E.api.runCleanup_(true);
  assert.deepEqual([r.archivedOrders, r.archivedBookings, r.purgedCancelled, r.purgedLog], [1, 1, 1, 1]);
  assert.equal(E.sheets["Beställningar"].getLastRow() - 1, ordersBefore + 5);
  assert.equal(Object.keys(E.files).length, 1, "inget arkivark skapas vid provkörning");
  E.api.nightlyCleanup();                                   // CLEANUP_ENABLED=off → fortfarande bara provkörning
  assert.equal(E.sheets["Beställningar"].getLastRow() - 1, ordersBefore + 5);
});
test("städning på riktigt: arkiverar först, raderar sen, rör inte kommande", () => {
  E.api.cleanupEnable();
  E.api.nightlyCleanup();
  const left = E.sheets["Beställningar"].data.slice(1).map(r => r[1]);
  assert.ok(!left.includes("H1") && !left.includes("H2"), "H1 arkiverad, H2 raderad");
  assert.ok(left.includes("H3") && left.includes("H4") && left.includes("H5"), "nyligen avbokad, ny och kommande hämtning kvar");
  const bl = E.sheets["Bokningar"].data.slice(1).map(r => r[1]);
  assert.ok(!bl.includes("B1") && bl.includes("B2"));
  assert.equal(E.sheets["Logg"].data.slice(1).filter(r => r[2] === "Gammal").length, 0, "gammal loggrad borta");
  const arch = E.files[E.props.ARCHIVE_ID];
  assert.ok(arch, "arkivark skapat och id sparat");
  const a = arch.getSheetByName("Beställningar"), head = a.data[0];
  assert.ok(head.includes("Arkiverad") && head.includes("Anonymiserad"));
  const row = a.data.find(r => r[1] === "H1");
  assert.ok(row && row[head.indexOf("Namn")] === "Kalle Kund" && row[head.indexOf("Arkiverad")], "H1 i arkivet med uppgifter kvar (< 12 mån)");
  assert.ok(arch.getSheetByName("Bokningar").data.some(r => r[1] === "B1"));
  assert.ok(E.sheets["Logg"].data.some(r => r[2] === "Städning" && /Arkiverat: 1 beställningar, 1 bokningar/.test(r[3])));
});
test("avidentifiering i arkivet efter 12 månader – belopp och rätter kvar", () => {
  const arch = E.files[E.props.ARCHIVE_ID], a = arch.getSheetByName("Beställningar"), head = a.data[0];
  const row = head.map(h => ({ "Mottagen": ago(400), "Ordernr": "H0", "Hämtas datum": ago(400).slice(0, 10), "Namn": "Gammal Gäst", "Telefon": "+46700000000",
    "E-post": "g@test.se", "Beställning": "2 × Poke\n     ↳ extra chili", "Summa": 330, "Kommentar": "nötallergi", "Status": "Hämtad",
    "Rader (data)": JSON.stringify([{ id: "poke-1", qty: 2, note: "extra chili" }]), "Arkiverad": "2025-01-01 04:30" })[h] ?? "");
  a.appendRow(row);
  E.api.nightlyCleanup();
  const r = a.data.find(x => x[1] === "H0"), g = k => r[head.indexOf(k)];
  assert.equal(g("Namn"), "Gäst"); assert.equal(g("Telefon"), ""); assert.equal(g("E-post"), ""); assert.equal(g("Kommentar"), "");
  assert.equal(g("Beställning"), "2 × Poke"); assert.equal(JSON.parse(g("Rader (data)"))[0].note, "");
  assert.equal(g("Summa"), 330); assert.ok(g("Anonymiserad"));
  const h1 = a.data.find(x => x[1] === "H1");
  assert.equal(h1[head.indexOf("Namn")], "Kalle Kund", "nyare arkivrad rörs inte");
});
test("städningen stör inte beställningar och köksvy", () => {
  const r = E.call("order", { kind: "table", table: "3", items: [{ id: "maki-1", qty: 1 }] });
  assert.equal(r.ok, true);
  assert.ok(E.call("adminOrders", { date: today }).orders.some(o => o.no === r.no));
  assert.equal(E.call("health").cleanup, "on");
  assert.ok(E.call("health").rows.orders > 0);
  E.api.cleanupDisable();
  assert.equal(E.call("health").cleanup, "dry-run");
});

/* ---------------- onlinebetalning (Pay.js) ---------------- */
console.log("Onlinebetalning");
let pend;
test("payPending prissätter mot arket och skapar ingen order", () => {
  const before = E.sheets["Beställningar"].getLastRow();
  pend = E.call("payPending", { order: { kind: "pickup", name: "Bo", phone: "+46701112233", email: "bo@exempel.se", asap: true,
    openFrom: 11 * 60, closeAt: 20 * 60, defaultLead: 30, tip: 10, payment: "online", items: [{ id: "maki-1", qty: 2 }] } });
  assert.equal(pend.ok, true); assert.match(pend.ref, /^P[A-Z0-9]{12}$/);
  assert.equal(pend.total, 2 * 145 + 10); assert.equal(pend.lines[0].price, 145);
  assert.equal(E.sheets["Beställningar"].getLastRow(), before, "en order skapades före betalning");
  assert.equal(E.call("paySession", { ref: pend.ref, sessionId: "cs_test_1" }).ok, true);
});
test("payConfirm med fel belopp nekas (409) och skapar ingen order", () => {
  const r = E.call("payConfirm", { ref: pend.ref, sessionId: "cs_test_1", paymentIntent: "pi_1", method: "card", amount: 100 });
  assert.equal(r.status, 409);
  assert.equal(E.call("payStatus", { ref: pend.ref, sessionId: "cs_test_1" }).status, "väntar");
});
test("payConfirm skapar betald order, skriver ut, mejlar och sms:ar", () => {
  const mails = E.log.mails.length, sms = E.log.sms.length;
  const r = E.call("payConfirm", { ref: pend.ref, sessionId: "cs_test_1", paymentIntent: "pi_1", method: "swish", amount: pend.total * 100 });
  assert.equal(r.ok, true); assert.match(r.no, /^H\d+$/); assert.equal(r.total, pend.total);
  const sh = E.sheets["Beställningar"], head = sh.data[0], row = sh.data.find(x => x[head.indexOf("Ordernr")] === r.no);
  assert.equal(row[head.indexOf("Betalning")], "Online Swish");
  assert.match(String(row[head.indexOf("Betald")]), /^\d\d:\d\d$/, "Betald-kolumnen tom");
  assert.equal(row[head.indexOf("Stripe")], "pi_1");
  assert.ok(E.call("printQueue").jobs.some(j => j.no === r.no && j.paid === true), "saknas i utskriftskön eller ej markerad betald");
  assert.ok(E.log.mails.length > mails && E.log.sms.length > sms, "mejl/sms skickades inte");
  assert.ok(E.log.mails.at(-1).htmlBody.includes("Betald online"), "mejlet säger inte betald online");
  const st = E.call("payStatus", { ref: pend.ref, sessionId: "cs_test_1" });
  assert.equal(st.status, "betald"); assert.equal(st.no, r.no); assert.equal(st.method, "Swish");
});
test("payConfirm är idempotent – samma ref ger samma ordernummer, ingen ny order", () => {
  const before = E.sheets["Beställningar"].getLastRow();
  const r = E.call("payConfirm", { ref: pend.ref, sessionId: "cs_test_1", paymentIntent: "pi_1", method: "swish", amount: pend.total * 100 });
  assert.equal(r.already, true); assert.equal(E.sheets["Beställningar"].getLastRow(), before);
});
test("payStatus kräver rätt session-id", () => {
  assert.equal(E.call("payStatus", { ref: pend.ref, sessionId: "cs_fel" }).status, 404);
});
test("payFail markerar men skapar ingen order", () => {
  const p2 = E.call("payPending", { order: { kind: "table", table: "4", items: [{ id: "poke-1", qty: 1 }] } });
  E.call("paySession", { ref: p2.ref, sessionId: "cs_test_2" });
  const before = E.sheets["Beställningar"].getLastRow();
  assert.equal(E.call("payFail", { ref: p2.ref, status: "expired" }).ok, true);
  assert.equal(E.call("payStatus", { ref: p2.ref, sessionId: "cs_test_2" }).status, "utgången");
  assert.equal(E.sheets["Beställningar"].getLastRow(), before);
});
test("stängd onlinebeställning stoppar ny betalning men inte en redan betald", () => {
  // Betalning startad medan öppet …
  const p3 = E.call("payPending", { order: { kind: "table", table: "6", items: [{ id: "poke-1", qty: 1 }] } });
  E.call("paySession", { ref: p3.ref, sessionId: "cs_test_3" });
  E.call("adminOrdering", { open: false });
  // … ny betalning nekas med 423 (inga pengar tas)
  const blocked = E.call("payPending", { order: { kind: "table", table: "6", items: [{ id: "poke-1", qty: 1 }] } });
  assert.equal(blocked.status, 423);
  // … men den som redan betalat får sin order (pengarna är tagna)
  const ok = E.call("payConfirm", { ref: p3.ref, sessionId: "cs_test_3", paymentIntent: "pi_3", method: "card", amount: Math.round(p3.total * 100) });
  assert.match(ok.no, /^H\d+$/);
  E.call("adminOrdering", { open: true });
});

console.log("\n" + passed + " tester OK");
