/** E-post till restaurangen och sms till gästen. Fel loggas men stoppar aldrig en beställning. */

const SMS = {
  orderReceived: (no, when) => APP.NAME + ': Tack! Vi har tagit emot din beställning ' + no + ', hämtas ' + when + '. Du får sms när maten är klar.',
  orderReady: no => APP.NAME + ': Din beställning ' + no + ' är klar att hämtas på ' + APP.STREET + '. Välkommen!',
  bookingReceived: (no, guests, when) => APP.NAME + ': Vi har fått din bokningsförfrågan ' + no + ', ' + guests + ' pers ' + when + '. Vi bekräftar med sms inom kort.',
  bookingConfirmed: (no, guests, when) => APP.NAME + ': Ditt bord är bokat! ' + guests + ' pers ' + when + '. Boknr ' + no + '. ' + APP.STREET + ', Ängelholm. Välkommen!',
  bookingDeclined: when => APP.NAME + ': Tyvärr är det fullbokat ' + when + '. Ring oss på ' + APP.PHONE + ' så hittar vi en annan tid.'
};

function esc_(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function notifyRestaurant_(o) {
  const to = prop_('NOTIFY_EMAIL');
  if (!to) return;
  const site = prop_('SITE_URL');
  const rows = (o.rows || []).map(r =>
    '<tr><td style="padding:6px 14px 6px 0;color:#6b7280;white-space:nowrap;vertical-align:top">' + esc_(r[0]) +
    '</td><td style="padding:6px 0">' + esc_(r[1]) + '</td></tr>').join('');
  const items = o.items ? '<table style="border-collapse:collapse;width:100%;margin-top:18px;font-size:15px">' +
    o.items.map(i => '<tr><td style="padding:8px 0;border-top:1px solid #e5e7eb"><b>' + i.qty + ' ×</b> ' + esc_(i.name) +
      (i.note ? '<div style="color:#B45309;font-size:13px;margin-top:2px">↳ ' + esc_(i.note) + '</div>' : '') +
      (i.note ? '<div style="color:#b45309;font-size:13px;margin-top:2px">↳ ' + esc_(i.note) + '</div>' : '') +
      '</td><td style="padding:8px 0;border-top:1px solid #e5e7eb;text-align:right;white-space:nowrap">' + (i.qty * i.price) + ' kr</td></tr>').join('') +
    '<tr><td style="padding:12px 0;border-top:2px solid #161B26;font-size:18px"><b>Summa</b></td>' +
    '<td style="padding:12px 0;border-top:2px solid #161B26;text-align:right;font-size:18px"><b>' + o.total + ' kr</b></td></tr></table>' : '';
  const html =
    '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#161B26">' +
    '<div style="background:#1873BC;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0">' +
    '<div style="font-size:13px;opacity:.85">' + esc_(APP.NAME) + '</div><div style="font-size:22px;font-weight:600">' + esc_(o.title) + '</div></div>' +
    '<div style="border:1px solid #e5e7eb;border-top:0;padding:18px 22px;border-radius:0 0 12px 12px">' +
    '<table style="border-collapse:collapse;font-size:15px">' + rows + '</table>' + items +
    (o.footer ? '<p style="margin-top:18px;font-size:13px;color:#6b7280">' + esc_(o.footer) + '</p>' : '') +
    '<p style="margin-top:18px">' +
    (site ? '<a href="' + site + '/kok" style="display:inline-block;background:#161B26;color:#fff;padding:10px 16px;border-radius:999px;text-decoration:none;font-weight:600;margin-right:8px">Köksvyn</a>' : '') +
    '<a href="' + SpreadsheetApp.getActive().getUrl() + '" style="color:#1873BC">Öppna arket</a></p></div></div>';
  const text = [o.title].concat((o.rows || []).map(r => r[0] + ': ' + r[1]),
    (o.items || []).map(i => i.qty + ' × ' + i.name), o.total != null ? ['Summa: ' + o.total + ' kr'] : []).join('\n');
  try {
    MailApp.sendEmail({ to: to, subject: o.subject, htmlBody: html, body: text, name: APP.NAME + ' webb' });
  } catch (err) { log_('WARN', 'E-post misslyckades', err.message); }
}

/* ---------------- bekräftelse till gästen ---------------- */

/** Gemensamt skal för gästmejl. All stil inbäddad – e-postklienter stöder inte extern CSS. */
function guestMail_(o) {
  const site = prop_('SITE_URL');
  return '<div style="background:#FCF9F8;padding:24px 0;font-family:-apple-system,Segoe UI,Roboto,sans-serif">' +
    '<div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #F0D9E1;border-radius:4px;overflow:hidden">' +
      '<div style="padding:22px 26px;border-bottom:1px solid #F0D9E1;text-align:center">' +
        '<div style="font:italic 400 26px/1 Georgia,serif;color:#9A7732">' + esc_(APP.NAME) + '</div>' +
        '<div style="font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:#1873BC;margin-top:8px">' + esc_(o.eyebrow) + '</div>' +
      '</div>' +
      '<div style="padding:26px">' + o.body + '</div>' +
      '<div style="padding:18px 26px;border-top:1px solid #F0D9E1;color:#7A8794;font-size:13px;text-align:center">' +
        esc_(APP.STREET) + ' · Ängelholm<br>' +
        '<a href="tel:' + esc_(APP.PHONE) + '" style="color:#1873BC;text-decoration:none">' + esc_(APP.PHONE) + '</a>' +
        (site ? ' · <a href="' + site + '" style="color:#1873BC;text-decoration:none">' + site.replace(/^https?:\/\//, '') + '</a>' : '') +
      '</div>' +
    '</div></div>';
}

function sendGuestMail_(to, subject, html, text) {
  if (!to) return false;
  try {
    MailApp.sendEmail({ to: to, subject: subject, htmlBody: html, body: text, name: APP.NAME, replyTo: prop_('NOTIFY_EMAIL') || undefined });
    return true;
  } catch (err) { log_('WARN', 'Bekräftelse till gäst misslyckades', err.message); return false; }
}

/** Kvittensmejl efter en beställning. */
function mailOrderConfirmation_(o) {
  const isTable = o.kind === 'table';
  const rows = o.items.map(i =>
    '<tr><td style="padding:10px 0;border-top:1px solid #EFE7E9">' +
      '<b style="color:#1B2A3A">' + i.qty + ' × ' + esc_(i.name) + '</b>' +
      (i.note ? '<div style="color:#4C5B6B;font-size:13px;margin-top:3px">↳ ' + esc_(i.note) + '</div>' : '') +
    '</td><td style="padding:10px 0;border-top:1px solid #EFE7E9;text-align:right;white-space:nowrap;color:#9A7732">' +
      (i.qty * i.price) + ' kr</td></tr>').join('');
  const body =
    '<p style="margin:0 0 6px;color:#4C5B6B">Tack ' + esc_(o.name || '') + '! Vi har tagit emot din beställning.</p>' +
    '<div style="font:400 30px/1.2 Georgia,serif;color:#0F3D6E;margin:14px 0 4px">' + esc_(o.no) + '</div>' +
    '<div style="font-size:15px;color:#1B2A3A;margin-bottom:18px">' +
      (isTable ? 'Bord ' + esc_(o.table) + ' – maten kommer till bordet.' : 'Hämtas ' + esc_(o.when) + ' på ' + esc_(APP.STREET) + '.') + '</div>' +
    '<table style="width:100%;border-collapse:collapse;font-size:15px">' + rows +
      '<tr><td style="padding:12px 0;border-top:2px solid #1B2A3A;font-size:17px"><b>Summa</b></td>' +
      '<td style="padding:12px 0;border-top:2px solid #1B2A3A;text-align:right;font-size:17px"><b>' + o.total + ' kr</b></td></tr></table>' +
    (o.message ? '<div style="margin-top:16px;background:#FBEEF2;border-radius:3px;padding:12px 14px;font-size:14px;color:#1B2A3A"><b>Meddelande till köket:</b><br>' + esc_(o.message) + '</div>' : '') +
    '<p style="margin:18px 0 0;color:#4C5B6B;font-size:14px">Betalning: ' +
      (o.payment === 'kort' ? 'kort i kassan' : 'Swish') + (isTable ? ' när ni går' : ' vid hämtning') + '.</p>' +
    '<p style="margin:10px 0 0;color:#7A8794;font-size:13px">Behöver du ändra eller avboka? Ring oss på ' + esc_(APP.PHONE) + ' så löser vi det.</p>';
  const text = [APP.NAME, 'Bestallning ' + o.no,
    isTable ? 'Bord ' + o.table : 'Hamtas ' + o.when].concat(
    o.items.map(i => i.qty + ' x ' + i.name + (i.note ? ' (' + i.note + ')' : '')),
    ['Summa: ' + o.total + ' kr', APP.STREET + ', Angelholm', APP.PHONE]).join('\n');
  return sendGuestMail_(o.email,
    APP.NAME + ': bekräftelse ' + o.no + (isTable ? '' : ' – hämtas ' + o.when),
    guestMail_({ eyebrow: isTable ? 'Beställning till bordet' : 'Beställning för hämtning', body: body }), text);
}

/** Kvittensmejl efter en bordsbokning (förfrågan – bordet är inte bekräftat än). */
function mailBookingConfirmation_(o) {
  const body =
    '<p style="margin:0 0 6px;color:#4C5B6B">Tack ' + esc_(o.name) + '! Vi har tagit emot din bokningsförfrågan.</p>' +
    '<div style="font:400 30px/1.2 Georgia,serif;color:#0F3D6E;margin:14px 0 4px">' + esc_(o.no) + '</div>' +
    '<table style="font-size:15px;color:#1B2A3A;margin-top:10px">' +
      '<tr><td style="padding:4px 16px 4px 0;color:#7A8794">När</td><td>' + esc_(o.when) + '</td></tr>' +
      '<tr><td style="padding:4px 16px 4px 0;color:#7A8794">Sällskap</td><td>' + esc_(o.guests) + ' personer</td></tr>' +
      (o.message ? '<tr><td style="padding:4px 16px 4px 0;color:#7A8794">Meddelande</td><td>' + esc_(o.message) + '</td></tr>' : '') +
    '</table>' +
    '<div style="margin-top:18px;background:#FBEEF2;border-radius:3px;padding:12px 14px;font-size:14px;color:#1B2A3A">' +
      'Bordet är bokat först när du fått vår bekräftelse. Vi hör av oss så snart vi kan.</div>' +
    '<p style="margin:14px 0 0;color:#7A8794;font-size:13px">Behöver du ändra eller avboka? Ring oss på ' + esc_(APP.PHONE) + '.</p>';
  const text = [APP.NAME, 'Bokningsforfragan ' + o.no, o.when, o.guests + ' personer',
    'Bordet ar bokat forst nar du fatt var bekraftelse.', APP.STREET + ', Angelholm', APP.PHONE].join('\n');
  return sendGuestMail_(o.email, APP.NAME + ': bokningsförfrågan ' + o.no + ' – ' + o.when,
    guestMail_({ eyebrow: 'Bordsbokning', body: body }), text);
}

/** 46elks. Returnerar true om skickat. */
function sms_(to, message) {
  const user = prop_('ELKS_USER'), pass = prop_('ELKS_PASSWORD');
  if (!user || !pass || !to) return false;
  try {
    const res = UrlFetchApp.fetch('https://api.46elks.com/a1/sms', {
      method: 'post',
      payload: { from: prop_('SMS_FROM', 'Hanami'), to: String(to), message: message },
      headers: { Authorization: 'Basic ' + Utilities.base64Encode(user + ':' + pass) },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() >= 300) { log_('WARN', 'Sms misslyckades', res.getResponseCode() + ' ' + res.getContentText()); return false; }
    return true;
  } catch (err) { log_('WARN', 'Sms fel', err.message); return false; }
}
