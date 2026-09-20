/**
 * Hanami Sushi Bar – backend i Google Apps Script
 * ------------------------------------------------------------
 * Arket är databasen. Webbplatsen (Vercel) anropar denna webbapp
 * med en hemlig nyckel. Alla hemligheter ligger i Skriptegenskaper
 * (Projektinställningar → Skriptegenskaper), aldrig i koden:
 *
 *   API_SECRET          delas med Vercel (GAS_SECRET) – skapas av setup()
 *   NOTIFY_EMAIL        dit nya beställningar mejlas (kommaseparerat)
 *   ELKS_USER           46elks API-användare  (tomt = inga sms)
 *   ELKS_PASSWORD       46elks API-lösenord
 *   SMS_FROM            avsändarnamn, max 11 tecken (standard "Hanami")
 *   VERCEL_DEPLOY_HOOK  URL från Vercel → Settings → Git → Deploy Hooks
 *   SITE_URL            t.ex. https://hanamisushibar.se
 */

const APP = {
  NAME: 'Hanami Sushi Bar',
  PHONE: '0431-472999',
  STREET: 'Östergatan 53',
  TZ: 'Europe/Stockholm'
};

const SHEET = {
  ORDERS: 'Beställningar',
  BOOKINGS: 'Bokningar',
  MENU: 'Meny',
  LOG: 'Logg'
};

const HEADERS = {
  ORDERS: ['Mottagen', 'Ordernr', 'Typ', 'Bord', 'Hämtas datum', 'Hämtas tid', 'Namn', 'Telefon', 'E-post', 'Betalning',
           'Beställning', 'Summa', 'Kommentar', 'Status', 'Sms klar', 'Bekräftelse', 'Utskriven', 'Betald', 'Rader (data)'],
  BOOKINGS: ['Mottagen', 'Boknr', 'Datum', 'Tid', 'Gäster', 'Namn', 'Telefon', 'E-post', 'Meddelande', 'Status', 'Sms bekräftad', 'Bekräftelse'],
  MENU: ['Kategori-id', 'Kategori', 'Kategoritext', 'Id', 'Namn', 'Pris', 'Beskrivning', 'Visas på webben', 'Slut idag'],
  LOG: ['Tid', 'Nivå', 'Händelse', 'Detaljer']
};

const ORDER_STATUS = ['Ny', 'Tillagas', 'Klar', 'Hämtad', 'Serverad', 'Avbokad'];
const BOOKING_STATUS = ['Väntar', 'Bekräftad', 'Avböjd', 'Avbokad'];

const STATUS_COLORS = {
  ORDERS: { 'Ny': '#FFF3C4', 'Tillagas': '#DCEBFF', 'Klar': '#D6F5DD', 'Hämtad': '#EFEFEF', 'Serverad': '#EFEFEF', 'Avbokad': '#F9D6D3' },
  BOOKINGS: { 'Väntar': '#FFF3C4', 'Bekräftad': '#D6F5DD', 'Avböjd': '#F9D6D3', 'Avbokad': '#EFEFEF' }
};

function prop_(key, fallback) {
  const v = PropertiesService.getScriptProperties().getProperty(key);
  return v == null || v === '' ? (fallback === undefined ? '' : fallback) : v;
}
