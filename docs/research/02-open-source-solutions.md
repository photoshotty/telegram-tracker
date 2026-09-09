# oss

## Summary
I evaluated ~20 open-source projects that log a Telegram user's online/last-seen status (GitHub search via web + authenticated `gh` CLI; npm and PyPI searches returned nothing relevant). The landscape is uniformly hobby-grade: every project is Python (Telethon or Pyrogram; one has a vanilla-JS/Vite dashboard), single-author, and 0-27 stars except Forichok/TelegramOnlineSpy (523 stars, but a polling "spy bot" last committed April 2021). No GramJS/Node collector exists. Two technical patterns appear: (a) polling `client.get_entity(target)`/`get_me()` every 5-60 s and diffing `UserStatusOnline`/`UserStatusOffline.was_online` (gentoo-root, Forichok, HuntingLastTelegramSeen, underground059, PsychoWAR, alexcircuits, SPT) and (b) a long-running MTProto client subscribing to `events.UserUpdate` / raw `UpdateUserStatus` (cubicbyte, MatveyPRO3, tima100faces, WaromiV, drjimmy1990, Ibrahim-Radzhabov, SASHAPAST). Several 2026 projects (drjimmy1990, alexcircuits, SPT) explicitly add a polling fallback/"staleness watchdog" because push updates are sometimes missed. All are designed to track OTHER people (contacts must be in your contact list for events); only gentoo-root/telegram-tracker (2018, polling, prints to stdout) explicitly supports `me`, and lvkaszus/telegram-online-status-api shows `get_me().status` returning one's own status when polled from a separate session.

Nothing runs on GitHub Actions: every project assumes a persistent process (VPS/Docker/systemd/Heroku). The closest "full pipeline" is drjimmy1990/telegram_online_tracker (Apr-May 2026, 0 stars): Telethon `events.UserUpdate` collector -> Supabase Postgres `status_events` -> Vite/Chart.js dashboard with session list, multi-day timeline, hourly online-minutes chart, weekly bar chart, total/avg/longest session stats, Supabase Realtime. It is however hard-wired to tracking third-party phone numbers, needs a 24/7 Docker host plus Supabase, has no README, and its deployment guide contains what look like the author's real API_ID/API_HASH. tima100faces/telegram-online-tracker (Jul 2026, GPL-3.0) is the most polished event-driven collector (SQLite sessions table, hourly activity heatmap, streaks, CSV export, REST API) but its UI is a Telegram bot, it cannot track the logged-in account, and it is a multi-user "track your contacts" product. WaromiV/telegram_online_monitor (Dec 2025) is a Pyrogram raw-update collector + aggregator + FastAPI + single-page dashboard focused on sleep inference. None is well-maintained by any community measure (all 0-1 stars, single burst of commits).

## Findings
- [high] No existing open-source project implements the user's exact pipeline (self-tracking + GitHub Actions cron + Next.js/Vercel dashboard). All discovered collectors assume a persistent MTProto client process on a VPS/Docker/systemd/Heroku; none has a .github/workflows schedule, and a GitHub code search for Telethon status code under path:.github/workflows returned nothing.
  - notes: Also confirmed via `gh search repos` across ~15 phrasings (online tracker, last seen, presence, status logger, online spy, status history, heatmap).
  - src: https://github.com/search?q=telegram+online+tracker&type=repositories
  - src: https://github.com/search?q=telegram+online+tracker&type=repositories&s=updated&o=desc
  - src: https://github.com/search?q=telegram+online+%22github+actions%22+status+track&type=repositories
  - src: https://github.com/tima100faces/telegram-online-tracker
  - src: https://github.com/drjimmy1990/telegram_online_tracker
  - src: https://github.com/WaromiV/telegram_online_monitor
