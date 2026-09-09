// Pure functions: turn poll samples into online sessions and statistics.
//
// What Telegram gives us per poll:
//   online  -> the user is online right now (expires ~5 min after their client's last ping)
//   offline -> was_online is the EXACT second they went offline
// So session ENDS are exact. Session STARTS are only known to lie between two polls,
// and a session that started and ended between two polls shows up as a jump in was_online.
import type { Gap, Sample, Session } from "./types";
import { getTzParts, MS_PER_DAY } from "./time";

export const GAP_THRESHOLD_SEC = 20 * 60;
const ONLINE_TTL_SEC = 300;

export type Derived = {
  sessions: Session[];
  gaps: Gap[];
  trackingStart: number | null;
  lastSampleT: number | null;
  stale: boolean; // newest poll is older than GAP_THRESHOLD_SEC: we do not know the current state
  live: boolean; // newest poll is fresh and says online
  hidden: boolean; // saw "recently"/"week"/"month" samples: this person hides last seen
};

export function deriveSessions(samples: Sample[], nowSec: number): Derived {
  const sessions: Session[] = [];
  const gaps: Gap[] = [];
  let open: Session | null = null;
  let prev: Sample | null = null;
  let lastWo: number | null = null;
  let hidden = false;
  let n = 0;

  const close = (s: Session, end: number, exact: boolean) => {
    if (end <= s.start) end = s.start + 1;
    s.end = end;
    s.endExact = exact;
    sessions.push(s);
  };

  for (const cur of samples) {
    if (prev && cur.t - prev.t > GAP_THRESHOLD_SEC) {
      gaps.push({ from: prev.t, to: cur.t });
      if (open) {
        // We lost sight of them; assume the online status expired shortly after the last poll.
        close(open, Math.min(prev.ex ?? prev.t + ONLINE_TTL_SEC, cur.t), false);
        open = null;
      }
    }

    if (cur.s === "online") {
      if (!open) {
        let start: number;
        if (prev && cur.t - prev.t <= GAP_THRESHOLD_SEC) {
          start = Math.floor(prev.t + (cur.t - prev.t) / 2); // unbiased guess inside the poll gap
        } else {
          start = cur.t - 150;
        }
        if (lastWo != null && start <= lastWo) start = lastWo + 1;
        if (start >= cur.t) start = cur.t - 1;
        open = { id: `s${n++}`, start, startExact: false, end: null, endExact: false };
      }
    } else if (cur.s === "offline") {
      const wo = cur.wo;
      if (open) {
        const end = wo ?? (prev ? prev.t : cur.t);
        if (end <= open.start) {
          open.start = Math.max(lastWo != null ? lastWo + 1 : 0, end - 60);
          open.startExact = false;
        }
        close(open, end, wo != null);
        open = null;
      } else if (wo != null && lastWo != null && wo > lastWo && prev) {
        // A whole session happened between two polls: end exact, start unknown.
        const start = Math.min(Math.max(prev.t, wo - 60), wo - 1);
        sessions.push({ id: `s${n++}`, start, startExact: false, end: wo, endExact: true });
      }
      if (wo != null) lastWo = wo;
    } else {
      hidden = true;
      if (open) {
        close(open, prev ? prev.t : cur.t, false);
        open = null;
      }
    }
    prev = cur;
  }

  const last = samples[samples.length - 1] ?? null;
  const stale = !!last && nowSec - last.t > GAP_THRESHOLD_SEC;
  let live = false;
  if (open) {
    if (stale && last) {
      close(open, Math.min(last.ex ?? last.t + ONLINE_TTL_SEC, nowSec), false);
    } else {
      live = true;
      sessions.push(open);
    }
  }
  return { sessions, gaps, trackingStart: samples[0]?.t ?? null, lastSampleT: last?.t ?? null, stale, live, hidden };
}

export function sessionDuration(s: Session, nowSec: number): number {
  return Math.max(0, (s.end ?? nowSec) - s.start);
}

