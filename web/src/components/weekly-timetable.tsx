"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import type { Gap, Session } from "@/lib/types";
import { Button, Card, CardBody, CardHeader, IconButton, LiveDot, cn } from "./ui";
import {
  BODY_PX,
  DAY_START_HOUR,
  MS_PER_DAY,
  ROW_COUNT,
  ROW_PX,
  TOTAL_MIN,
  bcDayParts,
  buildWeek,
  dayKey,
  dayKeyFromUtcMidnight,
  formatDuration,
  formatHourLabel,
  formatHourMinute,
  getTzParts,
  rangeLabel,
  visibleMinFromClock,
} from "@/lib/time";

type Segment = {
  sessionId: string;
  segIndex: number;
  dayKey: string;
  startMin: number;
  endMin: number;
  isLive: boolean;
  startExact: boolean;
  endExact: boolean;
  startLabel: string;
  endLabel: string;
  durationSec: number;
};

type Overlay = { dayKey: string; startMin: number; endMin: number };

// Split an interval [startSec, endSec) into per-"broadcast day" minute ranges.
function splitInterval(
  startSec: number,
  endSec: number,
  tz: string,
  weekKeys: Set<string>,
  push: (k: string, sm: number, em: number) => void,
) {
  if (endSec <= startSec) return;
  const sParts = getTzParts(new Date(startSec * 1000), tz);
  const eParts = getTzParts(new Date(endSec * 1000), tz);
  const sBc = bcDayParts(sParts);
  const eBc = bcDayParts(eParts);
  const sKey = dayKey(sBc);
  const eKey = dayKey(eBc);
  const sVis = visibleMinFromClock(sParts.h, sParts.min);
  const eVis = visibleMinFromClock(eParts.h, eParts.min);
  const guarded = (k: string, sm: number, em: number) => {
    if (!weekKeys.has(k) || em <= sm) return;
    push(k, sm, em);
  };
  if (sKey === eKey) {
    guarded(sKey, sVis, Math.max(eVis, sVis + 1));
    return;
  }
  guarded(sKey, sVis, TOTAL_MIN);
  let cursor = new Date(Date.UTC(sBc.y, sBc.m - 1, sBc.d) + MS_PER_DAY);
  for (let i = 0; i < 60; i++) {
    const k = dayKeyFromUtcMidnight(cursor);
    if (k === eKey) {
      guarded(k, 0, eVis);
      break;
    }
    guarded(k, 0, TOTAL_MIN);
    cursor = new Date(cursor.getTime() + MS_PER_DAY);
  }
}

