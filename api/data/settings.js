// Öppettider och regler. Används av både webbplatsen (vid bygget) och servern.
export default {
  name: "Hanami Sushi Bar",
  phone: "0431-472999",
  address: "Östergatan 53, 262 31 Ängelholm",
  siteHost: "hanamisushibar.se",
  timezone: "Europe/Stockholm",
  // veckodag (0 = söndag) -> [öppnar, stänger] i hela timmar, null = stängt
  hours: { 0: null, 1: [11, 20], 2: [11, 20], 3: [11, 20], 4: [11, 20], 5: [11, 20], 6: [12, 20] },
  // enstaka stängda dagar, t.ex. helgdagar: ["2026-12-24", "2026-12-25"]
  closedDates: [],
  lunch: { days: [1, 2, 3, 4, 5], from: 11, to: 14 },
  happyHour: { from: 16, to: 17 },
  pickupLeadMinutes: 30,   // tidigaste hämtning från nu
  pickupDaysAhead: 3,      // hur många dagar framåt man kan beställa
  bookingDaysAhead: 60,
  maxBookingGuests: 8,
  tableCount: 12,          // antal bord (för QR-koder i köksvyn)
  receiptWidth: 42         // tecken per rad på kvittoskrivaren (Epson TM-T88VII: 42, Star mC-Print3 / Epson TM-T20III: 48)
};
