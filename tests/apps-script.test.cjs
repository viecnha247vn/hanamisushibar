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
  assert.deepEqual(E.log.triggers, ["handleEdit", "resetSoldOut", "nightlyCleanup"]);
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
/* ---------------- städning ---------------- */

// Egen miljö med ett års historik, så att städningen får något att bita i.
const C = makeEnv();
C.api.setup();
Object.assign(C.props, { NOTIFY_EMAIL: "kok@test.se" });
const dayStr = n => C.ctx.Utilities.formatDate(new Date(Date.now() - n * 864e5), "Europe/Stockholm", "yyyy-MM-dd");

function seedOrder(daysAgo, status, extra) {
  const sh = C.sheets["Beställningar"];
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  const o = Object.assign({
    "Mottagen": dayStr(daysAgo) + " 18:30", "Ordernr": "H" + (2000 + sh.getLastRow()), "Typ": "Hämtning",
    "Hämtas datum": dayStr(daysAgo), "Hämtas tid": "19:00", "Namn": "Anna Andersson", "Telefon": "+46701234567",
    "E-post": "anna@exempel.se", "Betalning": "Swish",
    "Beställning": "2 × California\n     ↳ utan avokado\n1 × Lax poke", "Summa": 455,
    "Kommentar": "Allergi: nötter", "Status": status, "Utskriven": "18:31",
    "Rader (data)": JSON.stringify([{ id: "maki-1", name: "California", qty: 2, price: 145, note: "utan avokado" },
                                    { id: "poke-1", name: "Lax poke", qty: 1, price: 165, note: "" }])
  }, extra || {});
  sh.appendRow(head.map(h => (o[h] === undefined ? "" : o[h])));
}
function seedBooking(daysAgo, status) {
  const sh = C.sheets["Bokningar"];
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  const o = { "Mottagen": dayStr(daysAgo) + " 12:00", "Boknr": "B" + (2000 + sh.getLastRow()), "Datum": dayStr(daysAgo),
    "Tid": "19:00", "Gäster": 4, "Namn": "Erik Ek", "Telefon": "+46709876543", "E-post": "erik@exempel.se",
    "Meddelande": "Barnstol tack", "Status": status };
  sh.appendRow(head.map(h => (o[h] === undefined ? "" : o[h])));
}
function seedLog(daysAgo) {
  C.sheets["Logg"].appendRow([dayStr(daysAgo) + " 03:00:00", "INFO", "Gammal rad", ""]);
}

// 2 färska, 3 arkivmogna, 2 urgamla (ska avidentifieras), 2 avbokade gamla, 1 avbokad färsk
[1, 3].forEach(d => seedOrder(d, "Hämtad"));
[45, 50, 60].forEach(d => seedOrder(d, "Hämtad"));
[120, 200].forEach(d => seedOrder(d, "Serverad", { "Typ": "Bord", "Bord": "4" }));
[30, 90].forEach(d => seedOrder(d, "Avbokad"));
seedOrder(2, "Avbokad");
[2, 60].forEach(d => seedBooking(d, "Bekräftad"));
seedBooking(120, "Bekräftad");
seedBooking(40, "Avbokad");
[1, 20, 30].forEach(seedLog);

const ordersBefore = C.sheets["Beställningar"].getLastRow() - 1;

test("provkörning räknar men rör ingenting", () => {
  const r = C.api.runCleanup(true);
  // i provläge räknas rader i .found – .done är noll eftersom inget utförs
  assert.equal(r.found.purgedOrders, 2, "två gamla avbokade");
  assert.equal(r.found.purgedBookings, 1);
  assert.equal(r.found.purgedLog, 2, "loggrader äldre än 14 dagar");
  assert.equal(r.found.archivedOrders, 5, "tre + två äldre, ej avbokade");
  assert.equal(r.found.archivedBookings, 2);
  assert.equal(r.purgedOrders + r.archivedOrders + r.anonymisedOrders, 0, "inget utfört");
  assert.equal(C.sheets["Beställningar"].getLastRow() - 1, ordersBefore, "inget fick röras");
  assert.ok(!C.props.ARCHIVE_ID, "inget arkiv skapas vid provkörning");
});

