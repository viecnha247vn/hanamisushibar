/**
 * Onlinebetalning (Q89 Pay / Stripe Connect).
 *
 * Flöde:
 *   1. Vercel kontrollerar beställningen (lib/routes/pay.js → samma regler som /api/submit) och anropar payPending
 *      → raderna prissätts mot fliken Meny och sparas i fliken Betalningar med status "väntar". Ingen order ännu.
 *   2. Vercel skapar en Stripe Checkout Session på exakt det beloppet och sparar sessionens id (paySession).
 *   3. Gästen betalar. Stripe skickar webhook till Vercel → payConfirm → createOrder_ körs med betalning "online-…":
 *      ordern hamnar i Beställningar som BETALD, skrivs ut i köket, gästen får sms/mejl precis som vanligt.
 *   4. Betalning som avbryts/går ut → payFail (status "misslyckad"/"utgången"). Ingen order skapas.
 *
 * Köket ser alltså aldrig obetalda onlinebeställningar. Priserna låses när betalningen startar, så en rätt som
 * blir "slut idag" medan gästen betalar påverkar inte den redan betalda ordern.
 */

const PAY_STATUS = { WAIT: 'väntar', PAID: 'betald', FAIL: 'misslyckad', EXPIRED: 'utgången' };
const PAY_KEEP_DAYS = 2;   // ofullbordade betalningar städas efter två dagar

function payPending_(p) {
  const order = p && p.order;
  if (!order || !Array.isArray(order.items)) throw new ApiError(400, 'Ogiltig beställning.');
  const ord = ordering_();
  if (!ord.open) throw new ApiError(423, ord.message);   // köket har stängt onlinebeställning – ta inte betalt
  const priced = priceLines_(order);              // kastar 400/409 om något är fel – gästen får felet innan betalning
  if (!(priced.total >= 3)) throw new ApiError(400, 'Beloppet är för litet för onlinebetalning.');
  const ref = 'P' + Utilities.getUuid().replace(/-/g, '').slice(0, 12).toUpperCase();
  appendObject_(sheet_(SHEET.PAY), {
    'Skapad': now_(), 'Ref': ref, 'Status': PAY_STATUS.WAIT, 'Summa': priced.total, 'Metod': '',
    'Stripe session': '', 'Payment intent': '', 'Ordernr': '', 'Uppdaterad': now_(),
    'Order (data)': JSON.stringify(order), 'Rader (data)': JSON.stringify({ lines: priced.lines, sum: priced.sum, tip: priced.tip, total: priced.total })
  });
  prunePending_();
  return { ref: ref, total: priced.total, sum: priced.sum, tip: priced.tip, lines: priced.lines };
}

function paySession_(p) {
  const sh = sheet_(SHEET.PAY);
  const row = findRow_(sh, 'Ref', String(p.ref || ''));
  if (!row) throw new ApiError(404, 'Okänd betalning.');
  const c = colMap_(sh);
  sh.getRange(row, c['Stripe session']).setValue(String(p.sessionId || ''));
  sh.getRange(row, c['Uppdaterad']).setValue(now_());
  return { ref: p.ref };
}

/**
 * Stripe har bekräftat betalningen. Idempotent: samma ref två gånger ger samma ordernummer.
 * p = { ref, sessionId, paymentIntent, method ('card'|'swish'|…), amount (öre) }
 */
