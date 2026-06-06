# CEO-Agent

A headless **AI CEO agent**: it watches the business (Stripe, Mixpanel, ClickUp), answers the team, runs PM checks and heartbeats, and pushes toward revenue — discussing before acting, with the founder holding the final word.

The agent's **persona** — name, voice, account, and operating rules — is defined entirely by [`CONTRACT.md`](CONTRACT.md) plus the `AGENT_NAME` setting, not by the code. **This instance runs as _Aso Dara_ for Subturtle**; another deployment loads a different contract and name and is otherwise the same body. The product spec and milestones are in [`prd.md`](prd.md).

---

## How it works

### The body is headless Claude Code

The agent has no long-running "brain". Each time it needs to act, the app spawns **one fresh headless Claude Code run** (`claude -p`) with [`CONTRACT.md`](CONTRACT.md) loaded as the system prompt:

```
claude --print "<task>" --append-system-prompt-file CONTRACT.md \
       --output-format json --model sonnet --disallowedTools <guardrails> ...
```

Because the contract is re-read on every run, editing it takes effect on the next wake — no redeploy. The run inherits the **claude.ai connectors** (ClickUp authed as the agent's account, Stripe/Mixpanel read), so the agent reads and writes the business as itself. This wrapper is `src/agent/runner.ts` (`runAgent`) — the single engine every trigger goes through.

### What wakes the agent

A long-running Node process (pm2) turns external events into agent runs. Two transports feed one categorizer:

```
ClickUp task event ─POST─▶ Cloudflare ─▶ tunnel ─▶ HTTP listener (:8787)
   │  verify X-Signature (HMAC-SHA256) → 200 ack ──────────────┐ (fast, synchronous)
   └─ off the request path ▶ categorize ─┬─ C  drop (incl. loop guard)
                                          ├─ B  append data/events/inbox.jsonl
                                          └─ A  handleWake(thread, msg) ─▶ runAgent
chat (DMs/@mentions) ─poll ~90s via REST─▶ new, not self ▶ handleWake(...) ─▶ runAgent
```

- **Webhook listener** (`src/server/`) receives ClickUp **task** events, verifies the `X-Signature` (HMAC-SHA256 of the raw body) against the registered secret, **acks 200 immediately**, then dispatches off the request path so the ack stays fast.
- **Chat poller** (`src/poller/`) covers what webhooks can't: ClickUp has **no chat webhook**, so DMs and channel @mentions are polled every ~90s via the v3 chat REST API. Per-channel cursors (`data/poller/cursors.json`) mean only genuinely new messages wake the agent; on first sight a channel is baselined so old history never replays.

### Categories (PRD §4.1)

`src/dispatch/categorize.ts` sorts every event:

| | What | Handling |
|---|---|---|
| **A** | A direct **@mention** of the agent on a task, or any **DM** | Wake now: load the thread, reply, record |
| **B** | Other task activity (created / updated / status / moved …) | Append to `data/events/inbox.jsonl` for the PM check |
| **C** | **Anything authored by the agent itself** (loop guard), or irrelevant types | Drop |

The loop guard keys on the agent's own ClickUp user id (`AGENT_USER_ID`); @mention detection keys on `AGENT_NAME` — both config, so nothing about the identity is baked into the code.

### Memory (PRD §4.2)

The app owns the agent's episodic memory as plain files so it survives restarts and is debuggable:

- `data/threads/<source>-<id>.md` — one file per conversation (e.g. `clickup-task-86e….md`, `chat-8crzyb7-1458.md`), holding the running history. On a wake, the matching file is loaded as context so the agent answers *with the full story*.
- `data/threads/INDEX.md` — one line per thread.
- Files are compacted (older part summarized to a "story so far") once they pass a size limit.

### How the agent replies

- **Task replies** post as a **threaded reply under the triggering comment** (not a new root comment), assigned to the asker + `notify_all` so they actually get a ClickUp notification. ClickUp has no MCP tool for threaded replies, so the **agent composes** the text and the **app posts it** via REST (`/comment/{id}/reply`). A root-level comment is used only if the asker explicitly asks ("root", "top level", "new comment").
- **Chat replies** go out through the agent's connector, addressing the person and adding them as a follower so they're notified.

### Rhythms (PM check + heartbeat)

Beyond reacting, the agent runs two scheduled routines (`src/rhythms/`), via a 60s scheduler that
persists state in `data/schedule.json` (survives restarts, catches up a missed run, never
double-fires):

- **PM check — every 5h** (Sonnet): drains the inbox, groups activity by task, chases stuck work,
  answers, encourages, and proposes the next batch if nothing is active. Archives the inbox after.
- **Heartbeat — weekdays 08:00 (`HEARTBEAT_TZ`)** (Opus): clones the council repo
  (`subturtle-docs`) **read-only** for context (playbook, metrics framework, decisions), pulls
  Stripe/Mixpanel/ClickUp/repo state, posts 2–4 ranked moves to the public channel, and writes a
  beat log to **`data/heartbeats/<date>.md`** (the agent's own history, committed to this repo — not
  the council repo).

Both can be run on demand: `npm run trigger -- pm-check|heartbeat`, or Navid DMs the agent
**"run heartbeat" / "run pm check"** (honored only from his account). The agent's history (threads +
beat logs) is committed to the repo at the end of each rhythm; secrets in `data/` stay git-ignored.

