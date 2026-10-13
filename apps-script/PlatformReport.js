/**
 * Plattformsrapport till Queenie89 AB – INTE till restaurangen.
 * Varje morgon (~07.00) för hela gårdagen: vad Stripe bokat på plattformskontot – alla onlineorder, Q89-avgifter,
 * Stripes kortavgifter, återbetalningar, överföringar till restaurangen, resultat och saldo.
 * Siffrorna räknas av Vercel direkt ur Stripe (/api/platform, lib/platform.js).
 *
 * Mottagare: skriptegenskapen PLATFORM_EMAIL (måste fyllas i – går aldrig till NOTIFY_EMAIL/REPORT_EMAIL).
 * Ingenting om intäkterna skrivs i fliken Logg (restaurangen kan se arket).
 */

function platformData_(date) {
  const site = prop_('SITE_URL').replace(/\/$/, '');
  if (!site) throw new Error('SITE_URL saknas');
  const res = UrlFetchApp.fetch(site + '/api/platform?date=' + date, { headers: { 'x-report-key': prop_('API_SECRET') }, muteHttpExceptions: true });
  const data = JSON.parse(res.getContentText() || '{}');
  if (res.getResponseCode() !== 200 || !data.ok) throw new Error('Plattformsrapport: ' + (data.error || 'HTTP ' + res.getResponseCode()));
  return data;
}

function platformMail_(date) {
  const to = prop_('PLATFORM_EMAIL');
  if (!to) throw new Error('PLATFORM_EMAIL saknas (Projektinställningar → Skriptegenskaper).');
  const d = platformData_(date);
  const k = n => krR_(n), tr = (a, b, c) => '<tr><td style="padding:6px 12px 6px 0;color:#4B5261">' + a + '</td><td style="padding:6px 0;text-align:right;white-space:nowrap' + (c ? ';font-weight:700' : '') + '">' + b + '</td></tr>';
  const time = s => Utilities.formatDate(new Date(s * 1000), APP.TZ, 'HH:mm');
  const orders = (d.orders || []).map(o => '<tr>' +
    '<td style="padding:5px 8px 5px 0;white-space:nowrap">' + time(o.time) + '</td>' +
    '<td style="padding:5px 8px 5px 0">' + esc_(String(o.desc).replace(/^Hanami Sushi Bar – /, '')) + (o.refunded ? ' <span style="color:#9B2C2C">(återbet. ' + k(o.refunded) + ')</span>' : '') + '</td>' +
    '<td style="padding:5px 8px 5px 0;text-align:right;white-space:nowrap">' + k(o.amount) + '</td>' +
    '<td style="padding:5px 8px 5px 0;text-align:right;white-space:nowrap;color:#1F6B42">+' + k(o.appFee) + '</td>' +
    '<td style="padding:5px 8px 5px 0;text-align:right;white-space:nowrap;color:#9B2C2C">−' + k(o.stripeFee) + '</td>' +
    '<td style="padding:5px 0;text-align:right;white-space:nowrap;font-weight:600">' + k(o.margin) + '</td></tr>').join('');
  const html = '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:0 auto;color:#161B26">' +
    '<div style="background:#0F3D6E;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0">' +
      '<div style="font-size:13px;opacity:.85">Queenie89 AB · Q89 Pay · plattformsrapport</div>' +
      '<div style="font-size:21px;font-weight:600;margin-top:2px">' + date + '</div>' +
      '<div style="font-size:30px;font-weight:700;margin-top:10px">' + k(d.profit) + '</div>' +
      '<div style="font-size:13px;opacity:.85">resultat · ' + d.appFeeCount + ' avgifter · ' + String(d.marginPct).replace('.', ',') + ' % av ' + k(d.charges) + '</div></div>' +
    '<div style="border:1px solid #e5e7eb;border-top:0;padding:14px 22px 20px;border-radius:0 0 12px 12px">' +
    '<h3 style="margin:6px 0;font-size:15px">Resultat</h3><table style="border-collapse:collapse;width:100%;font-size:15px">' +
      tr('Q89-avgifter (4 % + 2 kr)', '+' + k(d.appFees)) +
      (d.appFeeRefunds ? tr('Återbetalda Q89-avgifter', '−' + k(d.appFeeRefunds)) : '') +
      tr('Stripes kortavgifter', '−' + k(d.stripeFees)) +
      (d.otherFees ? tr('Övriga Stripe-avgifter', '−' + k(d.otherFees)) : '') +
      tr('Resultat', k(d.profit), true) +
    '</table>' +
    '<h3 style="margin:18px 0 6px;font-size:15px">Pengar som passerar</h3><table style="border-collapse:collapse;width:100%;font-size:15px">' +
      tr('Kortbetalningar (' + d.chargeCount + ')', k(d.charges)) +
      tr('Återbetalt till kunder (' + d.refundCount + ')', '−' + k(d.refunds)) +
      tr('Överfört till restauranger', '−' + k(d.toRestaurants)) +
      (d.fromRestaurants ? tr('Tillbaka från restauranger (återbetalningar)', '+' + k(d.fromRestaurants)) : '') +
      (d.payouts ? tr('Utbetalt till Queenie89s bank', '−' + k(d.payouts)) : '') +
      tr('Nettoförändring Stripe-saldo', k(d.net), true) +
      tr('Saldo nu: tillgängligt / väntande', k(d.balance.available) + ' / ' + k(d.balance.pending)) +
    '</table>' +
    (orders ? '<h3 style="margin:18px 0 6px;font-size:15px">Order</h3><table style="border-collapse:collapse;width:100%;font-size:13px">' +
      '<tr style="color:#4B5261"><td>Tid</td><td>Order</td><td style="text-align:right">Belopp</td><td style="text-align:right">Q89</td><td style="text-align:right">Stripe</td><td style="text-align:right">Kvar</td></tr>' + orders + '</table>' : '<p>Inga kortbetalningar.</p>') +
    '<p style="margin-top:16px;font-size:12px;color:#4B5261">Källa: Stripes balanstransaktioner för plattformskontot ' + date + ' 00.00–24.00. Stripe betalar ut tillgängligt saldo enligt utbetalningsschemat.</p>' +
    '</div></div>';
  MailApp.sendEmail({ to: to, subject: '💼 Q89 Pay ' + date + ' · resultat ' + k(d.profit) + ' (' + d.appFeeCount + ' order)', htmlBody: html,
    body: 'Q89 Pay ' + date + '\nResultat: ' + k(d.profit) + '\nQ89-avgifter: ' + k(d.appFees) + '\nStripe-avgifter: ' + k(d.stripeFees) + '\nKortbetalningar: ' + k(d.charges), name: 'Q89 Pay' });
  return d;
}