- [high] The closest full collect+store+visualize pipeline is drjimmy1990/telegram_online_tracker (created 2026-04-30, last push 2026-05-28, 0 stars, no license, no README): Telethon 1.37 `@client.on(events.UserUpdate)` collector writing Online/Offline rows (user_id, status, was_last_seen, created_at) to Supabase, plus a Vite + Chart.js dashboard (stats.js computes sessions Online->Offline, total/avg/longest; charts.js renders 24-bucket 'online minutes per hour' area chart and a weekly bar chart; timeline.js multi-day session bars). It includes a 'staleness watchdog' (every 5 min, 10-min threshold) because 'Telegram misses offline events'.
  - notes: Read via gh api: tracker.py, config.py, stats.js, charts.js, migrations/001_create_status_events.sql, SETUP_GUIDE.md, DEPLOYMENT_GUIDE.md, commits. Targets are configured as phone numbers of OTHER people (TARGET_USERS). DEPLOYMENT_GUIDE.md contains literal API_ID / API_HASH values and a Supabase URL - apparent leaked credentials; treat the repo as reference code only.
  - src: https://github.com/drjimmy1990/telegram_online_tracker
- [high] tima100faces/telegram-online-tracker (all 46 commits on 2026-07-14, 0 stars, GPL-3.0) is the most complete event-driven collector: Telethon `events.UserUpdate` -> SQLite (WAL) `online_sessions(went_online, went_offline)`, hourly activity computed by `strftime('%H', went_online)` grouped over N days, per-user total/avg/longest session and streaks, CSV export, REST API (/health, /getall, /stats, /daily/<date>), Telegram-bot UI, systemd deployment, Docker 'coming soon'. It has no polling fallback and cannot track the logged-in account itself (only contacts added via /add).
  - notes: Its 'heatmap' is hour-of-day session-start counts rendered as colored blocks in a bot message, not a web dashboard. GPL-3.0 matters if the user wants to embed code in a permissively licensed project.
  - src: https://github.com/tima100faces/telegram-online-tracker
  - src: https://github.com/tima100faces/telegram-online-tracker/commits/main
  - src: https://raw.githubusercontent.com/tima100faces/telegram-online-tracker/main/bot.py
- [medium] Polling one's own status works: gentoo-root/telegram-tracker (104 stars, MIT, last commit 2018-10-18) polls every 15 s and explicitly supports the target 'me' via `client.get_me()` (workaround for Telethon issue #1024), diffing `UserStatusOnline` vs `UserStatusOffline.was_online`; README notes offline transitions are exact (server timestamp) while online transitions are only as precise as the poll interval. lvkaszus/telegram-online-status-api (2024, MIT) likewise reads `me.status` via `get_me()` every 15 minutes to publish the author's own online status on a personal website.
  - notes: Medium because I verified the code pattern, not runtime behaviour on current Telegram layers; gentoo-root's README also says 'The special string "me" can be used to track yourself.' This is the only pattern compatible with a GitHub Actions cron (stateless run: connect with StringSession, get_me(), append record, disconnect).
  - src: https://github.com/gentoo-root/telegram-tracker
  - src: https://github.com/gentoo-root/telegram-tracker/commits/master
  - src: https://github.com/lvkaszus/telegram-online-status-api
- [high] Event-driven trackers are widely reported (in-repo) to miss updates: alexcircuits (Nov 2025) says the raw UpdateUserStatus event 'is often suppressed by Telegram's privacy settings, especially for non-mutual contacts' and adds a 5-s poller; drjimmy1990 added a staleness watchdog for 'phantom online' users; suggydev/SPT uses hybrid raw-updates + polling with >=15 s jitter; Ibrahim-Radzhabov's README states tracked users must be in your contacts or Telegram will not send status updates.
  - notes: Whether a client receives UpdateUserStatus for its OWN account (from other sessions) is not documented anywhere I found; Ibrahim's handler explicitly drops `user_id == self._me_id`, which hints such events may arrive but is not proof. Telethon's UserUpdate docs and core.telegram.org/constructor/updateUserStatus ('Contact status update') do not address it.
  - src: https://github.com/alexcircuits/python-telegram-online-status-collector
  - src: https://github.com/drjimmy1990/telegram_online_tracker
  - src: https://github.com/suggydev/SPT
  - src: https://github.com/Ibrahim-Radzhabov/telegram-online-tracker