function payConfirm_(p) {
  const sh = sheet_(SHEET.PAY);
  const row = findRow_(sh, 'Ref', String(p.ref || ''));
  if (!row) throw new ApiError(404, 'Okänd betalning ' + p.ref + '.');
  const c = colMap_(sh);
  const v = sh.getRange(row, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  const r = {}; Object.keys(c).forEach(k => { r[k] = v[c[k] - 1]; });

  if (r['Status'] === PAY_STATUS.PAID && r['Ordernr']) return { no: r['Ordernr'], already: true, total: Number(r['Summa']) };
  if (r['Stripe session'] && p.sessionId && r['Stripe session'] !== String(p.sessionId)) throw new ApiError(409, 'Sessionen stämmer inte.');

  const priced = JSON.parse(r['Rader (data)']);
  const expected = Math.round(Number(r['Summa']) * 100);
  if (Number(p.amount) !== expected) {
    log_('ERROR', 'Stripe-belopp avviker', p.ref + ': fick ' + p.amount + ' öre, väntade ' + expected);
    throw new ApiError(409, 'Beloppet stämmer inte med beställningen.');
  }

  const order = JSON.parse(r['Order (data)']);
  order.payment = p.method === 'swish' ? 'online-swish' : 'online-kort';
  order.stripeRef = String(p.paymentIntent || p.sessionId || '');
  const res = createOrder_(order, priced);

  sh.getRange(row, c['Status']).setValue(PAY_STATUS.PAID);
  // Personuppgifterna finns nu i Beställningar (och arkiveras/avidentifieras av Cleanup). Här behålls bara typ och bord.
  sh.getRange(row, c['Order (data)']).setValue(JSON.stringify({ kind: order.kind, table: order.table || '' }));
  sh.getRange(row, c['Metod']).setValue(order.payment === 'online-swish' ? 'Swish' : 'Kort');
  sh.getRange(row, c['Payment intent']).setValue(String(p.paymentIntent || ''));
  sh.getRange(row, c['Ordernr']).setValue(res.no);
  sh.getRange(row, c['Uppdaterad']).setValue(now_());
  log_('INFO', 'Onlinebetalning klar', p.ref + ' → ' + res.no + ' (' + order.payment + ', ' + priced.total + ' kr)');
  return { no: res.no, total: priced.total, whenText: res.whenText || '', pickupTime: res.pickupTime || '' };
}

function payFail_(p) {
  const sh = sheet_(SHEET.PAY);
  const row = findRow_(sh, 'Ref', String(p.ref || ''));
  if (!row) return { ref: p.ref, ignored: true };
  const c = colMap_(sh);
  if (sh.getRange(row, c['Status']).getDisplayValues()[0][0] !== PAY_STATUS.WAIT) return { ref: p.ref, ignored: true };
  sh.getRange(row, c['Status']).setValue(p.status === 'expired' ? PAY_STATUS.EXPIRED : PAY_STATUS.FAIL);
  sh.getRange(row, c['Uppdaterad']).setValue(now_());
  return { ref: p.ref };
}

/** Tacksidan frågar: är betalningen klar? Kräver att sessionens id stämmer så att ingen kan gissa sig till andras ordrar. */
function payStatus_(p) {
  const sh = sheet_(SHEET.PAY);
  const row = findRow_(sh, 'Ref', String(p.ref || ''));
  if (!row) throw new ApiError(404, 'Okänd betalning.');
  const c = colMap_(sh);
  const v = sh.getRange(row, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  const r = {}; Object.keys(c).forEach(k => { r[k] = v[c[k] - 1]; });
  if (!r['Stripe session'] || r['Stripe session'] !== String(p.sessionId || '')) throw new ApiError(404, 'Okänd betalning.');
  const order = safeJson_(r['Order (data)']) || {};
  let whenText = '', phone = '', email = '';
  if (r['Status'] === PAY_STATUS.PAID && r['Ordernr']) {
    const o = rows_(sheet_(SHEET.ORDERS), 300).filter(x => x['Ordernr'] === r['Ordernr'])[0];
    if (o) { phone = pretty_(o['Telefon']); email = o['E-post'] || ''; if (order.kind !== 'table' && o['Hämtas tid']) whenText = 'idag kl ' + o['Hämtas tid']; }
  }
  return { status: r['Status'], no: r['Ordernr'] || '', total: Number(r['Summa']) || 0, method: r['Metod'] || '',
           kind: order.kind || '', table: order.table || '', phone: phone, email: email, whenText: whenText };
}

/** Tar bort gamla ofullbordade betalningar så fliken inte växer (de innehåller gästens uppgifter). Betalda rader har redan rensats på personuppgifter i payConfirm_. */
function prunePending_() {
  try {
    const sh = sheet_(SHEET.PAY);
    const cutoff = Utilities.formatDate(new Date(Date.now() - PAY_KEEP_DAYS * 86400000), APP.TZ, 'yyyy-MM-dd HH:mm');
    const old = rows_(sh, 400).filter(r => r['Status'] !== PAY_STATUS.PAID && r['Skapad'] < cutoff).map(r => r._row);
    old.sort((a, b) => b - a).slice(0, 50).forEach(n => sh.deleteRows(n, 1));
  } catch (e) { log_('WARN', 'prunePending', e.message); }
}
