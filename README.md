# CEO-Agent

Aso Dara — Subturtle's AI CEO agent. Watches the business (Stripe, Mixpanel, ClickUp), runs heartbeats and PM checks, and pushes the team toward revenue — discussing before acting, with the founder holding the final word.

The app body is **headless Claude Code** (`claude -p`) with `CONTRACT.md` loaded as the system prompt on every run. Each wake = one fresh run that inherits the claude.ai connectors (ClickUp authed as Aso, Stripe/Mixpanel read).

## Setup

```bash
npm install
cp .env.example .env   # fill in CLICKUP_API_TOKEN + WEBHOOK_PUBLIC_URL
npm run typecheck
```

## M1 — manual triggers

```bash
npm run trigger -- read              # summarise the Subturtle.app board (no writes)
npm run trigger -- dm-navid          # send Navid a first private chat message
npm run trigger -- comment <taskId>  # read a task and post one comment as Aso
```

## M2 — the wake loop (webhook + chat poller)

A long-running process (pm2) that wakes Aso on its own:

- **Webhook listener** — ClickUp POSTs task events to an HTTPS endpoint; the `X-Signature`
  (HMAC-SHA256) is verified, then events are categorized **A** (mention → reply now),
  **B** (activity → `data/events/inbox.jsonl` for the M3 PM check), or **C** (dropped — incl.
  the loop guard for Aso's own activity).
- **Chat poller** — ClickUp has no chat webhook, so DMs/@mentions are polled every ~90s via REST.
- **Thread files** — `data/threads/<source>-<id>.md` give Aso the history of each conversation;
  `data/threads/INDEX.md` indexes them.

### One-time exposure (Cloudflare → this box)

1. Add a **proxied** (orange-cloud) DNS record for a subdomain → the box's static IP.
2. Cloudflare → **SSL/TLS → set mode to "Full"** (accepts the self-signed origin cert).
3. EC2 Security Group → allow inbound **TCP 443** (ideally restricted to Cloudflare IP ranges).
4. Set `WEBHOOK_PUBLIC_URL=https://<subdomain>/clickup/webhook` in `.env`.

### Run

```bash
# self-signed origin cert (once)
mkdir -p data/tls
openssl req -x509 -newkey rsa:2048 -nodes -days 825 \
  -keyout data/tls/origin.key -out data/tls/origin.crt -subj "/CN=<subdomain>"
# let node bind :443 without root (once)
sudo setcap 'cap_net_bind_service=+ep' "$(readlink -f "$(which node)")"

npm run build
npm run webhook -- register          # creates the ClickUp webhook, saves secret to data/webhooks.json
npm run webhook -- list              # show / reconcile registrations

pm2 start ecosystem.config.cjs       # run the listener + poller
pm2 logs ceo-agent
pm2 save                             # persist across reboots (after `pm2 startup`)
```

## Data layout (git-ignored `data/`)

```
data/
  webhooks.json        # active webhook id + signing secret
  tls/                 # self-signed origin cert
  threads/             # per-thread episodic memory + INDEX.md
  events/inbox.jsonl   # Category-B activity awaiting the PM check
  poller/cursors.json  # last-seen chat message per channel
```

See `prd.md` for the full product spec and milestones, and `CONTRACT.md` for Aso's operating contract.