/** Daglig trigger ~07.00: gårdagens rapport. Högst en gång per dag. */
function sendPlatformReport() {
  const props = PropertiesService.getScriptProperties(), y = addDays_(now_('yyyy-MM-dd'), -1);
  if (props.getProperty('PLATFORM_SENT') === y) return;
  try { platformMail_(y); props.setProperty('PLATFORM_SENT', y); log_('INFO', 'Plattformsrapport', 'skickad ' + y); }
  catch (e) { log_('WARN', 'Plattformsrapport', e.message); throw e; }
}

function platformReportEnable() {
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === 'sendPlatformReport') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('sendPlatformReport').timeBased().atHour(7).everyDays(1).inTimezone(APP.TZ).create();
  say_('Plattformsrapporten är PÅ ✅\n\nVarje morgon ca kl 07 kommer gårdagens rapport till ' + (prop_('PLATFORM_EMAIL') || '(PLATFORM_EMAIL saknas – fyll i den!)') + '.');
}
function platformReportDisable() {
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === 'sendPlatformReport') ScriptApp.deleteTrigger(t); });
  say_('Plattformsrapporten är AV.');
}
function platformReportTestToday() { const d = now_('yyyy-MM-dd'); platformMail_(d); say_('Plattformsrapport för idag (hittills) skickad till ' + prop_('PLATFORM_EMAIL')); }
function platformReportTestYesterday() { const d = addDays_(now_('yyyy-MM-dd'), -1); platformMail_(d); say_('Plattformsrapport för ' + d + ' skickad till ' + prop_('PLATFORM_EMAIL')); }
