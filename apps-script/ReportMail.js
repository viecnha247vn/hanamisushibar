/**
 * Omsättningsrapport per e-post till ägaren.
 *   • Dagsrapport varje dag kl 20.05 (efter stängning 20.00).
 *   • Månadsrapport sista dagen i månaden, i samma veva.
 *
 * Exakt klockslag: Apps Scripts dagliga triggers går bara "ungefär" (±15 min). Därför körs scheduleReportMail
 * en gång mitt på dagen och lägger en ENGÅNGS-trigger på exakt 20.05 samma dag (sendReportMail).
 * Mottagare: skriptegenskapen REPORT_EMAIL (flera adresser med komma), annars NOTIFY_EMAIL.
 * Siffrorna räknas som i köksvyns Rapport (lib/report.js) – samma regler, även arkivet läses (Report.js).
 * Plattformsavgiften (Q89) ingår inte – den följs upp i Stripe.
 */
const REPORT_AT = { h: 20, m: 5 };

/* ---------------- summering (samma regler som lib/report.js) ---------------- */

function summarizeReport_(orders, vatPct) {
  const K = ['orders', 'gross', 'tips', 'refunded', 'online', 'swish', 'kassa', 'unpaid', 'pickup', 'table', 'cancelled'];
  const blank = () => K.reduce((o, k) => (o[k] = 0, o), {});
  const t = blank(), days = {};
  (orders || []).forEach(o => {
    const targets = [t, days[o.d] || (days[o.d] = blank())];
    if (o.status === 'Avbokad' && !o.online) { targets.forEach(x => x.cancelled++); return; }
    const amount = Number(o.total) || 0, tip = Number(o.tip) || 0, refunded = Math.min(Number(o.refunded) || 0, amount);
    const method = o.online ? 'online' : /swish/i.test(o.payment || '') ? 'swish' : 'kassa';
    targets.forEach(x => {
      x.orders++; x.gross += amount; x.tips += tip; x.refunded += refunded; x[method] += amount;
      x[o.kind === 'table' ? 'table' : 'pickup']++;
      if (!o.online && !o.paid) x.unpaid += amount;
    });
  });
  const fin = x => {
    x.net = x.gross - x.refunded;
    x.vat = Math.max(0, (x.net - x.tips) * vatPct / (100 + vatPct));
    x.avg = x.orders ? x.net / x.orders : 0;
    Object.keys(x).forEach(k => { x[k] = Math.round(x[k] * 100) / 100; });
    return x;
  };
  Object.keys(days).forEach(d => fin(days[d]));
  return { total: fin(t), days: days };
}

/* ---------------- e-post ---------------- */

const krR_ = n => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2).replace(/\.00$/, '').replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' kr';
const MONTHS_SV = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];

function reportRecipients_() { return prop_('REPORT_EMAIL') || prop_('NOTIFY_EMAIL'); }

/** Bygger och skickar en rapport för from–to. kind: 'dag' | 'månad'. Returnerar summeringen. */
function mailReport_(kind, from, to, title) {
  const to_ = reportRecipients_();
  if (!to_) { log_('WARN', 'Rapport-mejl', 'REPORT_EMAIL/NOTIFY_EMAIL saknas'); return null; }
  const data = reportOrders_(from, to), vat = Number(prop_('STRIPE_VAT_PCT', 6)) || 6;
  const r = summarizeReport_(data.orders, vat), t = r.total;
  const row = (k, v, strong) => '<tr><td style="padding:7px 14px 7px 0;color:#4B5261">' + k + '</td><td style="padding:7px 0;text-align:right;white-space:nowrap' + (strong ? ';font-weight:700' : '') + '">' + v + '</td></tr>';
  let daysTable = '';
  if (kind === 'månad') {
    const keys = Object.keys(r.days).sort(), max = Math.max.apply(null, keys.map(d => r.days[d].net).concat([1]));
    daysTable = '<h3 style="margin:22px 0 6px;font-size:15px">Per dag</h3><table style="border-collapse:collapse;width:100%;font-size:14px">' +
      keys.map(d => { const x = r.days[d], w = Math.round(x.net / max * 100);
        return '<tr><td style="padding:5px 10px 5px 0;white-space:nowrap">' + d.slice(8) + '/' + Number(d.slice(5, 7)) + '</td>' +
          '<td style="padding:5px 10px 5px 0;text-align:right;white-space:nowrap">' + x.orders + ' order</td>' +
          '<td style="padding:5px 10px 5px 0;text-align:right;white-space:nowrap">' + krR_(x.net) + '</td>' +
          '<td style="padding:5px 0;width:40%"><div style="height:10px;width:' + w + '%;background:#1873BC;border-radius:0 4px 4px 0"></div></td></tr>'; }).join('') +
      '</table>';
  }
  const site = prop_('SITE_URL');
  const html = '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#161B26">' +
    '<div style="background:#161B26;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0">' +
    '<div style="font-size:13px;opacity:.8">' + esc_(APP.NAME) + ' · ' + (kind === 'dag' ? 'Dagsrapport' : 'Månadsrapport') + '</div>' +
    '<div style="font-size:22px;font-weight:600;margin-top:2px">' + esc_(title) + '</div>' +
    '<div style="font-size:30px;font-weight:700;margin-top:10px">' + krR_(t.net) + '</div>' +
    '<div style="font-size:13px;opacity:.8">netto · ' + t.orders + ' order · snitt ' + krR_(t.avg) + '</div></div>' +
    '<div style="border:1px solid #e5e7eb;border-top:0;padding:14px 22px 20px;border-radius:0 0 12px 12px">' +
    '<table style="border-collapse:collapse;width:100%;font-size:15px">' +
      row('Online kort', krR_(t.online)) + row('Swish', krR_(t.swish)) + row('Kort i kassan', krR_(t.kassa)) +
      row('Dricks', krR_(t.tips)) + row('Återbetalt', krR_(t.refunded)) + row('Moms ' + vat + ' % (ingår)', krR_(t.vat)) +
      row('Hämtning / bord', t.pickup + ' / ' + t.table) + (t.cancelled ? row('Avbokade (räknas inte)', t.cancelled) : '') +
      (t.unpaid ? '<tr><td colspan="2" style="padding:10px 12px;background:#FFF8DB;border-radius:8px;font-size:14px">⚠️ <b>Ej markerad betald: ' + krR_(t.unpaid) + '</b> – Swish/kassa där köket inte bockat Betald. Stäm av mot Swish och kassan.</td></tr>' : '') +
    '</table>' + daysTable +
    (data.archive === 'error' ? '<p style="color:#9B2C2C;font-size:13px">Arkivet gick inte att läsa – äldre dagar kan saknas.</p>' : '') +
    '<p style="margin-top:18px;font-size:13px;color:#4B5261">Netto = brutto − återbetalt. Moms räknas på netto utan dricks. Datum = när beställningen togs emot.</p>' +
    (site ? '<a href="' + site + '/kok" style="display:inline-block;background:#161B26;color:#fff;padding:10px 16px;border-radius:999px;text-decoration:none;font-weight:600">Öppna Rapport i köksvyn</a>' : '') +
    '</div></div>';
  const text = [APP.NAME + ' – ' + title, 'Netto: ' + krR_(t.net) + ' (' + t.orders + ' order)', 'Online kort: ' + krR_(t.online),
    'Swish: ' + krR_(t.swish), 'Kort i kassan: ' + krR_(t.kassa), 'Dricks: ' + krR_(t.tips), 'Återbetalt: ' + krR_(t.refunded),
    'Moms ' + vat + ' %: ' + krR_(t.vat),
    t.unpaid ? 'Ej markerad betald: ' + krR_(t.unpaid) : ''].filter(Boolean).join('\n');
  MailApp.sendEmail({ to: to_, subject: (kind === 'dag' ? '📊 Dagsrapport ' : '📅 Månadsrapport ') + title + ' · ' + krR_(t.net), htmlBody: html, body: text, name: APP.NAME + ' rapport' });
  log_('INFO', 'Rapport-mejl', kind + ' ' + from + '–' + to + ' → ' + to_ + ' · netto ' + t.net);
  return r;
}

