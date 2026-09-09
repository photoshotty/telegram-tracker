# telegram-tracker

Logs when tracked Telegram accounts are online / last seen, every 5 minutes, and shows StreamAlert-style analytics (sessions, weekly timetable, time-of-day) in a local dashboard. Read-only: it never sends messages or touches presence. Research and design notes: [RESEARCH.md](RESEARCH.md).

## Daily use

```bash
npm run dev        # http://localhost:3000
```

Everything else is a button in the dashboard. No Telegram login on this PC.

| Button | What it does |
|---|---|
| **Add** (People panel) | By @username, or **found by GitHub** for people without a username: from your main account, forward any message from them (or share their contact card) to the polling account, press Poll now, then pick them. Saves them here, pushes the list to a GitHub secret; GitHub looks the person up on its next poll and publishes an encrypted name map only your key can read. |
| **also track the polling account itself** | Untick when a separate account does the polling. |
| trash icon | Stops tracking someone (their data stays). |
| **Sync** | Re-pushes the username list and data key to GitHub secrets. |
| **Poll now** | Triggers the GitHub Action, waits for it, and pulls the new samples. |
| **Pull latest** | `git pull` the samples the Action committed. The page also pulls by itself at most once a minute. |
| **renew via QR** | Only if Telegram ever revokes the session GitHub uses: scan once, the new session goes straight into the GitHub secret. |

New people show "waiting for next poll" until the Action runs (up to 5 minutes, sometimes longer when GitHub's scheduler is busy). Press **Poll now** to skip the wait.

## How the pieces fit

| Where | What lives there |
|---|---|
| GitHub Actions (public repo) | Runs `src/collect.mjs` every 5 min and commits to `data/` |
| `data/<token>/YYYY-MM.jsonl` (public) | Timestamps only. `<token>` = HMAC of the Telegram id with `TG_DATA_KEY`, so ids are not recoverable without the key |
| `data/targets.map.enc` (public) | AES-encrypted map token → id, username, name. Readable only with the key |
| `data/targets.cache.enc` (public) | AES-encrypted cache of resolved access hashes, useless without the key and the CI session |
| GitHub secrets | `TG_API_ID`, `TG_API_HASH`, `TG_SESSION` (the only Telegram login), `TG_TARGETS` (usernames), `TG_DATA_KEY` |
| `targets.local.json` (local, gitignored) | Your list: usernames, custom names, notes |
| `.env` (local, gitignored) | API keys and the same `TG_DATA_KEY` |
| `web/` | Next.js dashboard, local only, bound to 127.0.0.1 |

## One-time setup on a new machine

1. `cp .env.example .env` and fill `TG_API_ID`, `TG_API_HASH` from https://my.telegram.org/apps and the existing `TG_DATA_KEY` (same value as the GitHub secret; never change it, folder names derive from it).
2. `npm install && npm --prefix web install`
3. `npm run dev`. Done.

CLI equivalents if you ever want them: `npm run targets -- add @user | remove @user | list | sync | keygen`, `npm run login:qr` (prints a session string for the GitHub secret), `npm run poll` (local test poll into `data-local/`, needs `TG_SESSION` in `.env`).

## Publishing from scratch (already done for photoshotty/telegram-tracker)

```bash
git init -b main && git add -A && git commit -m "collector"
gh repo create telegram-tracker --public --source=. --push
gh secret set TG_API_ID --body "<api_id>"
gh secret set TG_API_HASH --body "<api_hash>"
npm run login:qr             # scan; paste the printed string into the next command only
gh secret set TG_SESSION     # reads the string from stdin
npm run targets -- sync      # uploads TG_TARGETS and TG_DATA_KEY
```
Then Actions → poll → Run workflow. Public repo matters: private repos would exceed the free Actions minutes.

Optional: GitHub's cron drifts. A 5-minute job on https://cron-job.org that POSTs to `https://api.github.com/repos/photoshotty/telegram-tracker/actions/workflows/poll.yml/dispatches` with `Authorization: Bearer <fine-grained token, Actions read/write>` and body `{"ref":"main"}` keeps it punctual.

## Data format

One JSON object per poll per account in `data/<token>/YYYY-MM.jsonl`:

```json
{"t":1788922255,"s":"offline","wo":1788922037,"ex":null,"src":"poll"}
```

- `t`: unix time of the poll
- `s`: `online` | `offline` | `recently` | `week` | `month` | `empty`
- `wo`: exact last-seen unix time (offline only)
- `ex`: online-until unix time (online only)

Every session **end** is exact (`wo`). Session **starts** are known only to within one poll interval; the dashboard marks those with ≈.

## Rules that keep the account safe

- Exactly one Telegram session exists, and only GitHub Actions uses it.
- The collector never calls `account.updateStatus`; each username is resolved once (cached, encrypted), dead usernames are retried once a day, and a flood wait pauses lookups.
- Use an established Telegram account, not a fresh virtual number.
- People who hide their last seen only yield "recently"; the dashboard flags them.

## Upgrade path

Move `src/collect.mjs` to an always-on box (home PC, Koyeb, Fly, GCP e2-micro) and poll every 60 s plus listen for `UpdateUserStatus` events. The data format and dashboard stay the same. Details in [RESEARCH.md](RESEARCH.md).
