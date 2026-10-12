/**
 * Återbetalning av onlinebetalda beställningar (Q89 Pay / Stripe).
 *
 * Pengarna flyttas av Vercel (lib/routes/admin.js → Stripe /v1/refunds med reverse_transfer). Här antecknas
 * bara resultatet i kolumnen "Återbetald" och gästen får ett mejl.
 *
 * Stripe är facit: refundedOre är TOTALT återbetalt hittills (inte ett tillägg). Därför kan samma återbetalning
 * rapporteras två gånger – av köksvyn och av webhooken charge.refunded – utan att räknas dubbelt.
 */

/** Uppgifter som Vercel behöver för att återbetala: payment intent, summa, redan återbetalt. */
function orderForRefund_(no) {
  const sh = sheet_(SHEET.ORDERS), row = findRow_(sh, 'Ordernr', String(no || ''));
  if (!row) throw new ApiError(404, 'Hittar inte ' + no + '.');
  const r = rowObject_(sh, row);
  return { no: r['Ordernr'], stripe: r['Stripe'] || '', payment: r['Betalning'],
           total: Number(String(r['Summa']).replace(/\D/g, '')) || 0, refunded: refundedKr_(r['Återbetald']) };
}

/**
 * p = { no?, stripe?, refundedOre, capturedOre?, source? }  – no (köksvyn) eller stripe = payment intent (webhook)
 */
function setRefunded_(p) {
  const sh = sheet_(SHEET.ORDERS);
  const row = p.no ? findRow_(sh, 'Ordernr', String(p.no)) : (p.stripe ? findRow_(sh, 'Stripe', String(p.stripe)) : 0);
  if (!row) throw new ApiError(404, 'Hittar ingen beställning för återbetalningen.');
  const kr = Math.round(Number(p.refundedOre) || 0) / 100;
  if (!(kr > 0)) throw new ApiError(400, 'Ogiltigt belopp.');
  const r = rowObject_(sh, row), before = refundedKr_(r['Återbetald']);
  if (kr <= before) return { no: r['Ordernr'], refunded: before, already: true };
  const full = Number(p.capturedOre) > 0 && Number(p.refundedOre) >= Number(p.capturedOre);
  sh.getRange(row, refundCol_(sh)).setValue(krText_(kr) + ' kr ' + now_('yyyy-MM-dd HH:mm') + (full ? ' (hela)' : ''));
  log_('INFO', 'Återbetalning', r['Ordernr'] + ': ' + krText_(kr - before) + ' kr' + (p.source ? ' via ' + p.source : '') + (full ? ', hela beloppet' : ''));
  mailRefund_(r, kr - before);
  return { no: r['Ordernr'], refunded: kr, full: full };
}

/** "12 kr 2026-10-12 15:12 (hela)" → 12 */
function refundedKr_(cell) {
  const m = String(cell || '').match(/^(\d+(?:[.,]\d+)?)/);
  return m ? Number(m[1].replace(',', '.')) : 0;
}

function krText_(kr) { return Number.isInteger(kr) ? String(kr) : kr.toFixed(2).replace('.', ','); }

/** Kolumnen "Återbetald" läggs till vid behov – setup() behöver inte köras om. */
function refundCol_(sh) {
  const c = colMap_(sh)['Återbetald'];
  if (c) return c;
  const n = sh.getLastColumn() + 1;
  sh.getRange(1, n).setValue('Återbetald');
  return n;
}

function rowObject_(sh, row) {
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  const vals = sh.getRange(row, 1, 1, head.length).getDisplayValues()[0];
  const o = { _row: row };
  head.forEach((h, i) => { o[h] = vals[i]; });
  return o;
}

function mailRefund_(r, kr) {
  const to = r['E-post'];
  if (!to) return false;
  const text = 'Hej ' + (r['Namn'] || '') + '!\n\nVi har återbetalat ' + krText_(kr) + ' kr för beställning ' + r['Ordernr'] +
    ' till kortet du betalade med. Det tar normalt 5–10 bankdagar innan pengarna syns på ditt konto.\n\nHälsningar\n' + APP.NAME + '\n' + APP.PHONE;
  const html = guestMail_({ eyebrow: 'Återbetalning ' + r['Ordernr'], body:
    '<p style="margin:0 0 14px;color:#1B2A3A;font-size:16px">Hej ' + esc_(r['Namn'] || '') + '!</p>' +
    '<p style="margin:0 0 14px;color:#1B2A3A">Vi har återbetalat <b>' + esc_(krText_(kr)) + ' kr</b> för beställning <b>' + esc_(r['Ordernr']) +
    '</b> till kortet du betalade med.</p>' +
    '<p style="margin:0;color:#4C5B6B;font-size:14px">Det tar normalt 5–10 bankdagar innan pengarna syns på ditt konto. Frågor? Ring oss på ' + esc_(APP.PHONE) + '.</p>' });
  return sendGuestMail_(to, 'Återbetalning ' + r['Ordernr'] + ' – ' + APP.NAME, html, text);
}
