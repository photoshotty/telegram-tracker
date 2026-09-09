# Telegram online / last-seen tracker — research summary

Date: 2026-09-08. Four parallel research agents (open-source, Telegram API mechanics, hosting, commercial tools + analytics design) plus independent verification of the load-bearing claims. Raw per-agent reports with sources are in `docs/research/`.

## TL;DR

- **Nothing to reuse.** ~20 open-source trackers exist, all Python/Telethon hobby projects that track *other people* from an always-on process. None runs on GitHub Actions, none has a JS collector, none tracks the logged-in account itself. Commercial apps (TGSeen, TeleWatch, LastSeen on Telegram) are $5–15 per **week** parental-control subscriptions with no export. Verdict: **build our own** (small: ~150-line collector + a Next.js dashboard).
- **It is technically simple.** With Last Seen = Everybody, any *user* session (MTProto, not the Bot API) that calls `users.getUsers([inputUserSelf])` gets back either `userStatusOnline{expires}` or `userStatusOffline{was_online}` with **exact unix-second timestamps**. Bots cannot see presence at all.
- **Your planned stack works as a $0 start, with caveats** (public repo, 5-min floor with heavy schedule drift in 2026, rotating runner IPs, ToS grey area). The dashboard half (Next.js on Vercel Hobby) is exactly right. The **collector** is better off on an always-on box (your PC if it never sleeps, a $2/month container, or the free GCP e2-micro).
- **Biggest open question is empirical, not researchable:** whether the collector's own MTProto session makes *your* account look online. Evidence says a passive client does not (presence is only set by an explicit `account.updateStatus` call), but the Telethon maintainer's "some requests update it, some don't" means we must verify in the first hour and fall back to a second observer account if needed.

## 1. Existing solutions (why none fit)

| Project | Stack | Approach | Why not |
|---|---|---|---|
| gentoo-root/telegram-tracker (104 stars, 2018) | Python/Telethon | Polls every 15 s, supports target `me` | Prints to stdout, no storage/stats |
| Forichok/TelegramOnlineSpy (523 stars, 2021) | Python/Telethon | Polling "spy bot", notifications | No history, no dashboard, others-only |
| cubicbyte/telegram-tracker (27 stars, 2024) | Python/Telethon | `UpdateUserStatus` events to SQLite | Clean 90-line reference, no stats, no self mode |
| drjimmy1990/telegram_online_tracker (0 stars, 2026) | Telethon + Supabase + Vite/Chart.js | Events + staleness watchdog, hourly/weekly charts | Others-only, 24/7 Docker + Supabase, leaked creds in repo |
| tima100faces/telegram-online-tracker (0 stars, 2026) | Telethon + SQLite | Best sessions schema, streaks, CSV | GPL-3, bot UI, cannot track self |
| TGSeen / TeleWatch / LastSeen (commercial) | closed | Their observer accounts poll your number | $5–15/week, no export, poor ratings, they keep your history |

Useful prior art to borrow: gentoo-root's poll-diff logic (exact offline edge from `was_online`, approximate online edge), drjimmy1990's `stats.js` session derivation, tima100faces' daily/hourly SQL.

## 2. How Telegram exposes presence (verified facts)

- `UserStatus` constructors: `userStatusEmpty`, `userStatusOnline{expires}`, `userStatusOffline{was_online}`, and approximate buckets `userStatusRecently` / `LastWeek` / `LastMonth` (each with a `by_me` flag meaning "hidden from you because *you* hide yours"). Timestamps are unix seconds, no rounding.
- **Presence is explicit, not inferred from traffic.** Official clients call `account.updateStatus(offline=false)` while in the foreground (Android re-sends every ~55 s, Desktop every 120 s) and `updateStatus(offline=true)` ~2 s after backgrounding on Android / 30 s idle on Desktop. So `was_online` is normally set promptly and precisely; the `expires` TTL (a few minutes) only matters when a client dies without saying goodbye.
- Sending a message, reading a 1:1 chat, or typing also shows you online for ~30 s regardless of privacy (Telegram FAQ).
- **Self status:** TDLib code applies `updateUserStatus` to the own user id and uses it to detect "online from another device", and `gentoo-root/telegram-tracker` documents `me` as a target. So reading your own status from a separate session should reflect your phone. Medium confidence, needs the first-hour test.
- **Realtime `updateUserStatus` pushes are best-effort** and documented as "contact status update". Several 2025–2026 projects added polling watchdogs because pushes get missed. Polling is the source of truth; events are a bonus.
- **Reciprocity:** an observer only sees exact timestamps if it shares its own last seen (or has Premium). Matters only if a second account is used.
- **Bot API:** no presence field, TDLib drops status updates in bot mode. A user session is mandatory.
- **Rate limits:** `users.getUsers(inputUserSelf)` has no documented flood errors; prior trackers polled every 10–15 s without floods. Never resolve by username (24-h FloodWaits reported). 30–60 s polling is safe; 5 min is very safe.
- **Account safety:** use an old established account, set realistic `device_model` / `system_version` / `app_version`, make zero write calls. `AUTH_KEY_DUPLICATED` revokes the session if one auth key is used from two connections *in parallel*; mtcute/MTKruto docs warn that hopping IPs is risky and one Telethon user hit it running in GitHub Actions (Mar 2025). Keep one process on one IP if you can.

