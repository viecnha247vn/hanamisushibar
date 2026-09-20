import { nowLocal, addDays } from "./util.js";
const days = ["sön", "mån", "tis", "ons", "tors", "fre", "lör"];
/** "idag kl 18:15", "imorgon kl 12:00", "lör 20/9 kl 18:30" */
export function whenText(date, time) {
  const { date: today } = nowLocal();
  const d = new Date(date + "T12:00:00Z");
  const label = date === today ? "idag" : date === addDays(today, 1) ? "imorgon" : `${days[d.getUTCDay()]} ${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
  return `${label} kl ${time}`;
}
