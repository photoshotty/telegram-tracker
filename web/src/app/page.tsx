import Link from "next/link";
import { ChevronRight, Clock3, Globe, Radar } from "lucide-react";
import { LoginPanel } from "@/components/login-panel";
import { PeoplePanel, type PersonRow } from "@/components/people-panel";
import { Alert, Avatar, Badge, Card, Dot, EmptyState, LiveDot, Separator, cn } from "@/components/ui";
import { displayName, listDialogsSafe, listTokens, loadSamples, loadTargets, serverTimezone, sha256, tokenFor } from "@/lib/data";
import { lastPullError, maybePull } from "@/lib/ops";
import { computeStats, deriveSessions, todaySummary } from "@/lib/sessions";
import { formatDuration, formatTimeAgo } from "@/lib/time";

export const dynamic = "force-dynamic";

// One template for the header row and every account row so the columns line up.
const ROW = "grid items-center gap-x-4 px-4 sm:px-5";
const COLS = "grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.6fr)_11rem_7rem_7rem_5.5rem_1rem]";

export default async function HomePage() {
  await maybePull();
  const pullError = lastPullError();
  const targets = await loadTargets();
  const tz = targets.timezone ?? serverTimezone();
  const tokens = await listTokens();
  const dialogs = await listDialogsSafe();
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
  const onlineNow = rows.filter((r) => r.derived.live).length;
  const lastPollSec = rows.reduce((max, r) => Math.max(max, r.derived.lastSampleT ?? 0), 0);

  // People = everyone on the local list plus anyone the map knows (e.g. the account itself).
  const people: PersonRow[] = [];
  const seenTokens = new Set<string>();
  for (const t of targets.list) {
    const entry = targets.map
      ? Object.entries(targets.map.byToken).find(([, e]) => (t.id && e.id === t.id) || (e.username && e.username === t.username))
      : undefined;
    const token = entry?.[0] ?? (t.id ? tokenFor(t.id) : null);
    if (token) seenTokens.add(token);
    const failure = targets.map?.failed[t.username ? sha256(t.username) : sha256(`id:${t.id}`)];
    people.push({
      username: t.username,
      name: t.name?.trim() || entry?.[1].name || (t.username ? `@${t.username}` : `User ${t.id}`),
      telegramName: entry?.[1].name || null,
      note: t.note,
      id: entry?.[1].id ?? t.id,
      token,
      hasData: !!token && tokens.includes(token),
      isMe: !!token && token === targets.meToken,
      status: entry ? "tracked" : failure ? "failed" : "pending",
      failure: failure?.message,
    });
  }
  if (targets.map) {
    for (const [token, e] of Object.entries(targets.map.byToken)) {
      if (seenTokens.has(token)) continue;
      people.push({
        username: e.username ?? "",
        name: e.name || (e.username ? `@${e.username}` : `User ${e.id}`),
        telegramName: null,
        id: e.id,
        token,
        hasData: tokens.includes(token),
        isMe: token === targets.meToken,
        // Known from earlier polls but absent from targets.local.json: GitHub is not polling them.
        status: token === targets.meToken ? "tracked" : "untracked",
      });
    }
  }
  people.sort((a, b) => Number(b.isMe) - Number(a.isMe) || a.name.localeCompare(b.name));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-50">Activity</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-500">
            <span className="inline-flex items-center gap-1.5">
              <Radar className="h-3.5 w-3.5" /> polled every 5 min
            </span>
            <Separator />
            <span className="inline-flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5" /> {tz}
            </span>
            {lastPollSec ? (
              <>
                <Separator />
                <span className="inline-flex items-center gap-1.5">
                  <Clock3 className="h-3.5 w-3.5" /> last poll {formatTimeAgo(new Date(lastPollSec * 1000))}
                </span>
              </>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onlineNow > 0 ? (
            <Badge variant="online">
              <LiveDot /> {onlineNow} online
            </Badge>
          ) : (
            <Badge>
              <Dot className="bg-neutral-600" /> nobody online
            </Badge>
          )}
          <Badge>
            {rows.length} tracked
          </Badge>
        </div>
      </div>

      {!targets.hasKey ? <Alert>TG_DATA_KEY is missing from the root .env, so names cannot be matched to data folders.</Alert> : null}
      {pullError ? <Alert>Auto-refresh from GitHub is failing, so this data may be stale: {pullError}</Alert> : null}

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState title="No data yet" description="Press Poll now, or wait for the next scheduled GitHub run." />
        ) : (
          <>
            <div className={cn(ROW, COLS, "hidden border-b border-neutral-800/60 py-2.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500 md:grid")}>
              <span>Account</span>
              <span>Status</span>
              <span className="text-right">Today</span>
              <span className="text-right">Sessions</span>
              <span className="text-right">Tracked</span>
              <span />
            </div>
            <div className="divide-y divide-neutral-800/50">
              {rows.map((r) => {
                const daysTracked = Math.floor(r.stats.daysTracked);
                return (
                  <Link
                    key={r.token}
                    href={`/u/${r.token}`}
                    className={cn(
                      ROW,
                      COLS,
                      "group py-3 outline-none transition-colors hover:bg-neutral-800/25 focus-visible:bg-neutral-800/25 md:py-2.5",
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={r.name} />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-neutral-100">
                          {r.name}
                          {targets.meToken === r.token ? <span className="ml-1.5 text-xs font-normal text-neutral-500">you</span> : null}
                        </div>
                        <div className="truncate text-xs text-neutral-500">
                          {r.meta?.username ? `@${r.meta.username}` : r.meta ? `id ${r.meta.id}` : `token ${r.token}`}
                          {r.meta?.note ? ` · ${r.meta.note}` : ""}
                        </div>
                      </div>
                    </div>

                    <div className="hidden text-sm md:block">
                      {r.derived.stale && r.derived.lastSampleT ? (
                        <span className="inline-flex items-center gap-1.5 text-amber-300" title="The collector has not reported recently">
                          <Dot className="bg-amber-400" /> no polls for {formatTimeAgo(new Date(r.derived.lastSampleT * 1000)).replace(" ago", "")}
                        </span>
                      ) : r.derived.live ? (
                        <span className="inline-flex items-center gap-1.5 font-medium text-sky-300">
                          <LiveDot /> online
                        </span>
                      ) : r.latest?.wo ? (
                        <span className="inline-flex items-center gap-1.5 text-neutral-400">
                          <Dot className="bg-neutral-600" /> {formatTimeAgo(new Date(r.latest.wo * 1000))}
                        </span>
                      ) : r.derived.hidden ? (
                        <Badge variant="warn">hides last seen</Badge>
                      ) : (
                        <span className="text-neutral-600">—</span>
                      )}
                    </div>

                    <div className="hidden text-right md:block">
                      <div className="text-sm tabular-nums text-neutral-200">{formatDuration(r.today.onlineSec)}</div>
                      <div className="text-xs tabular-nums text-neutral-500">
                        {r.today.sessions} session{r.today.sessions === 1 ? "" : "s"}
                      </div>
                    </div>

                    <div className="hidden text-right md:block">
                      <div className="text-sm tabular-nums text-neutral-200">{r.stats.totalSessions}</div>
                      <div className="text-xs tabular-nums text-neutral-500">{r.stats.perDay.toFixed(1)} / day</div>
                    </div>

                    <div className="hidden text-right text-xs tabular-nums text-neutral-500 md:block">
                      {r.stats.daysTracked < 1 ? "<1 day" : `${daysTracked} day${daysTracked === 1 ? "" : "s"}`}
                    </div>

                    {/* Mobile: status collapses next to the chevron. */}
                    <div className="flex items-center gap-2 md:contents">
                      <span className="text-xs text-neutral-400 md:hidden">
                        {r.derived.live ? (
                          <span className="inline-flex items-center gap-1.5 text-sky-300">
                            <LiveDot /> online
                          </span>
                        ) : r.latest?.wo ? (
                          formatTimeAgo(new Date(r.latest.wo * 1000))
                        ) : (
                          "—"
                        )}
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-neutral-700 transition-colors group-hover:text-neutral-400" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </Card>

      <PeoplePanel
        people={people}
        found={dialogs?.users ?? []}
        foundUpdatedAt={dialogs?.updatedAt ?? null}
        trackSelf={targets.trackSelf}
        needsSync={targets.needsSync}
        lastSyncAt={targets.lastSync?.at ?? null}
      />

      <LoginPanel session={targets.ciSession} hasApiKeys={targets.hasApiKeys} />
    </div>
  );
}
