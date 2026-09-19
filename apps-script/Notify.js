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
