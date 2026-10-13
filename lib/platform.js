// Plattformsrapport för Queenie89 AB (INTE för restaurangen): vad Stripe bokat på plattformskontot en dag.
// Källa = Stripes egna balanstransaktioner (facit), plus charges för listan per order.
//
//   Intäkt        application_fee (4 % + 2 kr per order)          reporting_category platform_earning
//   − Återbetald  application_fee_refund                           platform_earning_refund
//   − Stripe      avgift på varje charge (kortinlösen, fee_details) + ev. övriga Stripe-avgifter (type stripe_fee/…)
//   = Resultat
//   Genomströmning (pengar som bara passerar): charge, refund, transfer, transfer_refund → nettar ≈ 0.
import { stripe } from "./stripe.js";

const TZ = "Europe/Stockholm";

/** Unix-sekunder för 00:00 i Stockholm den dagen. */
export function stockholmMidnight(date) {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(new Date(guess)).map(p => [p.type, p.value]));
  const asLocal = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  return Math.round((guess - (asLocal - guess)) / 1000);
}

async function listAll(path, params) {
  const out = [];
  let starting_after;
  for (let page = 0; page < 50; page++) {
    const r = await stripe("GET", path, { ...params, limit: 100, starting_after });
    out.push(...r.data);
    if (!r.has_more || !r.data.length) break;
    starting_after = r.data[r.data.length - 1].id;
  }
  return out;
}

const kr = ore => Math.round(ore) / 100;

/** Ren summering (testbar). bts = balanstransaktioner, charges = charges med application_fee_amount/metadata. */
export function summarizePlatform(bts, charges = []) {
  const s = { charges: 0, chargeCount: 0, stripeFees: 0, refunds: 0, refundCount: 0, toRestaurants: 0, fromRestaurants: 0,
    appFees: 0, appFeeCount: 0, appFeeRefunds: 0, otherFees: 0, payouts: 0, other: 0, net: 0 };
  for (const t of bts) {
    s.net += t.net;
    switch (t.type) {
      case "charge": case "payment": s.charges += t.amount; s.chargeCount++; s.stripeFees += t.fee; break;
      case "refund": case "payment_refund": s.refunds += -t.amount; s.refundCount++; s.stripeFees += t.fee; break;
      case "transfer": s.toRestaurants += -t.amount; break;
      case "transfer_refund": case "transfer_cancel": case "transfer_failure": s.fromRestaurants += t.amount; break;
      case "application_fee": s.appFees += t.amount; s.appFeeCount++; break;
      case "application_fee_refund": s.appFeeRefunds += -t.amount; break;
      case "payout": case "payout_cancel": case "payout_failure": s.payouts += -t.amount; break;
      case "stripe_fee": case "tax_fee": case "stripe_fx_fee": case "adjustment": s.otherFees += -t.net; break;
      default: s.other += t.net;
    }
  }
  const profit = s.appFees - s.appFeeRefunds - s.stripeFees - s.otherFees;
  const orders = charges.filter(c => c.status === "succeeded").map(c => {
    const bt = c.balance_transaction && typeof c.balance_transaction === "object" ? c.balance_transaction : null;
    const fee = Number(c.application_fee_amount) || 0, sfee = bt ? bt.fee : 0;
    return { time: c.created, desc: c.description || c.id, restaurant: c.metadata?.restaurant || "", amount: kr(c.amount), refunded: kr(c.amount_refunded || 0),
      appFee: kr(fee), stripeFee: kr(sfee), margin: kr(fee - sfee), method: c.payment_method_details?.wallet?.type || c.payment_method_details?.type || "" };
  }).sort((a, b) => a.time - b.time);
  const o = {}; for (const k of Object.keys(s)) o[k] = /Count$/.test(k) ? s[k] : kr(s[k]);
  return { ...o, profit: kr(profit), marginPct: s.charges ? Math.round(profit / s.charges * 10000) / 100 : 0, orders };
}

/** Hämtar och summerar en dag (Stockholmstid) från Stripe. */
export async function platformDay(date) {
  const gte = stockholmMidnight(date), lt = stockholmMidnight(nextDay(date));
  const created = { gte, lt };
  const [bts, charges, balance] = await Promise.all([
    listAll("/balance_transactions", { created }),
    listAll("/charges", { created, "expand[]": "data.balance_transaction" }),
    stripe("GET", "/balance", {})
  ]);
  const sum = (arr = []) => kr(arr.filter(x => x.currency === "sek").reduce((a, x) => a + x.amount, 0));
  return { date, ...summarizePlatform(bts, charges), balance: { available: sum(balance.available), pending: sum(balance.pending) } };
}

function nextDay(date) { const d = new Date(date + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); }