/* ---------------- schemaläggning ---------------- */

/** Engångstriggern kl 20.05: dagsrapport, och månadsrapport om det är månadens sista dag. Skickar högst en gång per dag. */
function sendReportMail() {
  const props = PropertiesService.getScriptProperties(), today = now_('yyyy-MM-dd');
  if (props.getProperty('REPORT_SENT') === today) return;
  props.setProperty('REPORT_SENT', today);
  try {
    const d = new Date(today + 'T12:00:00Z');
    mailReport_('dag', today, today, d.getUTCDate() + ' ' + MONTHS_SV[d.getUTCMonth()] + ' ' + d.getUTCFullYear());
    if (addDays_(today, 1).slice(0, 7) !== today.slice(0, 7))
      mailReport_('månad', today.slice(0, 8) + '01', today, MONTHS_SV[d.getUTCMonth()].replace(/^./, c => c.toUpperCase()) + ' ' + d.getUTCFullYear());
  } catch (e) { log_('ERROR', 'Rapport-mejl', e.stack || e.message); props.deleteProperty('REPORT_SENT'); throw e; }
}

/** Daglig trigger (~kl 12): lägger engångstriggern på exakt 20.05 idag. */
function scheduleReportMail() {
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === 'sendReportMail') ScriptApp.deleteTrigger(t); });
  const nowP = nowParts_(), target = REPORT_AT.h * 60 + REPORT_AT.m;
  if (nowP.minutes >= target) return false;
  const at = new Date(Math.floor(Date.now() / 60000) * 60000 + (target - nowP.minutes) * 60000);
  ScriptApp.newTrigger('sendReportMail').timeBased().at(at).create();
  return true;
}

/* ---------------- meny: Hanami → Rapporter ---------------- */

function reportMailEnable() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (['scheduleReportMail', 'sendReportMail'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('scheduleReportMail').timeBased().atHour(12).everyDays(1).inTimezone(APP.TZ).create();
  const today = scheduleReportMail();
  say_('E-postrapporter är PÅ ✅\n\nDagsrapport varje dag kl 20.05, månadsrapport sista dagen i månaden.\nMottagare: ' +
    (reportRecipients_() || '(saknas – fyll i REPORT_EMAIL eller NOTIFY_EMAIL)') + (today ? '\n\nFörsta rapporten kommer idag kl 20.05.' : '\n\nFörsta rapporten kommer imorgon kl 20.05.'));
}
function reportMailDisable() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (['scheduleReportMail', 'sendReportMail'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  say_('E-postrapporter är AV.');
}
function reportMailTestDay() {
  const today = now_('yyyy-MM-dd'); mailReport_('dag', today, today, 'idag (test) ' + today);
  say_('Dagsrapport skickad till ' + reportRecipients_());
}
function reportMailTestMonth() {
  const today = now_('yyyy-MM-dd'); mailReport_('månad', today.slice(0, 8) + '01', today, 'hittills denna månad (test)');
  say_('Månadsrapport skickad till ' + reportRecipients_());
}
