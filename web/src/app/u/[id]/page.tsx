import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity, BarChart3, Clock, History, Hourglass, ListOrdered, Timer } from "lucide-react";
import { DailyChart, HourlyChart } from "@/components/charts";
import { StatCard } from "@/components/stat-card";
import { Badge, Card, CardBody, CardHeader, EmptyState, LiveDot } from "@/components/ui";
import { WeeklyTimetable } from "@/components/weekly-timetable";
import { displayName, loadSamples, loadTargets, serverTimezone } from "@/lib/data";
import { computeStats, dailySeries, deriveSessions, hourlyProfile, sessionDuration } from "@/lib/sessions";
import { formatDateTimeInTz, formatDuration, formatHours, formatTimeAgo, formatTimeInTz } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: token } = await params;
  if (!/^[0-9a-f]{16}$/.test(token)) notFound();

  const targets = await loadTargets();
  const tz = targets.timezone ?? serverTimezone();
  const samples = await loadSamples(token);
  if (samples.length === 0) notFound();

  const nowSec = Math.floor(Date.now() / 1000);
  const derived = deriveSessions(samples);
  const { sessions } = derived;
  const stats = computeStats(sessions, nowSec, derived.trackingStart);
  const profile = hourlyProfile(sessions, tz, nowSec, stats.daysTracked);
  const daily = dailySeries(sessions, tz, nowSec, 30);
  const latest = samples[samples.length - 1];
  const live = sessions[sessions.length - 1]?.end === null;
  const meta = targets.byToken.get(token);
  const name = displayName(token, targets);
  const recent = [...sessions].reverse().slice(0, 300);

  return (
    <div>
      <div className="mb-2">
        <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-300">← All accounts</Link>
      </div>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-neutral-800 bg-neutral-900 text-xl font-semibold text-neutral-300">
            {name.replace(/^@/, "").slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">
              {name}
              {targets.meToken === token ? <span className="ml-2 text-sm font-normal text-neutral-500">(me)</span> : null}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
              {meta?.username ? (
                <a href={`https://t.me/${meta.username}`} target="_blank" rel="noreferrer" className="rounded-md border border-neutral-800 bg-neutral-900/60 px-2 py-0.5 text-neutral-300 hover:border-neutral-700">
                  @{meta.username}
                </a>
              ) : null}
              <span>{meta ? `id ${meta.id}` : `token ${token}`}</span>
              {meta?.note ? <span>· {meta.note}</span> : null}
              <span>· tracked since {formatDateTimeInTz(new Date((derived.trackingStart ?? nowSec) * 1000), tz)}</span>
            </div>
          </div>
        </div>

        {live ? (
          <div className="relative overflow-hidden rounded-lg border border-sky-500/50 bg-sky-500/10 px-4 py-2.5">
            <div className="flex items-center gap-2 text-sm font-medium text-sky-200">
              <LiveDot /> Online for {formatDuration(sessionDuration(sessions[sessions.length - 1], nowSec))}
            </div>
            {latest.ex ? <div className="mt-0.5 text-xs text-sky-300/70">status expires {formatTimeInTz(new Date(latest.ex * 1000), tz)} unless renewed</div> : null}
          </div>
        ) : (
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-4 py-2.5">
            <div className="text-sm font-medium text-neutral-300">Offline</div>
            <div className="mt-0.5 text-xs text-neutral-500">
              {latest.wo ? `Last seen ${formatTimeAgo(new Date(latest.wo * 1000))} · ${formatDateTimeInTz(new Date(latest.wo * 1000), tz)}` : derived.hidden ? "This person hides their last seen" : "No last-seen timestamp yet"}
            </div>
          </div>
        )}
      </div>

      {derived.hidden ? (
        <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-200">
          Some polls returned only &quot;recently&quot;: this account hides its last seen from the collector, so sessions are incomplete.
        </div>
      ) : null}

      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={<History className="h-4 w-4" />} label="Sessions" value={stats.totalSessions.toString()} hint={`${stats.perDay.toFixed(1)} per day`} />
        <StatCard icon={<Hourglass className="h-4 w-4" />} label="Time online" value={`${formatHours(stats.totalSec)} h`} hint={`${formatDuration(stats.totalSec / stats.daysTracked)} per day`} />
        <StatCard icon={<Clock className="h-4 w-4" />} label="Avg session" value={stats.avgSec ? formatDuration(stats.avgSec) : "-"} />
        <StatCard icon={<Timer className="h-4 w-4" />} label="Longest session" value={stats.longestSec ? formatDuration(stats.longestSec) : "-"} />
      </div>

      <div className="mb-8">
        <WeeklyTimetable sessions={sessions} gaps={derived.gaps} tz={tz} trackingStart={derived.trackingStart} />
      </div>

      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-neutral-500" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-300">Time of day</h2>
            <span className="ml-1 text-xs text-neutral-500">avg minutes online per hour</span>
          </CardHeader>
          <CardBody>
            <HourlyChart profile={profile} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-neutral-500" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-300">Last 30 days</h2>
            <span className="ml-1 text-xs text-neutral-500">sessions and minutes per day</span>
          </CardHeader>
          <CardBody>
            <DailyChart rows={daily} />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex items-center gap-2">
          <ListOrdered className="h-4 w-4 text-neutral-500" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-300">Session log</h2>
          <Badge>{sessions.length}</Badge>
          <span className="ml-auto text-xs text-neutral-500">≈ = estimated from the poll gap · exact ends come from Telegram&apos;s last-seen</span>
        </CardHeader>
        <CardBody className="p-0">
          {sessions.length === 0 ? (
            <div className="px-5 py-12">
              <EmptyState title="No sessions yet" description="Sessions appear once the collector sees this account go online and offline." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wider text-neutral-500">
                    <th className="px-4 py-2 text-left font-medium">Started</th>
                    <th className="px-4 py-2 text-left font-medium">Start</th>
                    <th className="px-4 py-2 text-left font-medium">End</th>
                    <th className="px-4 py-2 text-left font-medium">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((s) => {
                    const end = s.end ?? nowSec;
                    return (
                      <tr key={s.id} className="border-t border-neutral-900 hover:bg-neutral-900/40">
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <div className="text-neutral-200">{formatDateTimeInTz(new Date(s.start * 1000), tz)}</div>
                          <div className="text-xs text-neutral-500">{formatTimeAgo(new Date(s.start * 1000))}</div>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap tabular-nums text-neutral-300">
                          {s.startExact ? "" : "≈ "}{formatTimeInTz(new Date(s.start * 1000), tz)}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap tabular-nums text-neutral-300">
                          {s.end === null ? (
                            <span className="inline-flex items-center gap-1.5 text-sky-300"><LiveDot /> now</span>
                          ) : (
                            <>{s.endExact ? "" : "≈ "}{formatTimeInTz(new Date(end * 1000), tz)}</>
                          )}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap tabular-nums text-neutral-300">{formatDuration(end - s.start)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {sessions.length > recent.length ? (
                <div className="px-4 py-2 text-xs text-neutral-500">Showing the latest {recent.length} of {sessions.length} sessions.</div>
              ) : null}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