- [medium] No relevant packages exist on npm or PyPI: npm registry searches for 'telegram online status tracker' and 'telegram last seen' return only bot frameworks (grammy, telegraf, node-telegram-bot-api); PyPI search page failed to render but web search surfaced no package. No GramJS/TypeScript status logger repo was found at all.
  - notes: gh code search with language filters returned a 422 parse error; the language-filtered repo search hit GitHub rate limiting (429). The only JS in the space is drjimmy1990's dashboard (collector is still Python).
  - src: https://registry.npmjs.org/-/v1/search?text=telegram%20online%20status%20tracker&size=20
  - src: https://registry.npmjs.org/-/v1/search?text=telegram%20last%20seen&size=20
  - src: https://github.com/search?q=telegram+online+tracker&type=repositories
- [high] The most-starred project, Forichok/TelegramOnlineSpy (523 stars, MPL-2.0), is a Telethon polling bot (spy.py loops `client.get_entity(contact.id)` with a configurable delay) that only sends Telegram notifications and text logs; no storage schema, no stats, no dashboard; last code commit 2021-04-22 (pushed_at 2024-08-10). serga-kiev/telegram-status-monitor and verdammnis/stalk-online-telegram are forks/clones of the same design.
  - notes: Star count reflects the 'spy' use-case, not code quality or maintenance.
  - src: https://github.com/Forichok/TelegramOnlineSpy
  - src: https://github.com/Forichok/TelegramOnlineSpy/commits/master
  - src: https://github.com/serga-kiev/telegram-status-monitor
  - src: https://github.com/verdammnis/stalk-online-telegram
- [high] Projects with some visualization: SalehNiknejad/HuntingLastTelegramSeen (Jun 2025, polling, JSON log, Streamlit line chart of status level vs time; no durations or hour-of-day stats); MatveyPRO3/TelegramUserStatusSpy (Pyrogram UserStatusHandler -> history.csv, Plotly hourly heatmap/timeline/sleep prediction; last commit 2024-02-25, 12 stars); nikitavbv/TelegramActivityHeatmap (2019, sync Telethon polling of chat participants, SQLite, PNG heatmap users x 24h); WaromiV/telegram_online_monitor (Dec 2025, Pyrogram RawUpdateHandler -> SQLite presence_events, aggregator materializes offline intervals/sleep windows, FastAPI + single HTML dashboard, docker-compose).
  - notes: All of these are others-tracking and none has a deployable hosted dashboard.
  - src: https://github.com/SalehNiknejad/HuntingLastTelegramSeen
  - src: https://github.com/SalehNiknejad/HuntingLastTelegramSeen/blob/main/dashboard.py
  - src: https://github.com/SalehNiknejad/HuntingLastTelegramSeen/commits/main
  - src: https://github.com/MatveyPRO3/TelegramUserStatusSpy
  - src: https://github.com/MatveyPRO3/TelegramUserStatusSpy/commits/master
  - src: https://github.com/MatveyPRO3/TelegramUserStatusSpy/blob/master/main.py
  - src: https://raw.githubusercontent.com/nikitavbv/TelegramActivityHeatmap/master/tgactivity.py
  - src: https://github.com/WaromiV/telegram_online_monitor
- [high] cubicbyte/telegram-tracker (27 stars, MIT, last push 2024-03-03) is the cleanest minimal event-driven reference: ~90 lines, `events.UserUpdate` -> checks `types.UpdateUserStatus`, records `was_online` for offline and `expires` for online, writes to SQLite or MySQL via a small database.py; no stats, no dashboard, no self-tracking option.
  - notes: Source read via gh api (main.py, tree). Good template for the event handler if the user later moves to a persistent collector.
  - src: https://github.com/cubicbyte/telegram-tracker
- [high] GitHub Actions schedule constraints relevant to any cron-based collector: minimum interval 5 minutes, runs 'can be delayed during periods of high loads' (especially top of hour), scheduled workflows in public repos are auto-disabled after 60 days without repository activity, and only run from the default branch.
  - notes: Implication: a GH Actions poller captures exact offline timestamps (was_online) but sessions shorter than the poll gap and precise online-start times will be lost; jitter of several minutes is normal.
  - src: https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows#schedule