## 3. Same account or a second observer account?

| | Same account (tracker logs in as you) | Second observer account |
|---|---|---|
| Setup | Zero extra accounts | Needs an aged real-SIM account, Last Seen = Everybody, mutual contact |
| Signal purity | Risk the poller marks you online (must test) | Clean by construction |
| Ban risk | Low (old account, read-only) | Higher if the number is new/VoIP |
| Recommendation | **Start here**, run the pollution test | Fallback if the test fails |

Rules either way: never call `account.updateStatus` (neither online nor offline; offline=true would itself rewrite `was_online`), never resolve usernames, disable update receiving in a pure poller.

## 4. Hosting the collector

| Option | Cost | Poll granularity | Verdict |
|---|---|---|---|
| GitHub Actions `schedule` (your plan) | $0 only in a **public** repo (~8.6k min/month vs 2,000 private quota) | 5-min floor; 2026 drift 15 min to hours, dropped runs | Works as v0; mitigate drift with cron-job.org calling `workflow_dispatch`; ToS grey area; rotating Azure IPs |
| Vercel Hobby cron | $0 | Once per day | Useless for polling; keep Vercel for the dashboard only |
| Vercel Pro cron | $20/month | 1 min | Overkill |
| Home Windows PC / Raspberry Pi | $0 | 30–60 s + realtime events | Great **if** always on; a sleeping PC misses exactly the mobile-only sessions |
| Koyeb eco-nano | ~$1.61/month | 30–60 s + realtime | Cheapest always-on container |
| Fly.io shared-cpu-1x 256 MB | ~$2/month | same | Simple `fly launch` |
| GCP e2-micro free tier | ~$0 (card required) | same | Most dependable "free" VM |
| Oracle Always Free | $0 | same | Capacity problems, idle-reclaim rule kills a near-idle listener |
| Cloudflare Workers / Deno Deploy | ~$0 | n/a | No MTProto client supports Workers; sockets die with the invocation. Experimental only |

Storage: JSONL committed to the repo (simplest, ~0.5 MB/month) or **Turso** (free 5 GB, libSQL over HTTP, SQL for aggregates). Avoid Supabase Free (pauses after 1 idle week) and Vercel Blob (no append).

Data quality by polling interval: every session **end** is exact regardless of interval (the next poll carries `was_online`); the session **start** is uncertain by up to one poll gap; sessions shorter than the gap collapse. 5-min polling gives roughly +/-10 min/day and undercounts short sessions; 1-min gives +/-1–3 min/day; realtime events are exact.

## 5. Recommended architecture

Design the collector as one module with two entry points, `collectOnce()` and `listenForever()`, so hosting can change without touching the dashboard.

**v0 (this week, $0, your plan):** public repo, `.github/workflows/poll.yml` every 5 min (plus cron-job.org dispatch for punctuality, and a `concurrency` group so runs never overlap), Node collector (mtcute or teleproto, string session in a secret) calling `users.getUsers(self)`, appending to `data/YYYY-MM.jsonl` only on change, then committing. Next.js App Router on Vercel Hobby reads the JSONL with ISR `revalidate: 300`. If you don't want your presence history public, the workflow repo stays public and pushes data to a private repo with a PAT.

**v1 (recommended, $0–2/month):** the same collector running `listenForever()` on an always-on box: subscribe to `updateUserStatus` for your own id **and** heartbeat-poll every 60 s to backfill exact `was_online` after any disconnect; write to Turso (or keep committing JSONL). Dashboard unchanged.

