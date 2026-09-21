/**
 * Beställningar och bokningar.
 * Vercel har redan kontrollerat format, öppettider och tider.
 * Här kontrolleras rätter och priser mot fliken Meny (enda sanningen).
 */

function createOrder_(p) {
  const menu = menuIndex_();
  if (!Array.isArray(p.items) || !p.items.length) throw new ApiError(400, 'Varukorgen är tom.');

  const lines = p.items.map(r => {
    const it = menu[String(r.id)];
    const qty = Math.floor(Number(r.qty));
    if (!it || !it.visible) throw new ApiError(400, 'En rätt finns inte längre på menyn. Ladda om sidan.');
    if (it.soldOut) throw new ApiError(409, it.name + ' är tyvärr slut idag. Ta bort den och försök igen.');
    if (!(it.price > 0)) throw new ApiError(400, it.name + ' kan inte beställas separat.');
    if (!(qty >= 1 && qty <= 50)) throw new ApiError(400, 'Ogiltigt antal.');
    const note = String(r.note == null ? '' : r.note).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 120);
    // Tillägg för byten i sushimix räknas av Vercel (lib/mix.js) och läggs på arkets pris
    const extra = r.extra == null ? 0 : Number(r.extra);
    if (!(Number.isInteger(extra) && extra >= 0 && extra <= 2000)) throw new ApiError(400, 'Ogiltigt tillägg.');
    const detail = String(r.detail == null ? '' : r.detail).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 240);
    return { id: it.id, name: it.name, categoryId: it.categoryId, qty: qty, price: it.price + extra,
             note: [detail, note].filter(String).join(' · ') };
  });
  const sum = lines.reduce((s, l) => s + l.qty * l.price, 0);
  // Dricks: gästen väljer procent eller egen summa. Räknas om här mot arkets priser.
  const tip = Math.round(Number(p.tip) || 0);
  if (!(tip >= 0 && tip <= 2000 && tip <= sum)) throw new ApiError(400, 'Ogiltig dricks.');
  const total = sum + tip;
  const isTable = p.kind === 'table';

  // Köket kan höja förberedelsetiden i köksvyn – kontrolleras här, där värdet bor
  if (!isTable) {
    const lead = lead_(), nowP = nowParts_(), m = toMin_(p.pickupTime);
    if (lead && p.pickupDate === nowP.date && !isNaN(m) && m < nowP.minutes + lead - 10)
      throw new ApiError(400, 'Köket behöver ' + lead + ' minuter just nu. Välj en senare hämtningstid.');
  }
  const no = nextNumber_('H');

  appendObject_(sheet_(SHEET.ORDERS), {
    'Mottagen': now_(),
    'Ordernr': no,
    'Typ': isTable ? 'Bord' : 'Hämtning',
    'Bord': isTable ? String(p.table) : '',
    'Hämtas datum': isTable ? '' : p.pickupDate,
    'Hämtas tid': isTable ? '' : p.pickupTime,
    'Namn': p.name || '',
    'Telefon': p.phone || '',
    'E-post': p.email || '',
    'Betalning': p.payment === 'kort' ? 'Kort i kassan' : 'Swish',
    'Beställning': lines.map(l => l.qty + ' × ' + l.name + (l.note ? '\n     ↳ ' + l.note : '')).join('\n'),
    'Dricks': tip || '',
    'Summa': total,
    'Kommentar': p.message || '',
    'Status': 'Ny',
    'Bekräftelse': '',
    'Utskriven': '',
    'Betald': '',
    'Rader (data)': JSON.stringify(lines)
  });

  const when = isTable ? 'Bord ' + p.table : 'Hämtas ' + p.whenText;
  notifyRestaurant_({
    subject: (isTable ? '🍽 Bord ' + p.table : '🛍 Hämtning ' + p.whenText) + ' · ' + no + ' · ' + total + ' kr',
    title: 'Ny beställning ' + no,
    rows: [['Typ', when], ['Namn', p.name || '–'], ['Telefon', pretty_(p.phone) || '–'],
           ['Betalning', p.payment === 'kort' ? 'Kort i kassan' : 'Swish'], ['E-post', p.email || '–'], ['Kommentar', p.message || '–']]
           .concat(tip ? [['Dricks', tip + ' kr']] : []),
    items: lines, tip: tip, total: total
  });
  if (!isTable) sms_(p.phone, SMS.orderReceived(no, p.whenText));
  if (p.email && mailOrderConfirmation_({ no: no, kind: p.kind, table: p.table, when: p.whenText, name: p.name,
        phone: p.phone, email: p.email, payment: p.payment, message: p.message, items: lines, tip: tip, total: total })) {
    setCell_(SHEET.ORDERS, 'Ordernr', no, 'Bekräftelse', now_('HH:mm'));
  }
  return { no: no, total: total };
}

