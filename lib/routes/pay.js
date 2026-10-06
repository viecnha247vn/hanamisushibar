// Onlinebetalning med Stripe (Q89 Pay, Stripe Connect – Hanami är säljare, Queenie89 AB är plattform). Endast kort/wallets;
// Swish sköts som tidigare direkt till restaurangens Swish-nummer (ingen plattformsavgift).
//
//   POST /api/pay            samma kropp som /api/submit (payment: "online")
//                            → kontrollerar beställningen, prissätter i arket, skapar Stripe Checkout → { url, ref }
//   GET  /api/pay?ref&sid    tacksidan frågar om betalningen är klar → { status, no, total, … }
//
// Ordern skapas INTE här. Den skapas av webhooken (api/stripe-webhook.js → Apps Script payConfirm) när Stripe
// bekräftat pengarna. Köket ser därför aldrig obetalda onlinebeställningar.
import settings from "../../data/settings.js";
import { gas } from "../gas.js";
import { wrap, send, body, HttpError, clean } from "../util.js";
import { buildOrder } from "./submit.js";
import { stripe, stripeConfigured, applicationFeeOre } from "../stripe.js";

const SITE = () => (process.env.SITE_URL || `https://${settings.siteHost}`).replace(/\/$/, "");

export default wrap(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET") return status(req, res);
  if (req.method !== "POST") throw new HttpError(405, "Endast POST.");
  if (!stripeConfigured()) throw new HttpError(503, `Onlinebetalning är inte aktiverad just nu. Välj Swish eller kort i kassan, eller ring ${settings.phone}.`);

  const p = body(req);
  if (p.website) return send(res, 200, { ok: true, url: SITE() + "/meny", ref: "P0000" }); // honungsfälla
  if (p.type !== "pickup-order" && p.type !== "table-order") throw new HttpError(400, "Okänd typ.");
  p.payment = "online";

  // 1) Samma kontroller som /api/submit (öppettider, lunch/happy hour, format)
  const order = buildOrder(p);

  // 2) Prissättning i arket + väntande rad i fliken Betalningar
  const pend = await gas("payPending", { order });
  const totalOre = Math.round(pend.total * 100);

  // 3) Stripe Checkout – destination charge till Hanamis konto, Q89:s avgift dras automatiskt
  const taxRate = process.env.STRIPE_TAX_RATE_12 ? [process.env.STRIPE_TAX_RATE_12] : undefined;
  const line_items = pend.lines.map(l => ({
    quantity: l.qty,
    price_data: { currency: "sek", unit_amount: Math.round(l.price * 100),
      product_data: { name: clean(l.name, 120), description: l.note ? clean(l.note, 200) : undefined, metadata: { id: l.id } } },
    tax_rates: taxRate
  }));
  if (pend.tip > 0) line_items.push({ quantity: 1, price_data: { currency: "sek", unit_amount: Math.round(pend.tip * 100), product_data: { name: "Dricks till köket" } } });

  const isTable = order.kind === "table";
  const success = `${SITE()}/tack?ref=${encodeURIComponent(pend.ref)}&sid={CHECKOUT_SESSION_ID}`;
  const cancel = `${SITE()}/meny?avbruten=${encodeURIComponent(pend.ref)}${isTable ? `&bord=${encodeURIComponent(order.table)}` : ""}`;

  let session;
  try {
    session = await stripe("POST", "/checkout/sessions", {
      mode: "payment",
      locale: "sv",
      currency: "sek",
      // Bara kort (inkl. Apple Pay/Google Pay). Swish går via restaurangens eget Swish-nummer utan plattformsavgift –
      // billigare för Hanami. Vill man ha Swish i Stripe senare: lägg till "swish" här och aktivera i Dashboard.
      payment_method_types: ["card"],
      line_items,
      customer_email: order.email || undefined,
      client_reference_id: pend.ref,
      metadata: { ref: pend.ref, kind: order.kind, table: order.table || "", restaurant: "hanami" },
      payment_intent_data: {
        transfer_data: { destination: process.env.STRIPE_ACCOUNT },
        on_behalf_of: process.env.STRIPE_ACCOUNT,          // Hanami står som säljare på kontoutdrag och i Swish-appen
        application_fee_amount: applicationFeeOre(totalOre),
        description: `${settings.name} – ${isTable ? "bord " + order.table : "hämtning"} – ${pend.ref}`,
        metadata: { ref: pend.ref, restaurant: "hanami" }
      },
      custom_text: { submit: { message: isTable ? `Bord ${order.table}. Maten skickas till köket så fort betalningen är klar.` : "Du får sms när maten är klar att hämtas." } },
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      success_url: success,
      cancel_url: cancel
    }, { idempotencyKey: `checkout-${pend.ref}` });
  } catch (e) {
    console.error("[pay] stripe", e.message);
    await gas("payFail", { ref: pend.ref, status: "failed" }).catch(() => {});
    throw new HttpError(502, `Betalningen kunde inte startas. Välj Swish eller kort i kassan, eller ring ${settings.phone}.`);
  }
  await gas("paySession", { ref: pend.ref, sessionId: session.id });
  return send(res, 200, { ok: true, url: session.url, ref: pend.ref, total: pend.total });
});

async function status(req, res) {
  const ref = clean(req.query?.ref, 20), sid = clean(req.query?.sid, 80);
  if (!/^P[A-Z0-9]{12}$/.test(ref) || !/^cs_/.test(sid)) throw new HttpError(400, "Ogiltig förfrågan.");
  const r = await gas("payStatus", { ref, sessionId: sid }, { timeout: 12000 });
  return send(res, 200, { ok: true, status: r.status, no: r.no, total: r.total, method: r.method, kind: r.kind, table: r.table, phone: r.phone, email: r.email, when: r.whenText });
}
