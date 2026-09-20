// POST /api/submit – beställning (hämtning/bord) och bordsbokning.
// Här kontrolleras format, öppettider och tider. Priser och rätter kontrolleras i Apps Script mot fliken Meny.
import settings from "../../data/settings.js";
import { gas } from "../gas.js";
import { wrap, send, body, HttpError, clean, cleanMultiline, phoneE164, email, nowLocal, addDays, toMinutes, hoursFor, isDate } from "../util.js";
import { whenText } from "../when.js";
import { mixPrice } from "../mix.js";

export default wrap(async (req, res) => {
  if (req.method !== "POST") throw new HttpError(405, "Endast POST.");
  const p = body(req);
  if (p.website) return send(res, 200, { ok: true, no: "H0000", total: 0 }); // honungsfälla
  if (p.type === "pickup-order" || p.type === "table-order") return send(res, 200, await order(p));
  if (p.type === "booking") return send(res, 200, await booking(p));
  throw new HttpError(400, "Okänd typ.");
});

async function order(p) {
  const isTable = p.type === "table-order";
  const now = nowLocal();
  if (!Array.isArray(p.items) || !p.items.length) throw new HttpError(400, "Varukorgen är tom.");
  if (p.items.length > 60) throw new HttpError(400, "För många rader.");
  const items = p.items.map(r => ({ id: clean(r.id, 40), qty: Math.floor(Number(r.qty)), note: clean(r.note, 120), opts: r.opts || null }));
  if (items.some(i => !/^[a-z0-9-]+$/.test(i.id) || !(i.qty >= 1 && i.qty <= 50))) throw new HttpError(400, "Ogiltig beställning.");
  // Byten i sushimixar: tillägget räknas här och läggs på arkets pris i Apps Script
  for (const i of items) {
    try { const m = mixPrice(i.id, i.opts); i.extra = m.extra; i.detail = m.detail; }
    catch (e) { throw new HttpError(400, e.message); }
    delete i.opts;
  }

  const tip = Math.round(Number(p.tip) || 0);
  if (!(tip >= 0 && tip <= 2000)) throw new HttpError(400, "Ogiltig dricks.");

  const out = { kind: isTable ? "table" : "pickup", items, tip, payment: p.payment === "kort" ? "kort" : "swish",
    message: cleanMultiline(p.message, 500), email: email(p.email) };

  if (isTable) {
    const table = clean(p.table, 10);
    if (!/^[A-Za-z0-9-]{1,10}$/.test(table)) throw new HttpError(400, "Ogiltigt bordsnummer.");
    const h = hoursFor(now.date);
    if (!h || now.minutes < h[0] * 60 || now.minutes >= h[1] * 60) throw new HttpError(400, `Restaurangen är stängd just nu. Ring ${settings.phone}.`);
    checkTimedMenus(items, now.date, now.minutes, now);
    Object.assign(out, { table, name: clean(p.name, 80), phone: phoneE164(p.phone, { required: false }) });
  } else {
    const name = clean(p.name, 80);
    if (name.length < 2) throw new HttpError(400, "Ange ditt namn.");
    const { pickupDate: d, pickupTime: t } = p;
    if (!isDate(d) || d < now.date || d > addDays(now.date, settings.pickupDaysAhead)) throw new HttpError(400, "Välj en giltig hämtningsdag.");
    const h = hoursFor(d), m = toMinutes(t);
    if (!h) throw new HttpError(400, "Vi har stängt den dagen.");
    if (isNaN(m) || m < h[0] * 60 || m > h[1] * 60 - 15) throw new HttpError(400, "Välj en hämtningstid inom öppettiderna.");
    if (d === now.date && m < now.minutes + settings.pickupLeadMinutes - 10) throw new HttpError(400, `Hämtningstiden måste vara minst ${settings.pickupLeadMinutes} minuter fram. Välj en senare tid.`);
    checkTimedMenus(items, d, m, now);
    Object.assign(out, { name, phone: phoneE164(p.phone), pickupDate: d, pickupTime: t, whenText: whenText(d, t) });
  }
  const r = await gas("order", out);
  return { ok: true, no: r.no, total: r.total };
}

// Lunch- och happy hour-rätter har id som börjar med kategorins id.
// Lunch: hämtningstiden ska ligga inom lunchtiden.
// Happy hour: beställningen måste läggas medan happy hour pågår (en öppen dag) och hämtas samma dag.
export function checkTimedMenus(items, date, minutes, now = nowLocal()) {
  const { lunch, happyHour } = settings;
  const wd = new Date(date + "T12:00:00Z").getUTCDay();
  if (items.some(i => i.id.startsWith("lunch-")) && !(lunch.days.includes(wd) && minutes >= lunch.from * 60 && minutes < lunch.to * 60))
    throw new HttpError(400, `Lunchmenyn gäller måndag–fredag ${lunch.from}:00–${lunch.to}:00. Ta bort lunchrätten eller välj en annan tid.`);
  if (items.some(i => i.id.startsWith("happy-"))) {
    const open = !!hoursFor(now.date);
    const during = open && now.minutes >= happyHour.from * 60 && now.minutes < happyHour.to * 60;
    const t = `${String(happyHour.from).padStart(2, "0")}:00–${String(happyHour.to).padStart(2, "0")}:00`;
    if (!during) throw new HttpError(400, `Happy hour-rätter kan bara beställas under happy hour, ${t}. Ta bort dem ur varukorgen för att fortsätta.`);
    if (date !== now.date) throw new HttpError(400, "Happy hour-rätter hämtas samma dag. Välj en tid idag.");
  }
}

async function booking(p) {
  const now = nowLocal();
  const { date, time } = p;
  const guests = Math.floor(Number(p.guests));
  if (!isDate(date) || date < now.date || date > addDays(now.date, settings.bookingDaysAhead)) throw new HttpError(400, "Välj ett giltigt datum.");
  const h = hoursFor(date), m = toMinutes(time);
  if (!h) throw new HttpError(400, "Vi har stängt den dagen.");
  if (isNaN(m) || m < h[0] * 60 || m > h[1] * 60 - 60) throw new HttpError(400, "Välj en tid inom öppettiderna.");
  if (date === now.date && m < now.minutes + 30) throw new HttpError(400, `Den tiden har redan passerat. Ring ${settings.phone} för bord inom en halvtimme.`);
  if (!(guests >= 1 && guests <= settings.maxBookingGuests)) throw new HttpError(400, `Online kan du boka för 1–${settings.maxBookingGuests} personer. Ring oss för större sällskap.`);
  const name = clean(p.name, 80);
  if (name.length < 2) throw new HttpError(400, "Ange ditt namn.");
  const r = await gas("booking", {
    date, time, guests, name, phone: phoneE164(p.phone), email: email(p.email),
    message: cleanMultiline(p.message, 500), whenText: whenText(date, time)
  });
  return { ok: true, no: r.no };
}