**Library (JS):** `@mtcute/node` (actively released Aug 2026, typed `UserStatusUpdate`, `exportSession()` strings, never sends presence unless you call `setOffline(false)`) or `teleproto` (maintained GramJS fork, StringSession-compatible). Avoid the deprecated `telegram` npm package; the GramJS and Telethon GitHub repos are archived. Python alternative: Telethon 1.44 (maintenance mode, moved to Codeberg) or Kurigram.

## 6. Data model and stats

- `samples(ts_polled, status, was_online, expires, source[poll|event], run_id)` unique on `(ts_polled, source)`; append-only.
- `sessions(start_ts, start_is_exact, start_lower_bound, end_ts, end_is_exact, min_duration_s, max_duration_s)` rebuilt deterministically from samples.
- `daily(local_date, tz, online_seconds_min, online_seconds_max, session_count, first_online_ts, last_online_ts, coverage_ratio)`.
- Derivation: offline sample after online gives an exact end; a jump in `was_online` between two offline samples means a whole session happened between polls (end exact, start bounded by the previous poll); online sample after offline means the start lies in `(prev_poll, this_poll]`.
- Store UTC epoch; bucket by hour/weekday in your IANA timezone at render time; split sessions at local midnight.
- Dashboard: live-now badge with `expires` countdown, daily online minutes with min/max band, hour x weekday heatmap, per-day timeline strip, session-length histogram, first/last online per day (sleep/wake proxy), streaks, coverage/data-quality strip. Flag days where samples come back as `recently` (privacy changed).

## 7. What we need from you

1. `api_id` + `api_hash` from https://my.telegram.org (any app name/short name).
2. One interactive login on your PC to produce the string session (the code arrives in your Telegram app, not SMS). The string goes into a GitHub secret / env var and is used from exactly one place at a time.
3. Decisions: same account vs. second observer (default: same account + test); collector host (default: GitHub Actions v0, then move); public data OK or private data repo; JSONL vs Turso (default: JSONL for v0); your timezone for stats.
4. GitHub repo + Vercel project (Hobby is enough).

## 8. First-hour validation (before trusting any numbers)

1. Run the poller for 30 min while a friend (or a second device on another account) watches your profile: you must **not** show as online because of the poller.
2. Use the phone for a few minutes, background it, and confirm the polled status flips online then offline with a plausible `was_online`.
3. Log `expires - now` on online samples to learn the server TTL (expect ~2–5 min).
4. Watch for `AUTH_KEY_DUPLICATED` / `AUTH_KEY_UNREGISTERED` in GitHub Actions runs over a couple of days; if it appears, move the collector to a fixed-IP host.

## 9. Risks and unknowns

- Poller-induced presence (see 8.1). Fallback: second account.
- GitHub Actions: schedule drift, public-repo requirement, 60-day auto-disable (your own data commits keep it alive), rotating IPs vs one auth key, Actions terms forbid "unrelated" workloads.
- Telegram user-API ToS says nothing against read-only automation on your own account, but unofficial clients are fingerprinted; new/VoIP numbers get banned quickly.
- If you ever hide Last Seen, samples degrade to `recently` and exact timestamps vanish.
- "Online" means any logged-in client is active (phone, desktop, web), not screen time. OS Screen Time is a different metric.

## Key sources

- https://core.telegram.org/type/UserStatus, /constructor/userStatusOnline, /constructor/userStatusOffline, /method/account.updateStatus, /constructor/updateUserStatus, /api/errors (AUTH_KEY_DUPLICATED)
- https://github.com/LonamiWebs/Telethon/issues/328 ("some requests update it, some don't")
- Telegram Android `MessagesController.updateTimerProc` (55 s online re-send, 2 s offline after pause); tdesktop `api_updates.cpp` (120 s / 30 s idle)
- https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows#schedule (5-min floor, delays, 60-day rule); GitHub community discussion #196910 (2026 drift)
- https://vercel.com/docs/cron-jobs/usage-and-pricing (Hobby = once per day)
- https://github.com/mtcute/mtcute, https://www.npmjs.com/package/teleproto, https://turso.tech/pricing, https://www.koyeb.com/docs/reference/instances, https://fly.io/docs/about/pricing/
