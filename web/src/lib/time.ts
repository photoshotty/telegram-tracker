// Time-zone and formatting helpers. The weekly grid runs Mon..Sun with each day
// starting at 4 AM so a late-night session stays on the evening it belongs to.
export const TOTAL_MIN = 24 * 60;
export const ROW_COUNT = 12;
export const ROW_PX = 36;
export const BODY_PX = ROW_COUNT * ROW_PX;
export const WD_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const MS_PER_DAY = 86_400_000;
export const DAY_START_HOUR = 4;
export const DAY_START_MIN = DAY_START_HOUR * 60;

export type TzParts = { y: number; m: number; d: number; h: number; min: number; weekday: number };

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmtFor(timeZone: string): Intl.DateTimeFormat {
  let f = fmtCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      weekday: "short",
    });
    fmtCache.set(timeZone, f);
  }
  return f;
}

export function getTzParts(date: Date, timeZone: string): TzParts {
  const parts = fmtFor(timeZone).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wdMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return {
    y: parseInt(get("year"), 10),
    m: parseInt(get("month"), 10),
    d: parseInt(get("day"), 10),
    h: parseInt(get("hour"), 10) % 24,
    min: parseInt(get("minute"), 10),
    weekday: wdMap[get("weekday")] ?? 1,
  };
}

export const pad2 = (n: number) => String(n).padStart(2, "0");
export const dayKey = (p: { y: number; m: number; d: number }) => `${p.y}-${pad2(p.m)}-${pad2(p.d)}`;
export const dayKeyFromUtcMidnight = (d: Date) =>
  `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;

export function bcDayParts(p: TzParts): { y: number; m: number; d: number } {
  if (p.h >= DAY_START_HOUR) return { y: p.y, m: p.m, d: p.d };
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d) - MS_PER_DAY);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

export const visibleMinFromClock = (h: number, m: number) => (h * 60 + m - DAY_START_MIN + TOTAL_MIN) % TOTAL_MIN;

export function parseDayKey(k: string) {
  const [y, m, d] = k.split("-").map((s) => parseInt(s, 10));
  return { y, m, d };
}

export function formatHourLabel(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour === 12) return "12 PM";
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
}

const US_TZ_RE =
  /^America\/(?:New_York|Detroit|Kentucky\/|Indiana\/|Chicago|Menominee|North_Dakota\/|Denver|Boise|Phoenix|Los_Angeles|Anchorage|Juneau|Sitka|Metlakatla|Yakutat|Nome|Adak)/;
export const isUsTimezone = (tz: string | null | undefined) => !!tz && (tz === "Pacific/Honolulu" || US_TZ_RE.test(tz));

export function formatHourMinute(hour: number, minute: number, tz: string): string {
  if (!isUsTimezone(tz)) return `${pad2(hour)}:${pad2(minute)}`;
  const period = hour >= 12 ? "PM" : "AM";
  let h12 = hour % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${pad2(minute)} ${period}`;
}

export function buildWeek(weekOffset: number, tz: string, now: Date) {
  const todayBc = bcDayParts(getTzParts(now, tz));
  const bcUtc = Date.UTC(todayBc.y, todayBc.m - 1, todayBc.d);
  const wd = new Date(bcUtc).getUTCDay();
  const weekday = wd === 0 ? 7 : wd;
  const baseUtc = bcUtc - (weekday - 1) * MS_PER_DAY + weekOffset * 7 * MS_PER_DAY;
  const keys: string[] = [];
  const headers: { weekday: string; date: string; isToday: boolean }[] = [];
  const todayKey = dayKey(todayBc);
  for (let i = 0; i < 7; i++) {
    const dt = new Date(baseUtc + i * MS_PER_DAY);
    const key = dayKeyFromUtcMidnight(dt);
    keys.push(key);
    headers.push({ weekday: WD_NAMES[i], date: `${dt.getUTCMonth() + 1}/${dt.getUTCDate()}`, isToday: key === todayKey });
  }
  return { keys, headers };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function rangeLabel(keys: string[]): string {
  const a = parseDayKey(keys[0]);
  const b = parseDayKey(keys[6]);
  if (a.y === b.y && a.m === b.m) return `${MONTHS[a.m - 1]} ${a.d} – ${b.d}, ${a.y}`;
  if (a.y === b.y) return `${MONTHS[a.m - 1]} ${a.d} – ${MONTHS[b.m - 1]} ${b.d}, ${a.y}`;
  return `${MONTHS[a.m - 1]} ${a.d}, ${a.y} – ${MONTHS[b.m - 1]} ${b.d}, ${b.y}`;
}

export function formatDuration(sec: number): string {
  if (sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.floor(sec)}s`;
}

export function formatHours(sec: number): string {
  if (sec <= 0) return "0";
  const hours = sec / 3600;
  if (hours < 10) return hours.toFixed(1);
  return Math.round(hours).toString();
}

export function formatTimeAgo(date: Date, now: Date = new Date()): string {
  const diff = now.getTime() - date.getTime();
  if (diff < 0) return "just now";
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk}w ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(day / 365)}y ago`;
}

export function formatDateTimeInTz(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
  }
}

export function formatTimeInTz(date: Date, timeZone: string): string {
  const p = getTzParts(date, timeZone);
  return formatHourMinute(p.h, p.min, timeZone);
}
