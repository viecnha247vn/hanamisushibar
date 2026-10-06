// Stripe-webhook – EGEN funktion (inte via api/index.js) eftersom signaturen måste räknas på den RÅA kroppen
// och Vercels inbyggda body-parser annars hinner tolka JSON åt oss. bodyParser stängs av här nedan.
//
//   Stripe Dashboard → Utvecklare → Webhooks → https://hanamisushibar.se/api/stripe/webhook
//   Händelser: checkout.session.completed, checkout.session.async_payment_succeeded,
//              checkout.session.async_payment_failed, checkout.session.expired
//   vercel.json skriver om /api/stripe/webhook → /api/stripe-webhook (före den generella /api/:route*-regeln).
//
// Svarar alltid snabbt. Arbetet (skapa ordern, skriva ut, sms, mejl) görs av Apps Script via payConfirm.
// Vid fel svarar vi 500 så att Stripe försöker igen (upp till 3 dygn) – payConfirm är idempotent.
import { gas } from "../lib/gas.js";
import { stripe, verifyWebhook } from "../lib/stripe.js";

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.statusCode = 405; return res.end("Method Not Allowed"); }

  let raw;
  try { raw = await rawBody(req); }
  catch (e) { res.statusCode = 400; return res.end("Kunde inte läsa kroppen: " + e.message); }

  let event;
  try { event = verifyWebhook(raw, req.headers["stripe-signature"]); }
  catch (e) { console.warn("[stripe-webhook] signatur:", e.message); res.statusCode = 400; return res.end("Bad signature"); }

  try {
    const result = await handleEvent(event);
    res.statusCode = 200; res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ received: true, ...result }));
  } catch (e) {
    console.error("[stripe-webhook]", event.type, event.id, e.message);
    res.statusCode = 500; return res.end("handler error");
  }
}

export async function handleEvent(event) {
  const s = event.data?.object || {};
  const ref = s.metadata?.ref || s.client_reference_id;
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      if (s.payment_status !== "paid") return { ignored: "not paid yet" };
      if (!ref) return { ignored: "no ref" };
      // Vilket betalsätt blev det? (kort/swish) – för kolumnen Betalning och kvittot
      let method = "card";
      if (s.payment_intent) {
        try {
          const pi = await stripe("GET", `/payment_intents/${s.payment_intent}`, { "expand[]": "latest_charge" });
          method = pi.latest_charge?.payment_method_details?.type || method;
        } catch (e) { console.warn("[stripe-webhook] kunde inte läsa payment_intent:", e.message); }
      }
      const r = await gas("payConfirm", { ref, sessionId: s.id, paymentIntent: s.payment_intent || "", method, amount: s.amount_total }, { timeout: 25000 });
      return { ref, no: r.no, already: !!r.already };
    }
    case "checkout.session.expired":
    case "checkout.session.async_payment_failed": {
      if (!ref) return { ignored: "no ref" };
      await gas("payFail", { ref, status: event.type.endsWith("expired") ? "expired" : "failed" }, { timeout: 12000 });
      return { ref, failed: true };
    }
    default:
      return { ignored: event.type };
  }
}

/** Läser hela kroppen som sträng, oavsett om Vercel redan tolkat den eller inte. */
export function rawBody(req) {
  if (typeof req.body === "string") return Promise.resolve(req.body);
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body.toString("utf8"));
  if (req.body && typeof req.body === "object") {
    // Body-parsern var inte avstängd – sista utväg (fungerar bara om Stripe skickat kompakt JSON, vilket de gör)
    return Promise.resolve(JSON.stringify(req.body));
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
