# PRD — Subturtle CEO Agent App

**Status:** Draft
**Author:** Navid Shad (with Claude)
**Date:** 2026-06-06

## 1. Overview

This app is the body of an AI agent that acts as the CEO and project manager of Subturtle: a small always-on service that wakes the agent on events and timers, gives it tools, and keeps its memory. The agent's behaviour — including its **name and identity** — is defined by `CONTRACT.md`. The app loads the contract at the start of every run; the agent figures out who it is from there. The app itself is name-agnostic.

**Main goal of the agent:** push Subturtle to revenue.
**Main goal of the app:** make sure the agent wakes at the right moments, with the right context, and can act safely.

## 2. Background

- The contract (`CONTRACT.md`) defines identity, permissions, and rhythms. If a prompt conflicts with the contract, the contract wins.
- The council repo (https://github.com/codebridger/subturtle-docs, branch `main`) holds the product documentation and decision workflows. The agent clones it fresh and follows what it says.
- Team: Navid Shad (founder, final word), Somayeh Roohani (full-stack, takes any kind of task), and the agent (CEO, own ClickUp account).
- Public discussion happens in the ClickUp chat channel "Subturtle.app".

## 3. Architecture summary

- **Runtime:** Node.js (TypeScript) service using the **Claude Agent SDK**. Each wake-up = one SDK `query()` run with the contract as system prompt plus a task-specific prompt.
- **Models:** Sonnet for frequent PM checks; Opus for heartbeats, council runs, and self-improvement.
- **Connections (MCP / API):** ClickUp (as the agent's own account), Stripe (read), Mixpanel (read), git/GitHub (clone, branch, PR), public product URLs (read).
- **Triggers:** ClickUp webhook events, a PM-check timer (every 5 hours), a heartbeat timer (slower), and manual runs.

## 4. Functional requirements

### 4.1 Triggers and wake-ups

1. **Webhook listener.** A public HTTPS endpoint receives ClickUp events. It must:
   - verify the `X-Signature` (HMAC-SHA256) before trusting any event,
   - ack with 200 fast,
   - then route the event by category (below).

   **Event categories:**

   | Category | Events | Handling |
   |---|---|---|
   | **A — Conversation (wake immediately)** | Direct @mention of the agent (task comment or channel message) · **private/direct message to the agent** — anyone on the team can chat with it | Load the thread file, reply now, update the thread file |
   | **B — Activity (to inbox, batch)** | `taskCreated` · `taskUpdated` · `taskStatusUpdated` · comments that do not mention the agent · other workspace activity | Append to `events/inbox.jsonl`; processed at the next PM check |
   | **C — Ignore** | Anything authored by the agent's own account (loop guard) · event types not relevant | Drop |

   *Implementation note:* if ClickUp webhooks do not cover direct/chat messages, the app polls the agent's DM channels on a short interval (1–2 min) and feeds the messages into Category A — same behaviour, different transport.
2. **Event inbox.** An append-only file (`events/inbox.jsonl`) where the listener writes every Category B event. Each line: timestamp, event type, task/thread ID, author, short payload. The inbox is the PM check's worklist. After processing, events are moved to an archive file (`events/processed.jsonl`) — never silently dropped.
3. **PM-check timer.** Every 5 hours (configurable), wake the agent for the PM check defined in the contract. The check **starts from the inbox**: read all accumulated events, group them by task/thread, and act over each group — answer comments, react to status changes, chase stuck work, encourage finished work. Then the usual sweep: review active tasks, and if nothing is active, propose the next batch in the public channel.
4. **Heartbeat timer (the CEO act).** Once every 24 hours on **working days, Monday to Friday** (configurable), run the full heartbeat: read Stripe/Mixpanel/ClickUp/repo, assess, draft moves, discuss, log the beat in the council repo's `ops/heartbeat-log/`.
5. **Manual trigger.** A CLI command or simple endpoint to run any of the above on demand.

### 4.2 Memory

The agent manages its own memory as plain files in the app's data directory (git-ignored or in a separate data volume):

1. **Thread files (episodic memory).** One markdown file per conversation thread, named by source and ID (e.g. `threads/clickup-task-86exu5xd7.md`, `threads/chat-901805492347.md`). Each file holds the running history of that thread: who said what, what the agent replied, what was agreed. When an event arrives, the agent loads the matching thread file and has the full story.
2. **Thread index.** One `threads/INDEX.md` file with one line per thread (ID, title, last activity, one-line state). The agent reads the index first and opens only the threads it needs.
3. **Long-term facts.** One `memory/FACTS.md` file for stable business facts (pricing, tier names, known context like the Iran blackout, decisions that keep mattering). Updated when a fact changes, not per event.
4. **Compaction.** When a thread file passes a size limit, the agent summarizes the older part into a short "story so far" block at the top and keeps only recent messages in full.
5. **Beat logs** stay in the council repo (`ops/heartbeat-log/`), not in app memory — they are the business history, not the conversation history.

> Design note: SDK sessions could also carry short-term context (mapping thread ID → session ID for fast resume), but files stay the source of truth — they are readable, debuggable, and survive restarts and model changes.

### 4.3 Self-improvement

The agent can improve its own instructions, with review:

1. The agent's editable instruction files live in this repo (prompts, playbooks, PM-check checklist — **not** the contract).
2. When the agent learns something that should change its behaviour, it edits the instruction files, commits to a dedicated branch (`self-improve/<topic>`), pushes, opens a PR, and **tags Navid for review**.
3. Changes apply only after merge; the running app picks them up at the next restart (see 4.5).
4. `CONTRACT.md` can be *proposed* against the same flow, but the PR description must clearly say "contract change" — Navid's merge is the only way the contract changes.

### 4.4 Webhook self-management

1. The agent can **register** new ClickUp webhook subscriptions (new events, new list/space scopes) on its own — registering is additive.
2. The agent can **unregister** a webhook only after Navid's OK in private chat — removal is destructive (contract rule).
3. The app keeps a `webhooks.json` state file listing active registrations (ID, events, scope, created date), and reconciles it against ClickUp on startup (re-create missing, report unknown).

### 4.5 Self-restart

1. The agent can schedule a restart of its own app (e.g. "restart at the next idle moment" or "restart at 02:00") — used after a self-improvement PR merges or config changes.
2. Restart is graceful: finish the current run, flush memory files, then exit and let the process manager (Docker/PM2/systemd) bring the app back up.
3. A restart never drops inbox events (the inbox lives on disk and survives restarts).
4. Crash-loop guard: if the app restarts more than N times in an hour, it stops retrying and notifies Navid in private chat.

### 4.6 Communication

1. All team-visible messages go through the agent's own ClickUp account: comments on tasks, messages in the "Subturtle.app" channel.
2. **Anyone on the team can chat with the agent in private (DM).** The agent replies immediately (Category A) and keeps the conversation in that thread's memory file.
3. Private chat with Navid additionally carries confirmations (edits/removals) and alerts (failures, crash loops, blocked work nobody takes) — only Navid's DM can approve those.
4. Every action follows the contract: comments free; create after discussion; edit/remove after Navid's OK; repo changes by PR.

## 5. Non-goals

- No dashboard or UI — ClickUp and git are the interfaces.
- No payment, pricing, deploy, or user-email actions — ever (contract).
- No vector database or embedding search for memory in v1 — plain files and grep are enough at this scale.
- No multi-company or multi-agent support — this app hosts one agent, for Subturtle.

## 6. Open questions

1. Where does the app run — small VPS, container platform, or GitHub-Actions-style on-demand? (First ADR in this repo.)
2. Which exact channel/API is "private chat with Navid" — ClickUp DM, or another channel?
3. Webhook scope at start: only the Subturtle.app list, or the whole Engineering space?
4. How does Navid trigger a manual heartbeat — CLI on the server, or a command message in chat (e.g. mentioning the agent with "run heartbeat")?

## 7. Milestones (task-based, no time estimates)

1. **M1 — Skeleton:** Node app + Agent SDK run with contract loaded; manual trigger works end to end (read ClickUp, post one comment as the agent).
2. **M2 — Webhook:** signed webhook listener + loop guard + event inbox + thread files; direct mentions answered immediately with thread history.
3. **M3 — Rhythms:** PM check every 5 hours processing the inbox + weekday daily heartbeat + beat logs to the council repo by PR.
4. **M4 — Self-management:** self-improvement PR flow, webhook register/unregister, scheduled restart with crash-loop guard.

## 8. Connector readiness (verified 2026-06-06)

Live check of the MCP/API connections the agent depends on (§3).

| Connector | PRD need | Status | Notes |
|---|---|---|---|
| **ClickUp** | read/write | ✅ Working | Workspace `9018800487`; `Subturtle.app` list `901805492347` (70 tasks); public channel `6-901805492347-8` + private DM channels visible. Team resolves: Navid `78238611`, Somayeh `78238620`. |
| **Stripe** | read | ✅ Working | Live account **Subturtle** `acct_1QFZu6JzqwOMGRBg` (`livemode:true`); balance + charges read OK. Recent charges $9.99 USD; balance held in GBP (consistent with in-flight GBP-base pricing work). |
| **Mixpanel** | read | ⚠️ Blocked | Auth works and lists projects (`Subturtle-dev` `3785672`, `Subturtle Legacy` `2795069`), but both return *"MCP access is not enabled for this project"*. No event/query reads until an org admin enables MCP access per-project. |
| **git/GitHub** | clone/branch/PR | ✅ Available | via CLI. |

**Action items:**
1. **Mixpanel — enable MCP access** on `Subturtle-dev` and `Subturtle Legacy` (Project Settings, admin-only). Blocks the heartbeat's Mixpanel read (§4.4). Also pin in the contract *which* project the heartbeat reads.
2. **Webhook management has no MCP tool.** The ClickUp connector exposes tasks/chat/docs but not webhook register/unregister or `X-Signature` verification — M2/§4.4 must call the ClickUp REST API directly.
3. **Stripe read-only is not enforced by the connector.** The connected Stripe tool is write-capable (`stripe_api_execute`) and points at the live account. The §5 "no payment actions, ever" guardrail must be enforced in CONTRACT/app code.