## Candidates
- **drjimmy1990/telegram_online_tracker** (github-repo) https://github.com/drjimmy1990/telegram_online_tracker
  - approach: Long-running Telethon client with @client.on(events.UserUpdate) filtered to configured target users (phone numbers from .env or Supabase tracked_targets table polled every 60 s); inserts Online/Offline rows into Supabase Postgres status_events; staleness watchdog re-checks via get_entity every 5 min to close 'phantom online' sessions; dashboard computes sessions Online->Offline, total/avg/longest, hourly online-minutes chart, weekly bar chart, multi-day timeline, Supabase Realtime live updates; embedded FastAPI exposes message/media scraping API; Docker + aaPanel VPS guide
  - fit: partial - only project with collector + DB + web dashboard with hour-of-day and session stats, but: tracks other people's phone numbers (no 'me' mode), requires 24/7 host + Supabase (not GH Actions), no README/license, deployment guide leaks real-looking API_ID/API_HASH/Supabase URL, scope-creeped into media scraping
  - language_or_stack: Python (Telethon 1.37, FastAPI, supabase-py) collector + JavaScript (Vite 8, Chart.js CDN, supabase-js) dashboard
  - maintained: created 2026-04-30, last commit 2026-05-28 (single burst)
  - popularity: 0 stars
  - notes: stats.js / charts.js are a useful reference for session computation and hourly chart in JS.
- **tima100faces/telegram-online-tracker** (github-repo) https://github.com/tima100faces/telegram-online-tracker
  - approach: Single asyncio process: Telethon events.UserUpdate handler starts/ends rows in online_sessions(went_online, went_offline) per tracked contact; stats via SQL (hourly session-start counts over N days as 'heatmap', total hours, avg/longest session, streaks); Telegram bot UI with /getall, daily log pagination, CSV export; REST API on :8091; systemd unit; multi-user whitelist/open-beta modes; no polling fallback
  - fit: partial - best-engineered event-driven collector with real stats schema, but tracks contacts only (cannot track the logged-in account), UI is a Telegram bot not a web dashboard, needs persistent host, GPL-3.0
  - language_or_stack: Python 3.11+, Telethon + python-telegram-bot, SQLite (WAL)
  - maintained: 46 commits all dated 2026-07-14 (last push 2026-07-14)
  - popularity: 0 stars
  - notes: Has docs/ARCHITECTURE.md and SPEC.md; db/core.py get_hourly_activity is a clean reference query.
- **gentoo-root/telegram-tracker** (github-repo) https://github.com/gentoo-root/telegram-tracker
  - approach: Loop every 15 s: get_entity(target) or get_me() for 'me'; compares UserStatusOnline / UserStatusOffline.was_online to detect transitions incl. short sessions via changed was_online; prints to stdout only
  - fit: partial - the only project explicitly supporting self ('me'/'self'), and its stateless poll is the exact primitive a GitHub Actions cron job needs; no storage, no stats, 2018-era Telethon API
  - language_or_stack: Python 3.6+, Telethon (sync)
  - maintained: last commit 2018-10-18
  - popularity: 104 stars, MIT
  - notes: README: offline transitions exact (server timestamp), online transitions bounded by poll interval.
- **cubicbyte/telegram-tracker** (github-repo) https://github.com/cubicbyte/telegram-tracker
  - approach: events.UserUpdate -> if UpdateUserStatus: record is_online, time (now for online, was_online for offline), expires; upsert into DB via database.py; auto-reconnect loop
  - fit: partial - minimal, clean event handler and schema; no self mode, no stats/dashboard, needs persistent process
  - language_or_stack: Python 3.7+, Telethon, SQLite/MySQL
  - maintained: last push 2024-03-03
  - popularity: 27 stars, MIT
  - notes: ~90 lines; good template.