function createBooking_(p) {
  const no = nextNumber_('B');
  appendObject_(sheet_(SHEET.BOOKINGS), {
    'Mottagen': now_(), 'Boknr': no, 'Datum': p.date, 'Tid': p.time, 'Gäster': Number(p.guests),
    'Namn': p.name, 'Telefon': p.phone, 'E-post': p.email || '', 'Meddelande': p.message || '', 'Status': 'Väntar', 'Bekräftelse': ''
  });
  notifyRestaurant_({
    subject: '📅 Bokning ' + no + ' · ' + p.whenText + ' · ' + p.guests + ' pers',
    title: 'Ny bokningsförfrågan ' + no,
    rows: [['När', p.whenText], ['Gäster', p.guests], ['Namn', p.name], ['Telefon', pretty_(p.phone)], ['E-post', p.email || '–'], ['Meddelande', p.message || '–']],
    footer: 'Bekräfta eller avböj i köksvyn eller i fliken Bokningar (kolumn Status). Gästen får sms automatiskt.'
  });
  sms_(p.phone, SMS.bookingReceived(no, p.guests, p.whenText));
  if (p.email && mailBookingConfirmation_({ no: no, when: p.whenText, guests: p.guests, name: p.name,
        phone: p.phone, email: p.email, message: p.message })) {
    setCell_(SHEET.BOOKINGS, 'Boknr', no, 'Bekräftelse', now_('HH:mm'));
  }
  return { no: no };
}

/* ---------------- lista till köksvyn ---------------- */

function listOrders_(date) {
  date = /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date : now_('yyyy-MM-dd');
  return rows_(sheet_(SHEET.ORDERS), 600)
    .filter(r => r['Hämtas datum'] === date || (r['Typ'] === 'Bord' && r['Mottagen'].indexOf(date) === 0))
    .map(r => ({
      no: r['Ordernr'], kind: r['Typ'] === 'Bord' ? 'table' : 'pickup', table: r['Bord'],
      pickupDate: r['Hämtas datum'], pickupTime: r['Hämtas tid'],
      received: r['Mottagen'], receivedTime: r['Mottagen'].slice(11, 16),
      name: r['Namn'], phone: pretty_(r['Telefon']), payment: r['Betalning'],
      items: safeJson_(r['Rader (data)']) || r['Beställning'].split('\n').map(t => ({ name: t, qty: '' })),
      total: Number(String(r['Summa']).replace(/\D/g, '')) || 0,
      message: r['Kommentar'], status: r['Status'], smsReady: r['Sms klar'], printed: r['Utskriven'], paid: !!r['Betald'],
      tip: Number(String(r['Dricks']).replace(/\D/g, '')) || 0
    }))
    .reverse();
}

function listBookings_(from) {
  from = /^\d{4}-\d{2}-\d{2}$/.test(from || '') ? from : now_('yyyy-MM-dd');
  return rows_(sheet_(SHEET.BOOKINGS))
    .filter(r => r['Datum'] >= from)
    .map(r => ({
      no: r['Boknr'], date: r['Datum'], time: r['Tid'], guests: Number(r['Gäster']) || 0,
      name: r['Namn'], phone: pretty_(r['Telefon']), message: r['Meddelande'],
      status: r['Status'], smsConfirmed: r['Sms bekräftad']
    }))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    .slice(0, 300);
}

/* ---------------- utskrift ---------------- */

/** Beställningar som inte skrivits ut ännu (bara dagens, max 20). */
function printQueue_() {
  const today = now_('yyyy-MM-dd');
  return rows_(sheet_(SHEET.ORDERS), 200)
    .filter(r => !r['Utskriven'] && r['Status'] !== 'Avbokad' && r['Mottagen'].indexOf(today) === 0)
    .slice(0, 20)
    .map(r => ({
      no: r['Ordernr'], kind: r['Typ'] === 'Bord' ? 'table' : 'pickup', table: r['Bord'],
      pickupDate: r['Hämtas datum'], pickupTime: r['Hämtas tid'], received: r['Mottagen'],
      name: r['Namn'], phone: pretty_(r['Telefon']), payment: r['Betalning'],
      items: safeJson_(r['Rader (data)']) || r['Beställning'].split('\n').map(t => ({ name: t, qty: '' })),
      total: Number(String(r['Summa']).replace(/\D/g, '')) || 0,
      message: r['Kommentar'], paid: !!r['Betald'],
      tip: Number(String(r['Dricks']).replace(/\D/g, '')) || 0
    }));
}