export function WeeklyTimetable({
  sessions,
  gaps,
  tz,
  trackingStart,
}: {
  sessions: Session[];
  gaps: Gap[];
  tz: string;
  trackingStart: number | null;
}) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [now, setNow] = useState<Date>(() => new Date());
  const hasLive = sessions.some((s) => s.end === null);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, [hasLive]);

  const week = useMemo(() => buildWeek(weekOffset, tz, now), [weekOffset, tz, now]);
  const weekKeySet = useMemo(() => new Set(week.keys), [week.keys]);
  const nowSec = Math.floor(now.getTime() / 1000);

  const segmentsByDay = useMemo(() => {
    const map: Record<string, Segment[]> = {};
    for (const k of week.keys) map[k] = [];
    for (const s of sessions) {
      const end = s.end ?? nowSec;
      const sp = getTzParts(new Date(s.start * 1000), tz);
      const ep = getTzParts(new Date(end * 1000), tz);
      const meta = {
        sessionId: s.id,
        isLive: s.end === null,
        startExact: s.startExact,
        endExact: s.endExact,
        startLabel: formatHourMinute(sp.h, sp.min, tz),
        endLabel: s.end === null ? "now" : formatHourMinute(ep.h, ep.min, tz),
        durationSec: end - s.start,
      };
      let i = 0;
      splitInterval(s.start, end, tz, weekKeySet, (k, sm, em) => {
        map[k].push({ ...meta, dayKey: k, startMin: sm, endMin: em, segIndex: i++ });
      });
    }
    return map;
  }, [sessions, nowSec, tz, weekKeySet, week.keys]);

  const gapsByDay = useMemo(() => {
    const map: Record<string, Overlay[]> = {};
    for (const k of week.keys) map[k] = [];
    for (const g of gaps) {
      splitInterval(g.from, g.to, tz, weekKeySet, (k, sm, em) => map[k].push({ dayKey: k, startMin: sm, endMin: em }));
    }
    return map;
  }, [gaps, tz, weekKeySet, week.keys]);

  const totalThisWeek = useMemo(() => {
    let minutes = 0;
    const seen = new Set<string>();
    for (const k of week.keys) {
      for (const seg of segmentsByDay[k] || []) {
        minutes += seg.endMin - seg.startMin;
        seen.add(seg.sessionId);
      }
    }
    return { count: seen.size, sec: minutes * 60 };
  }, [segmentsByDay, week.keys]);

  const nowParts = getTzParts(now, tz);
  const nowKey = dayKey(bcDayParts(nowParts));
  const nowMin = visibleMinFromClock(nowParts.h, nowParts.min);

  const trackAnchor = useMemo(() => {
    if (!trackingStart) return null;
    const parts = getTzParts(new Date(trackingStart * 1000), tz);
    return { key: dayKey(bcDayParts(parts)), min: visibleMinFromClock(parts.h, parts.min) };
  }, [trackingStart, tz]);

  const isCurrentWeek = weekOffset === 0;

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center gap-3">
        <CalendarDays className="h-4 w-4 text-neutral-500" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-300">Weekly schedule</h2>
        <div className="ml-1 hidden text-xs text-neutral-500 sm:block">
          {totalThisWeek.count} session{totalThisWeek.count === 1 ? "" : "s"}
          {totalThisWeek.sec > 0 ? ` · ${formatDuration(totalThisWeek.sec)}` : ""}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <IconButton onClick={() => setWeekOffset((v) => v - 1)} aria-label="Previous week">
            <ChevronLeft className="h-4 w-4" />
          </IconButton>
          <div className="min-w-[12rem] text-center text-sm font-medium tabular-nums text-neutral-200">
            {rangeLabel(week.keys)}
          </div>
          <IconButton
            onClick={() => setWeekOffset((v) => Math.min(0, v + 1))}
            aria-label="Next week"
            disabled={isCurrentWeek}
            className={isCurrentWeek ? "opacity-30" : ""}
          >
            <ChevronRight className="h-4 w-4" />
          </IconButton>
          <Button onClick={() => setWeekOffset(0)} disabled={isCurrentWeek} className={isCurrentWeek ? "opacity-50" : ""}>
            Today
          </Button>
        </div>
      </CardHeader>
      <CardBody className="p-3 sm:p-4">
        <div className="grid" style={{ gridTemplateColumns: "3.25rem minmax(0, 1fr)" }}>
          <div />
          <div className="grid" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
            {week.headers.map((h) => (
              <div
                key={h.weekday + h.date}
                className={cn("px-2 pb-2 text-xs", h.isToday ? "font-semibold text-neutral-100" : "text-neutral-400")}
              >
                <span className="uppercase tracking-wider">{h.weekday}</span>
                <span className="ml-1.5 tabular-nums text-neutral-500">{h.date}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative grid" style={{ gridTemplateColumns: "3.25rem minmax(0, 1fr)", height: BODY_PX }}>
          <div className="relative">
            {Array.from({ length: ROW_COUNT }).map((_, i) => (
              <div
                key={i}
                className="absolute right-2 -translate-y-1/2 select-none text-[10px] font-medium uppercase tabular-nums text-neutral-500"
                style={{ top: i * ROW_PX }}
              >
                {formatHourLabel((DAY_START_HOUR + i * 2) % 24)}
              </div>
            ))}
          </div>

          <div className="relative grid border border-neutral-800" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
            {week.keys.map((key, idx) => {
              const isToday = key === nowKey && isCurrentWeek;
              const todayIdx = week.headers.findIndex((h) => h.isToday);
              const isFutureDay = isCurrentWeek && idx > todayIdx;
              const futureFromMin = isToday ? nowMin : isFutureDay ? 0 : null;
              const pastUntilMin = !trackAnchor
                ? null
                : key < trackAnchor.key
                  ? TOTAL_MIN
                  : key === trackAnchor.key
                    ? trackAnchor.min
                    : null;
              return (
                <DayColumn
                  key={key}
                  segments={segmentsByDay[key] || []}
                  gaps={gapsByDay[key] || []}
                  futureFromMin={futureFromMin}
                  pastUntilMin={pastUntilMin}
                  nowMin={isToday ? nowMin : null}
                  isFirst={idx === 0}
                  zIndex={7 - idx}
                />
              );
            })}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-4 text-[11px] text-neutral-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-4 rounded-sm border border-sky-400/60 bg-sky-400/25" /> online
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-4 rounded-sm bg-neutral-800" style={{ backgroundImage: "repeating-linear-gradient(135deg, rgba(255,255,255,0.08) 0 3px, transparent 3px 6px)" }} /> no data
          </span>
          <span>day starts at {formatHourLabel(DAY_START_HOUR)} · times in {tz}</span>
        </div>
      </CardBody>
    </Card>
  );
}

function DayColumn({
  segments,
  gaps,
  futureFromMin,
  pastUntilMin,
  nowMin,
  isFirst,
  zIndex,
}: {
  segments: Segment[];
  gaps: Overlay[];
  futureFromMin: number | null;
  pastUntilMin: number | null;
  nowMin: number | null;
  isFirst: boolean;
  zIndex: number;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className={cn("relative", isFirst ? "" : "border-l border-neutral-800")}
      style={{
        backgroundImage: `repeating-linear-gradient(to bottom, transparent 0 ${ROW_PX - 1}px, rgb(38 38 38) ${ROW_PX - 1}px ${ROW_PX}px)`,
        zIndex: hovered ? 99 : zIndex,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {pastUntilMin !== null && pastUntilMin > 0 ? (
        <Hatch top={0} height={pastUntilMin} label={pastUntilMin >= TOTAL_MIN ? "Not tracked" : null} />
      ) : null}
      {gaps.map((g, i) => (
        <Hatch key={i} top={g.startMin} height={g.endMin - g.startMin} label={null} />
      ))}
      {futureFromMin !== null && futureFromMin < TOTAL_MIN ? (
        <div
          className="pointer-events-none absolute"
          style={{
            top: `${(futureFromMin / TOTAL_MIN) * 100}%`,
            height: `${((TOTAL_MIN - futureFromMin) / TOTAL_MIN) * 100}%`,
            left: 0,
            right: -1,
            backgroundColor: "rgba(10,10,10,0.55)",
          }}
        />
      ) : null}
      {segments.map((seg) => (
        <SessionBlock key={`${seg.sessionId}-${seg.segIndex}`} seg={seg} />
      ))}
      {nowMin !== null ? (
        <div className="pointer-events-none absolute left-0 right-0 z-40" style={{ top: `${(nowMin / TOTAL_MIN) * 100}%` }}>
          <div className="h-px bg-red-400/80" />
          <div className="absolute -left-1 -top-[3px] h-[7px] w-[7px] rounded-full bg-red-400" />
        </div>
      ) : null}
    </div>
  );
}

function Hatch({ top, height, label }: { top: number; height: number; label: string | null }) {
  return (
    <div
      className="pointer-events-none absolute flex items-end justify-center overflow-hidden"
      title="No data for this period"
      style={{
        top: `${(top / TOTAL_MIN) * 100}%`,
        height: `${(height / TOTAL_MIN) * 100}%`,
        left: 0,
        right: -1,
        backgroundColor: "rgba(10,10,10,0.6)",
        backgroundImage: "repeating-linear-gradient(135deg, rgba(255,255,255,0.05) 0 6px, transparent 6px 12px)",
      }}
    >
      {label ? <span className="mb-1 select-none text-[10px] uppercase tracking-wider text-neutral-500">{label}</span> : null}
    </div>
  );
}

function SessionBlock({ seg }: { seg: Segment }) {
  const top = (seg.startMin / TOTAL_MIN) * 100;
  const height = Math.max(((seg.endMin - seg.startMin) / TOTAL_MIN) * 100, 0.35);
  const tooltipBelow = seg.startMin < TOTAL_MIN / 2;
  return (
    <div className="group absolute" style={{ top: `${top}%`, height: `${height}%`, left: 3, right: 3 }}>
      <div
        className={cn(
          "relative h-full overflow-hidden border border-sky-400/60 bg-sky-400/25 transition-all group-hover:bg-sky-400/40",
          seg.isLive ? "rounded-t-md border-b-0" : "rounded-md",
        )}
      />
      <div
        className={cn(
          "pointer-events-none invisible absolute left-1/2 z-50 w-60 -translate-x-1/2 rounded-xl border border-neutral-700/80 bg-neutral-950 p-3 shadow-2xl shadow-black/60 ring-1 ring-white/5 group-hover:visible",
          tooltipBelow ? "top-full mt-2" : "bottom-full mb-2",
        )}
      >
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-sky-400/40 bg-sky-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sky-300">
          Telegram {seg.isLive ? <> · <LiveDot /> online</> : null}
        </div>
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1.5 tabular-nums text-neutral-400">
            <Clock className="h-3 w-3 text-neutral-500" />
            {seg.startExact ? "" : "≈"}{seg.startLabel} <span className="text-neutral-600">→</span> {seg.endExact ? "" : "≈"}{seg.endLabel}
          </span>
          <span className="font-semibold tabular-nums text-neutral-100">{formatDuration(seg.durationSec)}</span>
        </div>
        <div className="mt-1.5 text-[10px] text-neutral-500">
          {seg.endExact ? "end is exact (Telegram last-seen)" : "end estimated"} · start {seg.startExact ? "exact" : "estimated from poll gap"}
        </div>
      </div>
    </div>
  );
}