- **WaromiV/telegram_online_monitor (unhinged-spyware)** (github-repo) https://github.com/WaromiV/telegram_online_monitor
  - approach: collector listens to raw UpdateUserStatus (no polling) -> presence_events table; aggregator every 600 s materializes offline intervals, sleep windows (21:00-10:00 anchor), anomalies; API /users, /users/{id}/sleep; single HTML dashboard with normalized 24h timeline, sleep & anomalies, raw events
  - fit: partial - full collect/aggregate/visualize stack but sleep-inference focused, others-tracking (USER_TIMEZONES map), needs docker host
  - language_or_stack: Python (Pyrogram RawUpdateHandler, FastAPI, SQLite, Poetry, Docker Compose, Jenkins)
  - maintained: all commits 2025-12-15
  - popularity: 0 stars, no license
  - notes: Pyrogram is effectively unmaintained upstream; forks (kurigram) exist.
- **MatveyPRO3/TelegramUserStatusSpy** (github-repo) https://github.com/MatveyPRO3/TelegramUserStatusSpy
  - approach: Pyrogram UserStatusHandler logs every status change of any user to history.csv; separate analyzer/visualizer produce Plotly hourly heatmaps, usage bar charts, timeline with sleep prediction
  - fit: partial - has the hour-of-day heatmap/timeline visuals, but logs everyone, CSV, local scripts, no self mode, author disclaims code quality
  - language_or_stack: Python, Pyrogram, CSV, Plotly
  - maintained: last commit 2024-02-25
  - popularity: 12 stars, no license
- **SalehNiknejad/HuntingLastTelegramSeen** (github-repo) https://github.com/SalehNiknejad/HuntingLastTelegramSeen
  - approach: hunter.py polls get_entity for configured users at configurable interval, appends to status_log.json; bot commands (adduser/setinterval/etc.); dashboard.py Streamlit line chart of status level (0/1/2) vs time + value counts
  - fit: no - polling others, JSON log, chart shows transitions only (no durations/hour-of-day), Persian UI text
  - language_or_stack: Python, Telethon, JSON, Streamlit
  - maintained: 2025-06-02 to 2025-06-11
  - popularity: 0 stars, no license
- **Forichok/TelegramOnlineSpy** (github-repo) https://github.com/Forichok/TelegramOnlineSpy
  - approach: Bot-controlled polling loop over a list of contacts (get_entity every N s); sends notification message on change; text logs
  - fit: no - notification bot, no storage schema/stats/dashboard, others only, 2021 code
  - language_or_stack: Python, Telethon
  - maintained: last code commit 2021-04-22 (pushed_at 2024-08-10)
  - popularity: 523 stars, MPL-2.0
  - notes: Most-starred but least useful for this goal; serga-kiev/telegram-status-monitor and verdammnis/stalk-online-telegram are derivatives.
- **Ibrahim-Radzhabov/telegram-online-tracker** (github-repo) https://github.com/Ibrahim-Radzhabov/telegram-online-tracker
  - approach: events.UserUpdate for TARGET_USERS (numeric ids, must be contacts); computes session_seconds on offline using was_online; notifications to Saved Messages; /stats N days and /sessions commands via outgoing messages; explicitly ignores own user id
  - fit: no - others only (drops self events), Telegram-command UI, persistent process
  - language_or_stack: Python 3.10+, Telethon, aiosqlite
  - maintained: 2026-05-18 (single day)
  - popularity: 0 stars, no license
- **alexcircuits/python-telegram-online-status-collector** (github-repo) https://github.com/alexcircuits/python-telegram-online-status-collector
  - approach: Hybrid: events.Raw UpdateUserStatus for target + 5 s get_entity poller; tracks session start/end and daily total in a text log
  - fit: no - single target username, text log only, no storage/dashboard
  - language_or_stack: Python, Telethon
  - maintained: 2025-11-29
  - popularity: 1 star, MIT
  - notes: Useful evidence that push events are unreliable ('often suppressed ... especially for non-mutual contacts').
