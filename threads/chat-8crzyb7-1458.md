# Thread chat-8crzyb7-1458

## Story so far (compacted 2026-07-16T14:18:09.115Z)

# Thread chat-8crzyb7-1458 — Story so far (compacted 2026-07-16)

**Who:** Navid Shad (founder) and Aso Dara (CEO agent). DM thread `chat-8crzyb7-1458`.

**Background carried in:** Browser/Playwright unblocked. Activation bug fixed in prod. Blog-ideas pitch job runs every 3 days. PM check moved to long-job path (PR #20, 20-min budget, checkpoint-and-continue). Blog workflow (`wf-blog-content-mqbiekea`) is the single source of truth — no duplicate workflows.

**Blog workflow rules locked in this window, in order of arrival:**

1. **Structure:** draft lives in WordPress from step 1 (not in the ClickUp task description); task description only holds topic, keyword, one-line angle, and a 4-step checklist.
2. **4-step checklist per task:** (1) draft in WP + fill Preview URL, (2) generate 2 images and place them (both inline, top one also set as hero), (3) SEO, (4) schedule.
3. **Images:** 2 required, both inside the body text, top one also set as WP featured image/hero. Generated one at a time via Gemini, uploaded via `mcp__wordpress__upload_media`.
4. **Category:** must be set at draft creation, not publish. If no matching category exists, Aso picks the closest and flags it for rename — never invents new categories.
5. **Scheduling, not publishing:** final step is SCHEDULE. Aso picks the date herself using a spacing rule (next open weekday 09:00 Europe/Vilnius, min 2 days apart, target 3, weekends only as overflow if 5+ drafts queued), logs the chosen date on the task so Navid can override with one reply. Navid confirmed twice he doesn't want to approve individual slots — Aso decides.
6. **Blog URL field** filled in once actually scheduled; task closed after.

**SEO section (Yoast) — resolved this window:**
Navid asked Aso to open post 507 in the browser and audit every Yoast Premium panel. Aso catalogued all 13 sections and reported back (focus keyphrase, Premium SEO analysis, readability, related keyphrase, Wincher tracking, internal-link suggestions, search appearance, social appearance, schema, content blocks, advanced, cornerstone, insights). Navid approved the mapping and said no to Yoast's AI features. Aso converted this into hard playbook instructions for step 3 of every blog task:

- Fill Focus keyphrase by hand; leave "related keyphrase" empty (Premium, not worth it at current traffic).
- Write SEO title, meta description, and slug **by hand** — Yoast's AI-generate buttons for title/meta description are explicitly banned.
- **No AI Summarize, no AI Summary block** — Navid confirmed this directly ("we dont need the ai of Yoast").
- Alt text on both images must carry the keyword/variation.
- One internal link (subturtle.app or dashboard.subturtle.app) + one external link to a real source, required.
- Premium SEO analysis must be green (0–1 improvement max); Readability must be green — both gate checklist step 3.
- Schema and Advanced panels: leave defaults unless the post is a genuine how-to.
- Skip: related keyphrase, Wincher, internal-link suggestions, social-media appearance overrides, cornerstone flag, and all Yoast content blocks unless the post genuinely needs FAQ/how-to.

**Open thread at end of window:** Navid's last message ("we dont need the ai of Yoast, yes it does need extra plan, should should be bought beforehand") confirms the AI ban and adds a new fact — the Yoast AI add-on requires a **separate paid plan that would need to be bought in advance**. This closes Aso's earlier open question (whether the AI buttons cost money) — answer: yes, and it's not purchased, so the ban stays in force indefinitely, not just as a temporary caution. No further action needed on this point beyond noting it — the playbook already hard-bans the AI buttons.

**Still open / carried forward from before:**
- Wake-routing PR (generic @-mention scanner) — not green-lit.
- Idea 1 (Pause-Rewind Rule) blog task — waiting on "go."
- LinkedIn title + About rewrite — not locked.
- 8 overdue LinkedIn ideas — awaiting Navid's pick.
- 86eu7hzzt (visual asset pipeline) — archive-or-revive pending.
- 86eu70peq grammar blog thread (5 old fix commitments) — pending direction.
- Post the 3 blog-launch wins in Content Marketing channel — waiting on "post the wins."
- Mixpanel project ID discrepancy (2599235 vs 2795069) — waiting on Navid to clarify.

## Recent
### Aso Dara · 2026-07-02T17:37:26.350Z

Got it. Yoast AI is off the table for good, and yes it needs a separate paid plan we are not buying. Playbook is already hard-set to skip the AI Generate title, AI Generate meta description, and AI Summarize buttons on every post. Title, slug, and meta description are all written by hand. No further change needed.

### Navid Shad (founder) · 2026-07-02T17:39:13.974Z

also mention if the browser is not available, ping me on the task Ill make the browser up

### Aso Dara · 2026-07-02T17:39:14.498Z

Noted. I am adding that fallback to the playbook right now: at step 1 (draft in WP) and step 2 (generate + place images), both of which need the browser + WP admin, if the browser check fails I stop, comment on the task with a clear ping to you saying 'browser is down, please bring it up so I can continue', and pause the task until you reply. I will not retry silently and I will not skip to step 3 without the browser back. Locking it in.

### Navid Shad (founder) · 2026-07-02T17:39:46.118Z

[@Aso Dara](#user_mention#113552267) also mention if the browser is not available, ping me on the task Ill make the browser up

### Aso Dara · 2026-07-02T17:39:46.760Z

Already locked in from your last message — the fallback is in the playbook. At step 1 (draft in WP admin) and step 2 (generate + place images), if the browser check fails I stop, drop a comment on the task tagging you: 'browser is down, please bring it up so I can continue', and pause. No silent retries, no skipping ahead. Nothing else to change.

### Navid Shad (founder) · 2026-07-02T17:43:25.029Z

[@Aso Dara](#user_mention#113552267) please commit the data I want to check them on git, use aso branch

### Aso Dara · 2026-07-02T17:43:25.689Z

Done. Mirrored the live data into the aso-dara branch and pushed.

Commit: 8f0f8f7 'data 2026-07-02 (manual)' on aso-dara
Branch: https://github.com/codebridger/CEO-Agent/tree/aso-dara

Changes in this commit:
- heartbeats/2026-07-02.md (new)
- threads/chat-8crzyb7-1458.md (this thread, updated)
- threads/INDEX.md (updated)
- threads/clickup-task-86eu70pez.md (new)
- workflows/blog-content.md (all today's playbook updates — 2 images inline, SEO via Yoast Premium fields, browser-down fallback, spacing rule)
- memory/notes.md (updated with the new blog-scheduling rule)

All set for you to review.

### Navid Shad (founder) · 2026-07-02T17:52:22.166Z

[@Aso Dara](#user_mention#113552267) I tweaked on the workflow and meentioned use browser for the SEO part, can you fetch it from git?

### Aso Dara · 2026-07-02T17:52:22.643Z

Got it. Fetched blog-content.md from the aso-dara branch and diffed against the live playbook. Your tweak was on Step 3 SEO, item 1: 'Open the WP draft in the block editor and open the Yoast sidebar (use browser).' That makes the browser the required tool for the whole SEO step, which is correct — the WordPress.com MCP does not expose Yoast fields (Focus keyphrase, SEO title, meta description, slug, or the SEO/Readability score panels), so those can only be set through WP admin in the block editor.

Rolling that into the live workflow now, and adding the matching browser-down fallback to Step 3 as well (same rule as Steps 1 and 2: if the browser is down I stop, ping you on the task, wait). No other changes.

### Aso Dara (action) · 2026-07-02T17:52:22.647Z

workflow: updated wf-blog-content-mqbiekea — "blog-content" — sonnet · playbook blog-content · iterate-only (no cron) · list 901809890244

### Navid Shad (founder) · 2026-07-16T14:13:13.549Z

is there any workflow for redit?

### Aso Dara · 2026-07-16T14:13:14.168Z

No, not yet. I only have two workflows running: blog-content and linkedin-content. Reddit has an account set up (u/subtitles_and_coffee, joined 7 language subs) but no workflow behind it, just standing rules I'm holding in memory: stay quiet for 2-3 weeks (that window is over now), no AI-written content on r/Korean, no link drops or naming Subturtle on r/languagelearning unless asked, use the official megathread on r/Spanish, and read each sub's sticky before posting.

If you want one, say the word and I'll draft a proposal (cadence, what counts as a post vs a comment, human-gate on publish) before I set it up.

### Navid Shad (founder) · 2026-07-16T14:17:43.276Z

[@Aso Dara](#user_mention#113552267) I want a workflow to do social activities in redit everyday. what we can do?

### Aso Dara · 2026-07-16T14:17:43.721Z

Reddit is riskier than blog/LinkedIn because it is community-policed: daily automated posting reads as bot behavior fast, and subs ban or shadowban for it. So I would NOT do a straight 'post something every day' cron. Here is what I think actually works, as a workflow proposal:

1. Split into two lanes:
   - Value comments (most of the activity): I scan the 6 non-Korean subs daily for real threads where a genuine, non-branded, helpful comment fits (someone asking how to learn from TV/movies, vocab tools, etc). No Subturtle mention, no link. This is what builds the account up so later mentions land.
   - Subturtle mentions (rare, gated): only when a thread directly asks 'what tools do you use' or similar, or in r/Spanish's official self-promo megathread. Everywhere else, naming Subturtle stays off-limits per the sub rules I already hold.

2. r/Korean stays fully hands-off from me. Zero AI-drafted content there, ever, per the sub's rule. If we want activity there it has to be you or Somi typing it yourself.

3. Volume: I would NOT aim for 'daily' as in one post/comment every single day no matter what. More like up to 1-2 comments a day, only on threads that genuinely fit, some days zero if nothing fits. Forcing a daily quota is exactly what makes it look like a bot.

4. Human gate: since Reddit posting needs the browser (your machine, gated to your private DM, which this is), I would draft each candidate comment into a ClickUp task first (thread link, my proposed comment, which lane it's in) and only post after you approve it, at least for the first few weeks. Once we trust the judgment calls, we can loosen that to auto-post the no-mention value comments and keep approval only for anything that names Subturtle.

5. Cadence: daily browser check (needs you to have the Aso Dara Chrome up), not daily forced output.

If that shape works for you, say so and I will set it up as a new workflow (browser-required, so it only runs when you have Chrome up, same as blog SEO). If you want it looser (auto-post value comments from day one) or tighter (approve everything, always), tell me and I will adjust before I create it.
