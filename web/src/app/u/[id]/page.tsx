import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity, ArrowLeft, BarChart3, Clock, Hourglass, ListOrdered, History, Timer } from "lucide-react";
import { DailyChart, HourlyChart } from "@/components/charts";
import { StatCard } from "@/components/stat-card";
import { Alert, Avatar, Card, CardBody, EmptyState, LiveDot, SectionHeader, Separator } from "@/components/ui";
import { WeeklyTimetable } from "@/components/weekly-timetable";
import { displayName, loadSamples, loadTargets, serverTimezone } from "@/lib/data";
import { maybePull } from "@/lib/ops";
import { computeStats, dailySeries, deriveSessions, hourlyProfile, sessionDuration } from "@/lib/sessions";
import { formatDateTimeInTz, formatDuration, formatHours, formatTimeAgo, formatTimeInTz } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: token } = await params;
  if (!/^[0-9a-f]{16}$/.test(token)) notFound();

  await maybePull();
  const targets = await loadTargets();
  const tz = targets.timezone ?? serverTimezone();
  const samples = await loadSamples(token);
  if (samples.length === 0) notFound();

  const nowSec = Math.floor(Date.now() / 1000);
  const derived = deriveSessions(samples, nowSec);
  const { sessions } = derived;
  const stats = computeStats(sessions, nowSec, derived.trackingStart);
  const profile = hourlyProfile(sessions, tz, nowSec, stats.daysTracked);
  const daily = dailySeries(sessions, tz, nowSec, 30);
  const latest = samples[samples.length - 1];
  const meta = targets.byToken.get(token);
  const name = displayName(token, targets);
  const recent = [...sessions].reverse().slice(0, 300);
  const daysLabel = stats.daysTracked < 1 ? `${Math.max(1, Math.round(stats.daysTracked * 24))} h` : `${stats.daysTracked.toFixed(1)} days`;

  return (
    <div className="space-y-6">
      <Link
        href="/"
        className="-ml-1 inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-xs text-neutral-500 transition-colors hover:text-neutral-300"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> All accounts
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar name={name} size="lg" />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-neutral-50">
              {name}
              {targets.meToken === token ? <span className="ml-2 text-sm font-normal text-neutral-500">you</span> : null}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-500">
              {meta?.username ? (
                <a
                  href={`https://t.me/${meta.username}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-neutral-800 bg-neutral-900/60 px-2 py-0.5 text-neutral-300 transition-colors hover:border-neutral-700 hover:text-neutral-100"
                >
                  @{meta.username}
                </a>
              ) : null}
              <span className="tabular-nums">{meta ? `id ${meta.id}` : `token ${token}`}</span>
              {meta?.note ? (
                <>
                  <Separator />
                  <span>{meta.note}</span>
                </>
              ) : null}
              <Separator />
              <span>since {formatDateTimeInTz(new Date((derived.trackingStart ?? nowSec) * 1000), tz)}</span>
            </div>
          </div>
        </div>

        {derived.stale && derived.lastSampleT ? (
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-2.5">
            <div className="text-sm font-medium text-amber-200">No recent polls</div>
            <div className="mt-0.5 text-xs text-amber-300/70">
              last poll {formatTimeAgo(new Date(derived.lastSampleT * 1000))}
              {latest.wo ? ` · last seen ${formatDateTimeInTz(new Date(latest.wo * 1000), tz)}` : ""}
            </div>
          </div>
        ) : derived.live ? (
          <div className="rounded-xl border border-sky-500/40 bg-sky-500/10 px-4 py-2.5">
            <div className="flex items-center gap-2 text-sm font-medium text-sky-200">
              <LiveDot /> Online for {formatDuration(sessionDuration(sessions[sessions.length - 1], nowSec))}
            </div>
            {latest.ex ? (
              <div className="mt-0.5 text-xs text-sky-300/70">status expires {formatTimeInTz(new Date(latest.ex * 1000), tz)} unless renewed</div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-xl border border-neutral-800/80 bg-neutral-900/40 px-4 py-2.5">
            <div className="text-sm font-medium text-neutral-300">Offline</div>
            <div className="mt-0.5 text-xs text-neutral-500">
              {latest.wo
                ? `Last seen ${formatTimeAgo(new Date(latest.wo * 1000))} · ${formatDateTimeInTz(new Date(latest.wo * 1000), tz)}`
                : derived.hidden
                  ? "This person hides their last seen"
                  : "No last-seen timestamp yet"}
            </div>
          </div>
        )}
      </div>

      {derived.hidden ? (
        <Alert>
          Some polls returned only &quot;recently&quot;: this account hides its last seen from the collector, so sessions are incomplete.
        </Alert>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={<History className="h-3.5 w-3.5" />} label="Sessions" value={stats.totalSessions.toString()} hint={`${stats.perDay.toFixed(1)} per day · ${daysLabel} tracked`} />
        <StatCard
          icon={<Hourglass className="h-3.5 w-3.5" />}
          label="Time online"
          value={`${formatHours(stats.totalSec)} h`}
          hint={`${formatDuration(stats.totalSec / Math.max(stats.daysTracked, 1))} per day`}
        />
        <StatCard icon={<Clock className="h-3.5 w-3.5" />} label="Avg session" value={stats.avgSec ? formatDuration(stats.avgSec) : "—"} />
        <StatCard icon={<Timer className="h-3.5 w-3.5" />} label="Longest session" value={stats.longestSec ? formatDuration(stats.longestSec) : "—"} />
      </div>

      <WeeklyTimetable sessions={sessions} gaps={derived.gaps} tz={tz} trackingStart={derived.trackingStart} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionHeader icon={<Activity className="h-4 w-4" />} title="Time of day" hint="avg minutes online per hour" />
          <CardBody>
            <HourlyChart profile={profile} />
          </CardBody>
        </Card>
        <Card>
          <SectionHeader icon={<BarChart3 className="h-4 w-4" />} title="Last 30 days" hint="sessions and minutes per day" />
          <CardBody>
            <DailyChart rows={daily} />
          </CardBody>
        </Card>
      </div>

      <Card>
        <SectionHeader icon={<ListOrdered className="h-4 w-4" />} title="Session log" count={sessions.length}>
          <span className="hidden text-xs text-neutral-600 sm:block">≈ estimated from the poll gap · exact ends come from Telegram&apos;s last-seen</span>
        </SectionHeader>
        {sessions.length === 0 ? (
          <EmptyState title="No sessions yet" description="Sessions appear once the collector sees this account go online and offline." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-800/60 text-[11px] uppercase tracking-wider text-neutral-500">
                  <th className="px-4 py-2.5 text-left font-medium sm:px-5">Started</th>
                  <th className="px-4 py-2.5 text-left font-medium">Start</th>
                  <th className="px-4 py-2.5 text-left font-medium">End</th>
                  <th className="px-4 py-2.5 text-right font-medium sm:px-5">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/50">
                {recent.map((s) => {
                  const end = s.end ?? nowSec;
                  return (
                    <tr key={s.id} className="transition-colors hover:bg-neutral-800/20">
                      <td className="whitespace-nowrap px-4 py-2.5 sm:px-5">
                        <div className="text-neutral-200">{formatDateTimeInTz(new Date(s.start * 1000), tz)}</div>
                        <div className="text-xs text-neutral-500">{formatTimeAgo(new Date(s.start * 1000))}</div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-neutral-400">
                        {s.startExact ? "" : "≈ "}
                        {formatTimeInTz(new Date(s.start * 1000), tz)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-neutral-400">
                        {s.end === null ? (
                          <span className="inline-flex items-center gap-1.5 text-sky-300">
                            <LiveDot /> now
                          </span>
                        ) : (
                          <>
                            {s.endExact ? "" : "≈ "}
                            {formatTimeInTz(new Date(end * 1000), tz)}
                          </>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right font-medium tabular-nums text-neutral-200 sm:px-5">
                        {formatDuration(end - s.start)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {sessions.length > recent.length ? (
              <div className="border-t border-neutral-800/50 px-4 py-2.5 text-xs text-neutral-600 sm:px-5">
                Showing the latest {recent.length} of {sessions.length} sessions.
              </div>
            ) : null}
          </div>
        )}
      </Card>
    </div>
  );
}