- **suggydev/SPT (Suggy Profile Tracker)** (github-repo) https://github.com/suggydev/SPT
  - approach: Hybrid raw UpdateUserStatus + jittered polling (>=15 s) with GetFullUserRequest; tracks avatar/name/bio/online changes; notifications; console REPL
  - fit: no - profile-change notifier for others; no stats/dashboard
  - language_or_stack: Python 3.10+, Telethon 1.34+, SQLite, Bot API
  - maintained: 2026-07-29 (2 commits)
  - popularity: 0 stars, MIT
  - notes: README acknowledges userbot automation is formally against ToS.
- **moscow-professor-codehub/Telegram-Presence-Tracker** (github-repo) https://github.com/moscow-professor-codehub/Telegram-Presence-Tracker
  - approach: Polls WATCH_USER_ID every 60 s and appends timestamp/day-of-week/hour rows to a Google Sheet
  - fit: no - others only, Google Sheets storage, no analysis
  - language_or_stack: Python, Telethon >=1.34, gspread
  - maintained: 2026-07-30 (3 commits)
  - popularity: 0 stars, MIT
- **PsychoWAR/Telegram-Online-Tracker** (github-repo) https://github.com/PsychoWAR/Telegram-Online-Tracker
  - approach: Polls get_entity(target) every 15 s; sessions to online_sessions.json; view_stats.py prints session durations, total online, stats by weekday
  - fit: no - single other target, local scripts, CLI stats only
  - language_or_stack: Python, Telethon, JSON
  - maintained: 2025-12-22
  - popularity: 0 stars
  - notes: Russian README.
- **underground059/TelegramOnlineTracker** (github-repo) https://github.com/underground059/TelegramOnlineTracker
  - approach: Polls get_entity every 5 s; status_log.txt; bot notifications; 'report' command
  - fit: no
  - language_or_stack: Python, Telethon
  - maintained: 2025-03-20
  - popularity: 4 stars
- **SASHAPAST/telegram-status-logger** (github-repo) https://github.com/SASHAPAST/telegram-status-logger
  - approach: events.Raw for UpdateUserStatus and typing updates of target usernames -> log.txt
  - fit: no
  - language_or_stack: Python 3.10+, Telethon
  - maintained: 2025-07-24
  - popularity: 0 stars
- **lvkaszus/telegram-online-status-api** (github-repo) https://github.com/lvkaszus/telegram-online-status-api
  - approach: Polls client.get_me().status (cached 15 min) and exposes /data {online: bool} for the author's personal website
  - fit: partial - demonstrates SELF status via get_me().status polling; no history/stats
  - language_or_stack: Python, Telethon, FastAPI
  - maintained: 2024-08-27
  - popularity: 0 stars, MIT
  - notes: Evidence for the self-polling primitive.
- **nikitavbv/TelegramActivityHeatmap** (github-repo) https://github.com/nikitavbv/TelegramActivityHeatmap
  - approach: Scheduled polling of all participants of selected chats; activity table; heatmap PNG users x 24h intervals
  - fit: no - 2019, chat-wide others tracking
  - language_or_stack: Python, sync Telethon, SQLite, PNG
  - maintained: 2019-02-08
  - popularity: 2 stars
- **gumblex/trustedsleepbot / Jamesits/tg-lover-tracker** (github-repo) https://github.com/gumblex/trustedsleepbot
  - approach: Opt-in (/subscribe) sleep inference from online-status events over 24 h windows; /status, /average commands
  - fit: no - depends on the dead telegram-cli; last commit 2023-02-09 (fork 2016)
  - language_or_stack: Python, telegram-cli + Bot API, SQLite
  - maintained: 2023-02-09
  - popularity: 9 stars, MIT
  - notes: Interesting precedent for self opt-in tracking.
- **InukaAsith/TG_OnlineTracker** (github-repo) https://github.com/InukaAsith/TG_OnlineTracker
  - approach: Polls target every x seconds, sends reports to a dump chat; Heroku one-click
  - fit: no
  - language_or_stack: Python, Pyrogram
  - maintained: 2021-12-19
  - popularity: 21 stars
