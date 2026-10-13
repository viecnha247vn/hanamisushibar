// Happy hour för HÄMTNING: rätterna kan beställas dygnet runt, alla dagar, men hämtas bara
// mellan happyHour.from och happyHour.to (16–17) en dag vi har öppet. Hela beställningen hämtas då.
// Bord (QR vid bordet) följer den gamla regeln: happy hour-rätter bara medan happy hour pågår.
//
// Samma regel finns i webbläsaren (src/meny.html, happySlots) – gästen väljer dag och tid bland
// de tider som returneras här, och servern godkänner bara en av dem.
import settings from "../data/settings.js";
import { nowLocal, addDays, hoursFor } from "./util.js";

export const isHappyId = id => String(id || "").startsWith("happy-");
export const SLOT_STEP = 15;
const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/**
 * Hämtningstider för happy hour de närmaste dagarna.
 * → [{ date, times: ["16:00", "16:15", …] }]  (bara dagar med minst en tid)
 */
export function happySlots(now = nowLocal(), lead = settings.pickupLeadMinutes, s = settings) {
  const from = s.happyHour.from * 60, to = s.happyHour.to * 60, out = [];
  for (let i = 0; i <= (s.pickupDaysAhead ?? 3); i++) {
    const date = addDays(now.date, i), h = hoursFor(date);
    if (!h) continue;
    const open = h[0] * 60, close = h[1] * 60;
    const earliest = Math.max(from, open + lead, i === 0 ? now.minutes + lead : 0);
    const times = [];
    for (let m = from; m < Math.min(to, close); m += SLOT_STEP) if (m >= earliest) times.push(hhmm(m));
    if (times.length) out.push({ date, times });
  }
  return out;
}

/** Kontrollerar gästens val (eller väljer första lediga tid om inget valts). → { date, time } */
export function pickHappySlot(date, time, now = nowLocal(), lead = settings.pickupLeadMinutes) {
  const slots = happySlots(now, lead);
  if (!slots.length) return null;
  if (!date && !time) return { date: slots[0].date, time: slots[0].times[0] };
  const day = slots.find(d => d.date === date);
  return day && day.times.includes(time) ? { date, time } : undefined;   // undefined = ogiltigt val
}