### Guardrails (defense in depth)

The contract is the primary control, backed at the tool layer (`src/agent/policy.ts`, passed as `--disallowedTools`): Stripe writes and ClickUp task-deletes are blocked on every run. During a **task wake** the comment tool is *also* blocked — the agent composes but cannot post, so the write-capable REST token stays server-side and can't be used to bypass those guardrails.

---

## Run it as an instance

How to stand up a live instance (this is the actual production setup — a Cloudflare Tunnel, because the host blocks direct inbound).

### 0. Prerequisites

- Node 22+, npm, `git` — and a logged-in **Claude Code** on the same machine/user (the agent runs inherit its connectors).
- A **ClickUp personal API token** (`pk_…`) for the agent's account — Settings → Apps → API Token. Used only for webhook register/list and the chat poll; never for acting.
- A domain on Cloudflare (here: `subturtle.app`) for the public webhook hostname.

### 1. Install & configure

```bash
npm install
cp .env.example .env     # then edit .env
```

Set the agent's persona and the required keys in `.env` (full list in [Configuration](#configuration)):

```ini
AGENT_NAME=Aso Dara                 # this instance's name (used for @mention detection)
AGENT_USER_ID=113552267             # the agent's own ClickUp account id (loop guard)
CLICKUP_API_TOKEN=pk_xxxxxxxx
WEBHOOK_PUBLIC_URL=https://aso-agent.subturtle.app/clickup/webhook
SERVER_TLS=false                    # behind a tunnel; the listener serves plain HTTP on loopback
PORT=8787
```

The agent's voice and rules live in `CONTRACT.md` — edit it to match the persona named above.

### 2. Expose the listener — Cloudflare Tunnel (recommended)

