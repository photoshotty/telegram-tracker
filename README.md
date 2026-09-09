# telegram-tracker

Logs when tracked Telegram accounts are online / last seen, every 5 minutes, and shows StreamAlert-style analytics (sessions, weekly timetable, time-of-day) in a local dashboard. Read-only: it never sends messages or touches presence. Research and design notes: [RESEARCH.md](RESEARCH.md).

## How the pieces fit

| Where | What lives there |
|---|---|
| GitHub Actions (public repo) | Runs `src/collect.mjs` every 5 min and commits samples to `data/` |
| `data/<token>/YYYY-MM.jsonl` (public) | Timestamps only. `<token>` = HMAC of the Telegram id with `TG_DATA_KEY`, so ids are not recoverable without the key |
| `data/targets.cache.enc` (public) | AES-encrypted cache of resolved access hashes, useless without the key and the CI session |
| GitHub secrets | `TG_API_ID`, `TG_API_HASH`, `TG_SESSION` (CI login), `TG_TARGETS` (usernames), `TG_DATA_KEY` |
| `targets.local.json` (local, gitignored) | Your list: usernames, names, notes, numeric ids |
| `.env` (local, gitignored) | Your local login + the same `TG_DATA_KEY`, so the dashboard can match tokens to names |
| `web/` | Next.js dashboard, run locally with `npm run dev` |

## Setup

1. **Privacy check.** People you track must have Settings > Privacy and Security > Last Seen & Online = Everybody. Otherwise Telegram only returns "recently" and no timestamps.

2. **API keys.** https://my.telegram.org/apps . Put `api_id` and `api_hash` into `.env` (copy `.env.example`).

3. **Data key.** `npm run targets -- keygen` and paste the printed line into `.env`. Keep it forever: changing it renames every data folder.

4. **Local login (once).** `npm run login:qr`, scan with the Telegram app (Settings > Devices > Link Desktop Device), paste the printed `TG_SESSION=` line into `.env`. This session is only used on your PC.

5. **Test.** `npm run poll` polls your own account and writes `data/<token>/…`. Then `npm run dev` and open http://localhost:3000.

6. **Add people.**
   ```bash
   npm run targets -- add @username --name "Alice" --note "friend"
   npm run targets -- list
   npm run targets -- remove @username
   ```
   `add` resolves the username with your local session and stores id + name locally only.

7. **Publish the collector.**
   ```bash
   git add -A && git commit -m "collector"
   gh repo create telegram-tracker --public --source=. --push
   ```
   CI needs its **own** login. Either move the current `.env` session to the secret and log in again locally, or run `npm run login:qr` a second time and use the new string for CI. Never let both places use the same string:
   ```bash
   gh secret set TG_API_ID --body "<api_id>"
   gh secret set TG_API_HASH --body "<api_hash>"
   gh secret set TG_SESSION --body "<the CI session string>"
   npm run targets -- sync      # uploads TG_TARGETS and TG_DATA_KEY
   ```
   Start it: https://github.com/photoshotty/telegram-tracker/actions/workflows/poll.yml > Run workflow. It then runs every 5 minutes.

8. **Optional: punctual polling.** GitHub's schedule drifts. Add a 5-minute job on https://cron-job.org that POSTs to
   `https://api.github.com/repos/photoshotty/telegram-tracker/actions/workflows/poll.yml/dispatches`
   with headers `Authorization: Bearer <token>`, `Accept: application/vnd.github+json` and body `{"ref":"main"}`. Token: https://github.com/settings/personal-access-tokens/new with Actions = Read and write on this repo.

## Daily use

- `npm run dev` for the dashboard. Press **Pull latest** in the header (or `npm run sync`) to fetch what the Action committed.
- After changing the list: `npm run targets -- sync`. CI resolves new usernames on its next run.

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

- One session string is never used from two places at the same time (local vs CI are separate logins).
- The collector never calls `account.updateStatus` and never resolves usernames repeatedly (cached once).
- Use an established Telegram account, not a fresh virtual number.

## Upgrade path

Move `src/collect.mjs` to an always-on box (home PC, Koyeb, Fly, GCP e2-micro) and poll every 60 s plus listen for `UpdateUserStatus` events. The data format and dashboard stay the same. Details in [RESEARCH.md](RESEARCH.md).
