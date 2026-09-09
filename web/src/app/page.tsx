import Link from "next/link";
import { ChevronRight, Radar } from "lucide-react";
import { LoginPanel } from "@/components/login-panel";
import { PeoplePanel, type PersonRow } from "@/components/people-panel";
import { Badge, Card, CardBody, CardHeader, EmptyState, LiveDot } from "@/components/ui";
import { displayName, listTokens, loadSamples, loadTargets, serverTimezone, tokenFor } from "@/lib/data";
import { lastPullError, maybePull } from "@/lib/ops";
import { computeStats, deriveSessions, todaySummary } from "@/lib/sessions";
import { formatDuration, formatTimeAgo } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await maybePull();
  const pullError = lastPullError();
  const targets = await loadTargets();
  const tz = targets.timezone ?? serverTimezone();
  const tokens = await listTokens();
  const nowSec = Math.floor(Date.now() / 1000);

  const rows = await Promise.all(
    tokens.map(async (token) => {
      const samples = await loadSamples(token);
      const derived = deriveSessions(samples, nowSec);
      const stats = computeStats(derived.sessions, nowSec, derived.trackingStart);
      const today = todaySummary(derived.sessions, tz, nowSec);
      const latest = samples[samples.length - 1] ?? null;
      return { token, name: displayName(token, targets), meta: targets.byToken.get(token), latest, derived, stats, today };
    }),
  );
  rows.sort((a, b) => Number(b.derived.live) - Number(a.derived.live) || (b.latest?.wo ?? 0) - (a.latest?.wo ?? 0));

  const people: PersonRow[] = targets.list.map((t) => {
    const token = tokenFor(t.id);
    return { ...t, token, hasData: !!token && tokens.includes(token), isMe: targets.meId === t.id };
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Telegram Tracker</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Polled every 5 minutes by GitHub Actions · times in {tz} · data refreshes when you open this page
        </p>
      </div>

      {!targets.hasKey ? (
        <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-200">
          TG_DATA_KEY is missing from the root .env, so names cannot be matched to data folders.
        </div>
      ) : null}

      {pullError ? (
        <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-200">
          Auto-refresh from GitHub is failing, so this data may be stale: {pullError}
        </div>
      ) : null}

      <LoginPanel loggedIn={targets.hasLocalSession} session={targets.localSession} hasApiKeys={targets.hasApiKeys} />

      <PeoplePanel people={people} loggedIn={targets.hasLocalSession} needsSync={targets.needsSync} lastSyncAt={targets.lastSync?.at ?? null} />

      <Card>
        <CardHeader className="flex items-center gap-2">
          <Radar className="h-4 w-4 text-neutral-500" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-300">Activity</h2>
          <Badge>{rows.length}</Badge>
        </CardHeader>
        <CardBody className="p-0">
          {rows.length === 0 ? (
            <div className="px-5 py-12">
              <EmptyState title="No data yet" description="Press Poll now, or wait for the next GitHub run." />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-neutral-500">
                  <th className="px-4 py-2 text-left font-medium">Account</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                  <th className="px-4 py-2 text-right font-medium">Today</th>
                  <th className="px-4 py-2 text-right font-medium">Sessions / day</th>
                  <th className="px-4 py-2 text-right font-medium">Total sessions</th>
                  <th className="px-4 py-2 text-right font-medium">Tracked</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.token} className="border-t border-neutral-900 hover:bg-neutral-900/40">
                    <td className="px-4 py-3">
                      <Link href={`/u/${r.token}`} className="block">
                        <div className="font-medium text-neutral-100">
                          {r.name}
                          {targets.meToken === r.token ? <span className="ml-1.5 text-xs text-neutral-500">(me)</span> : null}
                        </div>
                        <div className="text-xs text-neutral-500">
                          {r.meta?.username ? `@${r.meta.username} · ` : ""}
                          {r.meta ? `id ${r.meta.id}` : `token ${r.token}`}
                          {r.meta?.note ? ` · ${r.meta.note}` : ""}
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {r.derived.stale && r.derived.lastSampleT ? (
                        <span className="text-amber-300" title="The collector has not reported recently">
                          no polls for {formatTimeAgo(new Date(r.derived.lastSampleT * 1000)).replace(" ago", "")}
                        </span>
                      ) : r.derived.live ? (
                        <span className="inline-flex items-center gap-1.5 text-sky-300">
                          <LiveDot /> online
                        </span>
                      ) : r.latest?.wo ? (
                        <span className="text-neutral-400">last seen {formatTimeAgo(new Date(r.latest.wo * 1000))}</span>
                      ) : r.derived.hidden ? (
                        <Badge variant="warn">hides last seen</Badge>
                      ) : (
                        <span className="text-neutral-600">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-300 whitespace-nowrap">
                      {r.today.sessions} · {formatDuration(r.today.onlineSec)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-300">{r.stats.perDay.toFixed(1)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-300">{r.stats.totalSessions}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-500 whitespace-nowrap">
                      {r.stats.daysTracked < 1 ? "<1 day" : `${Math.floor(r.stats.daysTracked)} day${Math.floor(r.stats.daysTracked) === 1 ? "" : "s"}`}
                    </td>
                    <td className="px-2 py-3 text-neutral-600">
                      <Link href={`/u/${r.token}`} aria-label="Open">
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