A tunnel dials **out** to Cloudflare, so it needs no inbound firewall/security-group rule (works behind managed/NAT'd hosts). Install `cloudflared`, then:

```bash
cloudflared tunnel login                       # browser auth; pick the zone (e.g. subturtle.app)
cloudflared tunnel create ceo-agent            # note the tunnel UUID

# ~/.cloudflared/config.yml
#   tunnel: <UUID>
#   credentials-file: /home/<user>/.cloudflared/<UUID>.json
#   ingress:
#     - hostname: aso-agent.subturtle.app
#       service: http://localhost:8787
#     - service: http_status:404

cloudflared tunnel route dns --overwrite-dns ceo-agent aso-agent.subturtle.app
```

<details>
<summary>Alternative: direct-to-origin (no tunnel)</summary>

If the host accepts public inbound, set `SERVER_TLS=true`, `PORT=443`, point a **proxied** Cloudflare A record at the box, set SSL/TLS mode **Full**, open the security group on 443, and:

```bash
mkdir -p data/tls
openssl req -x509 -newkey rsa:2048 -nodes -days 825 \
  -keyout data/tls/origin.key -out data/tls/origin.crt -subj "/CN=<your-hostname>"
sudo setcap 'cap_net_bind_service=+ep' "$(readlink -f "$(which node)")"   # bind :443 as non-root
```
</details>

### 3. Build & register the webhook

```bash
npm run build
npm run webhook -- register     # creates the ClickUp webhook, saves the signing secret to data/webhooks.json
npm run webhook -- list         # show ClickUp's webhooks and reconcile with local state
```

### 4. Start under pm2

```bash
pm2 start ecosystem.config.cjs                  # starts ceo-agent (listener + poller)
pm2 start cloudflared --name ceo-tunnel -- tunnel --config ~/.cloudflared/config.yml run
pm2 save                                        # persist the process list
sudo env PATH=$PATH pm2 startup systemd -u $USER --hp $HOME   # relaunch on reboot
```

### 5. Verify

```bash
curl https://aso-agent.subturtle.app/health     # → ok (proves ClickUp → tunnel → listener)
```

Then, from a **different** account (not the agent's): post a comment **@mentioning the agent** on a task (expect a threaded reply + notification within seconds), and send it a **DM** (expect a chat reply within ~`POLL_INTERVAL_MS`).

### Operating it

```bash
pm2 status                       # both apps online?
pm2 logs ceo-agent               # wake / dispatch / poller activity
pm2 logs ceo-tunnel              # tunnel connections
pm2 restart ceo-agent --update-env   # after an .env change
npm run webhook -- list          # reconcile the webhook against ClickUp (re-register if missing)
```

To deploy a code change: `git pull && npm run build && pm2 restart ceo-agent`. Contract-only changes (`CONTRACT.md`) need **no** rebuild or restart — the next wake reads the new contract.

---

## Manual triggers (no server needed)

Run any of these on demand; each is one headless run as the agent:

```bash
npm run trigger -- read              # summarise the Subturtle.app board (no writes)
npm run trigger -- dm-navid          # send the founder a first private chat message
npm run trigger -- comment <taskId>  # read a task and post one comment
npm run trigger -- pm-check          # run the PM check now (drain inbox, sweep work)
npm run trigger -- heartbeat         # run the heartbeat now (assess, draft, write a beat log)
```

---

## Configuration

`.env` (copy from `.env.example`). Secrets stay here and in `data/` — both git-ignored.

| Var | Meaning |
|---|---|
| `AGENT_NAME` | The persona this instance runs as (used for @mention detection) |
| `AGENT_USER_ID` | The agent's own ClickUp account id (loop guard) |
| `CLICKUP_API_TOKEN` | The agent's `pk_…` token — webhook register/list + chat poll only |
| `WEBHOOK_PUBLIC_URL` | Public URL ClickUp posts to (the tunnel hostname + `/clickup/webhook`) |
| `WEBHOOK_PATH` | Path the listener serves (default `/clickup/webhook`) |
| `SERVER_TLS` | `false` behind a tunnel (plain HTTP); `true` for direct-to-origin HTTPS |
| `PORT` | Listener port (`8787` behind a tunnel; `443` direct) |
| `POLL_INTERVAL_MS` | Chat poll cadence (default `90000`) |
| `THREAD_COMPACT_BYTES` | Compact a thread file past this size (default `24000`) |
| `PM_CHECK_INTERVAL_MS` | PM check cadence (default `18000000` = 5h) |
| `HEARTBEAT_HOUR` / `HEARTBEAT_TZ` | Weekday heartbeat time (default `8` / `Europe/Vilnius`) |
| `COUNCIL_REPO` | Council repo for read-only heartbeat context (default `codebridger/subturtle-docs`) |
| `AGENT_GIT_EMAIL` | Git author email for the agent's history commits |
| `MODEL_PM` / `MODEL_HEARTBEAT` | Model tiers (default `sonnet` / `opus`) |
| `CLICKUP_WORKSPACE_ID`, `NAVID_USER_ID`, `SOMI_USER_ID`, `*_CHANNEL_ID`, `SUBTURTLE_APP_LIST_ID` | Workspace, team, and routing ids |

The webhook **signing secret** is *not* in `.env` — `webhook register` writes it to `data/webhooks.json`.

## Data layout (`data/`)

Most of `data/` is git-ignored runtime state; the agent's **history** (`threads/`, `heartbeats/`)
is the exception — it's version-controlled in this repo.

```
data/
  threads/             # per-thread episodic memory + INDEX.md      [tracked in git]
  heartbeats/          # the agent's beat logs, <date>.md           [tracked in git]
  webhooks.json        # active webhook id + signing secret         (ignored — secret)
  tls/                 # self-signed origin cert                    (ignored — secret)
  events/inbox.jsonl   # Category-B activity awaiting the PM check  (ignored)
  poller/cursors.json  # last-seen chat message per channel         (ignored)
  schedule.json        # last PM check / heartbeat run              (ignored)
  council/             # read-only clone of the council repo        (ignored)
```

## Roadmap

- **M1 — Skeleton** ✅ headless runner + manual triggers.
- **M2 — Webhook** ✅ signed listener + loop guard + inbox + thread memory + chat poller (this).
- **M3 — Rhythms** ✅ PM check every 5h draining the inbox + weekday heartbeat with beat logs (this).
- **M4 — Self-management** — self-improvement PRs, agent-driven webhook register/unregister, scheduled restart.