/** En beställning som utskriftsjobb (oavsett om den redan är utskriven – används av CloudPRNT när skrivaren hämtar jobbet). */
function printJob_(no) {
  const sh = sheet_(SHEET.ORDERS);
  const row = findRow_(sh, 'Ordernr', no);
  if (!row) throw new ApiError(404, 'Hittar inte ' + no + '.');
  const c = colMap_(sh), v = sh.getRange(row, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  const r = {}; Object.keys(c).forEach(k => { r[k] = v[c[k] - 1]; });
  return {
    no: r['Ordernr'], kind: r['Typ'] === 'Bord' ? 'table' : 'pickup', table: r['Bord'],
    pickupDate: r['Hämtas datum'], pickupTime: r['Hämtas tid'], received: r['Mottagen'],
    name: r['Namn'], phone: pretty_(r['Telefon']), payment: r['Betalning'],
    items: safeJson_(r['Rader (data)']) || r['Beställning'].split('\n').map(t => ({ name: t, qty: '' })),
    total: Number(String(r['Summa']).replace(/\D/g, '')) || 0,
    message: r['Kommentar'], status: r['Status'], paid: !!r['Betald'],
    tip: Number(String(r['Dricks']).replace(/\D/g, '')) || 0
  };
}

function markPrinted_(no, printed) {
  const sh = sheet_(SHEET.ORDERS);
  const row = findRow_(sh, 'Ordernr', no);
  if (!row) throw new ApiError(404, 'Hittar inte ' + no + '.');
  sh.getRange(row, colMap_(sh)['Utskriven']).setValue(printed ? now_('HH:mm') : '');
  return no;
}

/** Markerar en beställning som betald (eller tar bort markeringen). Köket ser det i köksvyn och på kvittot. */
function setPaid_(no, paid) {
  const sh = sheet_(SHEET.ORDERS);
  if (!findRow_(sh, 'Ordernr', no)) throw new ApiError(404, 'Hittar inte ' + no + '.');
  setCell_(SHEET.ORDERS, 'Ordernr', no, 'Betald', paid ? now_('HH:mm') : '');
  return { no: no, paid: !!paid };
}

function safeJson_(s) { try { return JSON.parse(s); } catch (e) { return null; } }

/* ---------------- status ---------------- */

function setStatus_(kind, no, status) {
  const isOrder = kind === 'order';
  if ((isOrder ? ORDER_STATUS : BOOKING_STATUS).indexOf(status) < 0) throw new ApiError(400, 'Ogiltig status.');
  const sh = sheet_(isOrder ? SHEET.ORDERS : SHEET.BOOKINGS);
  const row = findRow_(sh, isOrder ? 'Ordernr' : 'Boknr', no);
  if (!row) throw new ApiError(404, 'Hittar inte ' + no + '.');
  sh.getRange(row, colMap_(sh)['Status']).setValue(status);
  afterStatusChange_(sh, row, status);
  return { no: no, status: status };
}

/** Körs både från köksvyn och när personalen ändrar Status direkt i arket. */
function afterStatusChange_(sh, row, status) {
  const c = colMap_(sh);
  const v = sh.getRange(row, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  const get = name => v[c[name] - 1];

  if (sh.getName() === SHEET.ORDERS) {
    if (status === 'Klar' && get('Typ') === 'Hämtning' && get('Telefon') && !get('Sms klar')) {
      if (sms_(get('Telefon'), SMS.orderReady(get('Ordernr')))) sh.getRange(row, c['Sms klar']).setValue(now_('HH:mm'));
    }
    return;
  }
  if (sh.getName() === SHEET.BOOKINGS) {
    const when = whenText_(get('Datum'), get('Tid'));
    if (status === 'Bekräftad' && !get('Sms bekräftad')) {
      if (sms_(get('Telefon'), SMS.bookingConfirmed(get('Boknr'), get('Gäster'), when))) sh.getRange(row, c['Sms bekräftad']).setValue(now_('HH:mm'));
    }
    if (status === 'Avböjd') sms_(get('Telefon'), SMS.bookingDeclined(when));
  }
}

/** Installerbar onEdit-trigger (skapas av setup). */
function handleEdit(e) {
  try {
    const sh = e.range.getSheet();
    const name = sh.getName();
    if (name === SHEET.MENU) { clearMenuCache_(); return; }
    if (name !== SHEET.ORDERS && name !== SHEET.BOOKINGS) return;
    if (e.range.getRow() < 2 || e.range.getNumRows() > 1) return;
    if (e.range.getColumn() !== colMap_(sh)['Status']) return;
    afterStatusChange_(sh, e.range.getRow(), e.value);
  } catch (err) { log_('ERROR', 'handleEdit', err.stack || err.message); }
}

function whenText_(date, time) {
  const today = now_('yyyy-MM-dd');
  const tomorrow = Utilities.formatDate(new Date(Date.now() + 864e5), APP.TZ, 'yyyy-MM-dd');
  if (date === today) return 'idag kl ' + time;
  if (date === tomorrow) return 'imorgon kl ' + time;
  const d = new Date(date + 'T12:00:00');
  return ['sön', 'mån', 'tis', 'ons', 'tors', 'fre', 'lör'][d.getDay()] + ' ' + d.getDate() + '/' + (d.getMonth() + 1) + ' kl ' + time;
}
