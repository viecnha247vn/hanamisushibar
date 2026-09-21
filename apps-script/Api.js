/**
 * Webbapp: all trafik kommer från Vercel som POST med { secret, action, payload }.
 * Svar: { ok: true, ...data } eller { ok: false, status, error }.
 */

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function doPost(e) {
  let req = {};
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    checkSecret_(req.secret);
    const handler = ACTIONS[req.action];
    if (!handler) throw new ApiError(400, 'Okänd action: ' + req.action);
    return json_(Object.assign({ ok: true }, handler(req.payload || {})));
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) log_('ERROR', 'API ' + (req.action || '?'), (err.stack || err.message));
    return json_({ ok: false, status: status, error: err.message });
  }
}

function doGet() {
  return json_({ ok: true, service: APP.NAME, time: now_() });
}

const ACTIONS = {
  health:        () => ({ sheet: SpreadsheetApp.getActive().getName(), time: now_(), sms: !!prop_('ELKS_USER'), email: !!prop_('NOTIFY_EMAIL') }),
  menu:          () => ({ menu: menuForWeb_() }),
  availability:  () => ({ items: availability_(), leadMinutes: lead_() }),
  order:         p => withLock_(() => createOrder_(p)),
  booking:       p => withLock_(() => createBooking_(p)),
  adminOrders:   p => ({ orders: listOrders_(p.date), sheetUrl: SpreadsheetApp.getActive().getUrl() }),
  adminBookings: p => ({ bookings: listBookings_(p.from), sheetUrl: SpreadsheetApp.getActive().getUrl() }),
  adminStatus:   p => withLock_(() => setStatus_(p.kind, p.no, p.status)),
  adminMenu:     () => ({ menu: menuForKitchen_() }),
  adminSoldOut:  p => withLock_(() => setSoldOut_(p.id, !!p.soldOut)),
  adminLead:     p => withLock_(() => setLead_(p.minutes)),
  applyMenuPatches: p => withLock_(() => applyMenuPatches_(p.patches)),
  adminPaid:     p => withLock_(() => setPaid_(p.no, !!p.paid)),
  adminSettings: () => ({ leadMinutes: lead_() }),
  // skrivarbryggan (print-bridge/)
  printQueue:    () => ({ jobs: printQueue_() }),
  printJob:      p => ({ job: printJob_(p.no) }),
  printDone:     p => ({ no: markPrinted_(p.no, true) }),
  printAgain:    p => ({ no: markPrinted_(p.no, false) })
};

function checkSecret_(given) {
  const real = prop_('API_SECRET');
  if (!real) throw new ApiError(500, 'API_SECRET saknas. Kör setup().');
  // jämför hash för konstant tid
  const h = s => Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s || '')));
  if (h(given) !== h(real)) throw new ApiError(401, 'Obehörig.');
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new ApiError(503, 'Många beställningar just nu. Försök igen om en stund.');
  try { return fn(); } finally { lock.releaseLock(); }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function now_(fmt) { return Utilities.formatDate(new Date(), APP.TZ, fmt || 'yyyy-MM-dd HH:mm'); }

function log_(level, event, details) {
  try {
    const sh = sheet_(SHEET.LOG);
    sh.appendRow([now_('yyyy-MM-dd HH:mm:ss'), level, event, String(details || '').slice(0, 5000)]);
    if (sh.getLastRow() > 3000) sh.deleteRows(2, 500);
  } catch (e) { console.error(e); }
}