- **ostrolucky/telegram-stalker** (github-repo) https://github.com/ostrolucky/telegram-stalker
  - approach: Polls telegram-cli JSON port for friends' statuses; console output
  - fit: no - 2018, telegram-cli dependency
  - language_or_stack: Python 3 + telegram-cli
  - maintained: 2018-11-02
  - popularity: 20 stars, MIT
- **waheeb71/telegram-activity-monitor** (github-repo) https://github.com/waheeb71/telegram-activity-monitor
  - approach: POLL_INTERVAL=10 s polling of /add-ed users; activity logs, daily stats tables; text reports via bot (/report, /sync)
  - fit: no - others only, text reports
  - language_or_stack: Python 3.8+, Telethon, PostgreSQL (SQLAlchemy/asyncpg, Neon)
  - maintained: 2025-11-28
  - popularity: 1 star, MIT

## Recommendation
Verdict: BUILD OWN (nothing suitable) - borrowing three small pieces of prior art.

Ranked shortlist:
1. drjimmy1990/telegram_online_tracker - only end-to-end collector + DB + JS dashboard with hourly/weekly charts and session stats; but others-only, Supabase + 24/7 Docker, 0 stars, no license/README, leaked-looking credentials. Not deployable as-is for this use case; useful as a reference for stats.js (session derivation from Online/Offline events) and the Chart.js hourly-minutes chart.
2. tima100faces/telegram-online-tracker - best event-driven collector and SQLite session schema with hour-of-day/streak SQL; but GPL-3.0, bot-only UI, cannot track self, needs persistent host.
3. gentoo-root/telegram-tracker - 2018 but the one project that tracks 'me'; its 15-s get_me() diff loop (exact offline timestamp from was_online, online detected on next poll) is precisely the stateless primitive that fits a GitHub Actions cron.

Why not fork: every project (a) is designed to watch other people and gates on contacts/targets, (b) assumes a persistent MTProto connection (VPS/Docker/systemd/Heroku), which GitHub Actions cannot provide, and (c) has no community/maintenance (0-27 stars, single-burst commits) so forking buys nothing over writing ~100 lines. No npm/GramJS equivalent exists at all, so a JS collector would be from scratch anyway.

What to build: a tiny stateless poller (Python/Telethon with a StringSession stored as a GitHub secret, or GramJS with StringSession if staying in JS) run by a scheduled workflow every 5 min: connect, `get_me()`, record `status` type plus `was_online`/`expires`, append to a committed JSONL/SQLite file or push to a free Postgres (Supabase/Neon), disconnect. Derive sessions and hour-of-day/day-of-week stats in the Next.js/Vercel dashboard (drjimmy1990's stats.js logic is a good model). Accept the known limits: GH cron >=5 min and delayed at top of hour, sessions shorter than the poll gap are lost, only offline timestamps are exact; if minute-level fidelity is later needed, move the collector to a persistent free host (Fly/Oracle free tier/Raspberry Pi) using cubicbyte's or tima100faces' events.UserUpdate pattern with a polling watchdog (as drjimmy1990/alexcircuits/SPT all found necessary).

## Open questions
- Does Telegram deliver UpdateUserStatus for the logged-in account's own status changes (from other sessions)? No repo or doc answers this; Ibrahim-Radzhabov's handler filters out self id (suggesting they may arrive) while tima100faces' README says self cannot be tracked. Needs an empirical test if an event-driven self-collector is considered.
- Does the collector's own MTProto session (polling get_me from GitHub Actions) ever mark the account online and pollute the stats? Telethon issue #328 indicates a bare client does not appear online without account.updateStatus, but this was not verified on current layers - test by watching status from a second client during a poll.
- Whether GitHub Actions' 5-minute minimum and load-related delays are acceptable for the user's desired granularity (short sessions <5 min will be missed; online-start times will be quantized).
- Rate-limit/FloodWait behaviour of get_me()/users.getUsers when called every 5 minutes from rotating GitHub Actions IPs (repos note FloodWait handling but none run from CI).
- Telegram ToS/user-API risk for userbot-style automation (suggydev/SPT README explicitly flags it) - relevant even for self-tracking.