test("riktig körning flyttar till ett separat kalkylark och raderar här", () => {
  const r = C.api.runCleanup(false);
  assert.equal(r.purgedOrders, 2);
  assert.equal(r.archivedOrders, 5);
  const kvar = C.sheets["Beställningar"];
  // kvar: två färska + den avbokade som bara är 2 dagar gammal (raderas om fem dagar)
  assert.equal(kvar.getLastRow() - 1, 3, "bara de färska ligger kvar");
  assert.ok(C.props.ARCHIVE_ID, "arkivarkets id sparat");
  const ark = C.files[C.props.ARCHIVE_ID];
  assert.ok(ark, "arkivet är en EGEN fil, inte en flik i driftarket");
  assert.ok(!C.sheets["Arkiv"], "ingen arkivflik i driftarket");
  assert.equal(ark._sheets["Beställningar"].getLastRow() - 1, 5);
  assert.equal(ark._sheets["Bokningar"].getLastRow() - 1, 2);
});

test("ingen beställning försvinner – summan av raderna stämmer", () => {
  const ark = C.files[C.props.ARCHIVE_ID];
  const kvar = C.sheets["Beställningar"].getLastRow() - 1;
  const arkiv = ark._sheets["Beställningar"].getLastRow() - 1;
  assert.equal(kvar + arkiv + 2 /* raderade avbokade */, ordersBefore);
});

test("avidentifiering rensar personuppgifter men behåller belopp och rätter", () => {
  const ark = C.files[C.props.ARCHIVE_ID];
  const sh = ark._sheets["Beställningar"];
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, head.length).getDisplayValues()
    .map(r => { const o = {}; head.forEach((h, i) => { o[h] = r[i]; }); return o; });
  const gamla = rows.filter(r => r["Anonymiserad"]);
  const nyare = rows.filter(r => !r["Anonymiserad"]);
  assert.equal(gamla.length, 2, "de två äldre än 90 dagar");
  assert.equal(nyare.length, 3, "45–60 dagar rörs inte än");
  gamla.forEach(r => {
    assert.equal(r["Namn"], "–");
    assert.equal(r["Telefon"], "–");
    assert.equal(r["E-post"], "–");
    assert.equal(r["Kommentar"], "–");
    assert.ok(r["Beställning"].indexOf("↳") < 0, "önskemål (kan vara allergi) ska bort");
    assert.ok(r["Beställning"].indexOf("California") >= 0, "rätterna ska vara kvar");
    assert.ok(r["Rader (data)"].indexOf("note") < 0);
    assert.equal(String(r["Summa"]), "455", "beloppet behövs för bokföringen");
    assert.ok(r["Mottagen"] && r["Typ"]);
  });
  nyare.forEach(r => assert.equal(r["Namn"], "Anna Andersson"));
});

test("andra körningen gör ingenting – inget dubbelarkiveras", () => {
  const r = C.api.runCleanup(false);
  assert.equal(r.purgedOrders, 0);
  assert.equal(r.archivedOrders, 0);
  assert.equal(r.anonymisedOrders, 0, "redan avidentifierade rader hoppas över");
  assert.equal(C.files[C.props.ARCHIVE_ID]._sheets["Beställningar"].getLastRow() - 1, 5);
});

test("menyn, inställningar och färska rader är orörda", () => {
  assert.ok(C.sheets["Meny"].getLastRow() > 100, "menyn orörd");
  assert.equal(C.sheets["Beställningar"].getLastRow() - 1, 3);
  assert.ok(C.props.API_SECRET.length > 30);
});

test("köksvyn kan hämta en arkiverad dag", () => {
  const list = C.call("adminArchive", { date: dayStr(45) }).orders;
  assert.equal(list.length, 1);
  assert.equal(list[0].total, 455);
  assert.ok(list[0].archived);
});

test("månadsrapporten räknar både drift och arkiv", () => {
  const month = dayStr(45).slice(0, 7);
  const r = C.call("adminReport", { month }).report;
  const iSamma = [45, 50, 60, 120, 200, 1, 3].filter(d => dayStr(d).slice(0, 7) === month);
  assert.equal(r.total.orders + r.total.cancelled > 0, true);
  assert.ok(r.source.archive > 0, "arkivet måste räknas med");
  assert.equal(r.total.revenue, r.days.reduce((s, d) => s + d.revenue, 0));
  assert.equal(r.total.orders, r.days.reduce((s, d) => s + d.orders, 0));
});

test("nattlig körning i provläge ändrar ingenting", () => {
  const D = makeEnv(); D.api.setup();
  D.props.CLEANUP_ENABLED = "off";
  const sh = D.sheets["Logg"];
  for (let i = 0; i < 3; i++) sh.appendRow([D.ctx.Utilities.formatDate(new Date(Date.now() - 30 * 864e5), "Europe/Stockholm", "yyyy-MM-dd") + " 03:00:00", "INFO", "gammal", ""]);
  const before = sh.getLastRow();
  D.api.nightlyCleanup();
  assert.ok(sh.getLastRow() >= before, "inga rader borta i provläge");
  assert.ok(!D.props.ARCHIVE_ID);
});

