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

/** Pågår happy hour just nu (en öppen dag)? Då gäller köksvyns förberedelsetid i stället för valfri tid. */
export function happyNow(now = nowLocal(), s = settings) {
  return !!hoursFor(now.date) && now.minutes >= s.happyHour.from * 60 && now.minutes < s.happyHour.to * 60;
}

/**
 * Hämtningstider för happy hour de närmaste dagarna.
 * → [{ date, times: ["16:00", "16:15", …] }]  (bara dagar med minst en tid)
 *   Beställer gästen UNDER happy hour blir idag { date, asap: true, times: [] }: hämtas så snart köket hinner
 *   (förberedelsetiden som chefen valt i köksvyn – samma som för alla beställningar den dagen).
 */
export function happySlots(now = nowLocal(), lead = settings.pickupLeadMinutes, s = settings) {
  const from = s.happyHour.from * 60, to = s.happyHour.to * 60, out = [];
  for (let i = 0; i <= (s.pickupDaysAhead ?? 3); i++) {
    const date = addDays(now.date, i), h = hoursFor(date);
    if (!h) continue;
    if (i === 0 && happyNow(now, s)) { out.push({ date, asap: true, times: [] }); continue; }
    const open = h[0] * 60, close = h[1] * 60;
    // Hela fönstret 16.00–17.00 (inklusive 17.00) kan väljas – idag bara tider som inte har passerat.
    // Köket ser happy hour-beställningar direkt när de kommer in, även de som läggs strax före.
    const earliest = Math.max(from, open, i === 0 ? now.minutes + 1 : 0);
    const times = [];
    for (let m = from; m <= Math.min(to, close); m += SLOT_STEP) if (m >= earliest) times.push(hhmm(m));
    if (times.length) out.push({ date, times });
  }
  return out;
}

/** Kontrollerar gästens val (eller väljer första lediga tid om inget valts). → { date, time } */
/** → { date, time } eller { date, asap: true } (under happy hour idag). null = inga tider, undefined = ogiltigt val. */
export function pickHappySlot(date, time, now = nowLocal(), lead = settings.pickupLeadMinutes) {
  const slots = happySlots(now, lead);
  if (!slots.length) return null;
  if (!date) date = slots[0].date;
  const day = slots.find(d => d.date === date);
  if (!day) return undefined;
  if (day.asap) return { date, asap: true };
  if (!time) return { date, time: day.times[0] };
  return day.times.includes(time) ? { date, time } : undefined;
}
