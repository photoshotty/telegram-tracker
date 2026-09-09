"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DayRow } from "@/lib/sessions";
import { formatHourLabel } from "@/lib/time";
import { ACCENT } from "./ui";

function TooltipBox({
  active,
  payload,
  label,
  format,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; color?: string }>;
  label?: string | number;
  format: (value: number, name: string) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
      <div className="mb-1 font-medium text-neutral-300">{String(label)}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 tabular-nums">
          <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />
          <span className="text-neutral-400">{p.name}</span>
          <span className="ml-auto text-neutral-100">{format(Number(p.value ?? 0), String(p.name))}</span>
        </div>
      ))}
    </div>
  );
}

const axisStyle = { fontSize: 10, fill: "#737373" };

export function HourlyChart({ profile }: { profile: number[] }) {
  const data = profile.map((minutes, h) => ({ hour: h, label: formatHourLabel(h), minutes: Math.round(minutes * 10) / 10 }));
  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="label" tick={axisStyle} interval={2} axisLine={false} tickLine={false} />
          <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
            content={(p) => (
              <TooltipBox {...(p as object)} format={(v) => `${v} min / day`} />
            )}
          />
          <Bar dataKey="minutes" name="avg minutes online" fill={ACCENT} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DailyChart({ rows }: { rows: DayRow[] }) {
  const data = rows.map((r) => ({ ...r, minutes: Math.round(r.minutes) }));
  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="label" tick={axisStyle} interval={4} axisLine={false} tickLine={false} />
          <YAxis yAxisId="left" tick={axisStyle} axisLine={false} tickLine={false} />
          <YAxis yAxisId="right" orientation="right" tick={axisStyle} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
            content={(p) => (
              <TooltipBox
                {...(p as object)}
                format={(v, name) => (name === "sessions" ? `${v}` : `${v} min`)}
              />
            )}
          />
          <Bar yAxisId="left" dataKey="sessions" name="sessions" fill={ACCENT} radius={[3, 3, 0, 0]} />
          <Bar yAxisId="right" dataKey="minutes" name="minutes online" fill="#a3a3a3" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