export type Stats = {
  totalSessions: number;
  totalSec: number;
  avgSec: number;
  longestSec: number;
  perDay: number;
  daysTracked: number; // fractional; < 1 during the first day
};

export function computeStats(sessions: Session[], nowSec: number, trackingStart: number | null): Stats {
  let total = 0;
  let longest = 0;
  let closedTotal = 0;
  let closedCount = 0;
  for (const s of sessions) {
    const d = sessionDuration(s, nowSec);
    total += d;
    if (d > longest) longest = d;
    if (s.end != null) {
      closedTotal += d;
      closedCount += 1;
    }
  }
  const daysTracked = trackingStart ? Math.max((nowSec - trackingStart) / 86400, 1 / 24) : 1 / 24;
  const perDayDenominator = Math.max(daysTracked, 1); // do not extrapolate a few hours into a full day
  return {
    totalSessions: sessions.length,
    totalSec: total,
    avgSec: closedCount ? closedTotal / closedCount : 0,
    longestSec: longest,
    perDay: sessions.length / perDayDenominator,
    daysTracked,
  };
}

// Average minutes online per hour of day (local time), over the tracked days. DST-safe:
// each chunk is clipped at the next local hour boundary using the real zone rules.
export function hourlyProfile(sessions: Session[], tz: string, nowSec: number, daysTracked: number): number[] {
  const buckets = new Array<number>(24).fill(0);
  for (const s of sessions) {
    const end = s.end ?? nowSec;
    let cursor = s.start;
    let guard = 0;
    while (cursor < end && guard++ < 20_000) {
      const p = getTzParts(new Date(cursor * 1000), tz);
      const secToNextHour = Math.max((60 - p.min) * 60 - (cursor % 60), 1);
      const chunkEnd = Math.min(end, cursor + secToNextHour);
      buckets[p.h] += (chunkEnd - cursor) / 60;
      cursor = chunkEnd;
    }
  }
  const days = Math.max(1, daysTracked);
  return buckets.map((m) => m / days);
}

export type DayRow = { key: string; label: string; sessions: number; minutes: number };

// Sessions and minutes per local calendar day for the last `days` days (oldest first).
export function dailySeries(sessions: Session[], tz: string, nowSec: number, days = 30): DayRow[] {
  const rows = new Map<string, DayRow>();
  const todayParts = getTzParts(new Date(nowSec * 1000), tz);
  const todayUtc = Date.UTC(todayParts.y, todayParts.m - 1, todayParts.d);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(todayUtc - i * MS_PER_DAY);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    rows.set(key, { key, label: `${d.getUTCMonth() + 1}/${d.getUTCDate()}`, sessions: 0, minutes: 0 });
  }
  for (const s of sessions) {
    const end = s.end ?? nowSec;
    const sp = getTzParts(new Date(s.start * 1000), tz);
    const startKey = `${sp.y}-${String(sp.m).padStart(2, "0")}-${String(sp.d).padStart(2, "0")}`;
    const row = rows.get(startKey);
    if (row) row.sessions += 1;
    let cursor = s.start;
    let guard = 0;
    while (cursor < end && guard++ < 400) {
      const cp = getTzParts(new Date(cursor * 1000), tz);
      const key = `${cp.y}-${String(cp.m).padStart(2, "0")}-${String(cp.d).padStart(2, "0")}`;
      const secsLeftInDay = Math.max((24 * 60 - (cp.h * 60 + cp.min)) * 60 - (cursor % 60), 1);
      const chunkEnd = Math.min(end, cursor + secsLeftInDay);
      const r = rows.get(key);
      if (r) r.minutes += (chunkEnd - cursor) / 60;
      cursor = chunkEnd;
    }
  }
  return [...rows.values()];
}

// Sessions started today and seconds online today, for the overview list.
export function todaySummary(sessions: Session[], tz: string, nowSec: number): { sessions: number; onlineSec: number } {
  const rows = dailySeries(sessions, tz, nowSec, 1);
  const today = rows[rows.length - 1];
  return { sessions: today?.sessions ?? 0, onlineSec: Math.round((today?.minutes ?? 0) * 60) };
}