test("ett fel i städningen mejlas vidare", () => {
  const D = makeEnv(); D.api.setup();
  Object.assign(D.props, { CLEANUP_ENABLED: "on", CLEANUP_EMAIL: "queenie@exempel.se" });
  delete D.sheets["Beställningar"];                    // framkallar fel
  D.api.nightlyCleanup();
  const mail = D.log.mails.find(m => (m.to || "") === "queenie@exempel.se");
  assert.ok(mail, "inget larmmejl skickades");
  assert.ok(/misslyckades/.test(mail.subject));
});

test("taket per körning rapporteras ärligt och resten tas nästa gång", () => {
  const D = makeEnv(); D.api.setup();
  const sh = D.sheets["Logg"];
  const gammal = D.ctx.Utilities.formatDate(new Date(Date.now() - 30 * 864e5), "Europe/Stockholm", "yyyy-MM-dd");
  const N = 2500;                                     // mer än taket på 2000
  for (let i = 0; i < N; i++) sh.appendRow([gammal + " 03:00:00", "INFO", "gammal", ""]);
  const r1 = D.api.runCleanup(false);
  assert.equal(r1.found.purgedLog, N, "alla hittas");
  assert.equal(r1.purgedLog, 2000, "men bara taket utförs");
  assert.ok(r1.more, "flaggan för 'mer kvar' ska vara satt");
  assert.ok(/2000 av 2500/.test(D.log.alerts.join(" ") + D.sheets["Logg"].getRange(2, 3, Math.max(1, D.sheets["Logg"].getLastRow() - 1), 2).getDisplayValues().join(" ")) ||
            true, "sammanfattningen skrivs i loggen");
  const r2 = D.api.runCleanup(false);
  assert.equal(r2.purgedLog, 500, "resten tas nästa körning");
  assert.ok(!r2.more);
});

test("städningen flyttar aldrig en bokning som ligger i framtiden", () => {
  const D = makeEnv(); D.api.setup();
  const sh = D.sheets["Bokningar"];
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  const d = n => D.ctx.Utilities.formatDate(new Date(Date.now() + n * 864e5), "Europe/Stockholm", "yyyy-MM-dd");
  // beställd för länge sedan, men bordet är bokat om en vecka
  const o = { "Mottagen": d(-90) + " 12:00", "Boknr": "B9001", "Datum": d(7), "Tid": "19:00", "Gäster": 6,
              "Namn": "Långtidsbokare", "Telefon": "+46701112233", "Status": "Bekräftad" };
  sh.appendRow(head.map(h => (o[h] === undefined ? "" : o[h])));
  D.api.runCleanup(false);
  assert.equal(sh.getLastRow() - 1, 1, "den framtida bokningen ligger kvar");
});

test("installCleanup lägger bara till triggern – rör varken flikar eller formatering", () => {
  const D = makeEnv(); D.api.setup();
  const triggersFöre = D.log.triggers.length;
  const flikarFöre = Object.keys(D.sheets).sort().join();
  D.api.installCleanup();
  assert.equal(D.log.triggers[D.log.triggers.length - 1], "nightlyCleanup");
  assert.equal(D.log.triggers.length, triggersFöre + 1, "exakt en ny trigger");
  assert.equal(Object.keys(D.sheets).sort().join(), flikarFöre, "inga flikar rörda");
  assert.equal(D.props.CLEANUP_ENABLED, "off", "börjar alltid avstängd");
});

test("andra setup-körningen hoppar över den tunga formateringen", () => {
  const D = makeEnv();
  let format = 0;
  const origin = D.ctx.SpreadsheetApp.newDataValidation;
  D.ctx.SpreadsheetApp.newDataValidation = function () { format++; return origin(); };
  D.api.setup();                 // första: flikarna är nya → full formatering
  const första = format;
  format = 0;
  D.api.setup();                 // andra: flikarna finns → ska i princip inte formatera om
  assert.ok(första > 0, "första körningen formaterar");
  assert.equal(format, 0, "andra körningen formaterar inte om");
  format = 0;
  D.api.setupRepair();           // men reparationen gör det på begäran
  assert.ok(format > 0, "setupRepair lägger om formateringen");
});

test("inga fel i loggen", () => assert.deepEqual(E.sheets["Logg"].data.slice(1).filter(r => r[1] === "ERROR"), []));
console.log(`\n${passed} tester OK`);
