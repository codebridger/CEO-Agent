# Subturtle Blog Content Workflow

## Goal

SEO traffic to subturtle.app, ending in a free Chrome extension install. Every post is one step toward a paid user.

## The list

ClickUp list 901809890244 — 'Subturtle Content Marketing'. Existing status flow:

- inactive — parked, ignore
- todo — outline ready, draft not started
- writing — I am drafting now
- approval — draft ready, waiting for Navid's review
- rejected — Navid sent it back, read comments and rewrite
- for publish — approved, ready to publish on blog.subturtle.app
- Closed — published

Workspace context: there are 3 existing posts on blog.subturtle.app (Hello World, How to Actually Learn English from Your Favorite Shows, 10 Common English Grammar Mistakes). Match their voice — friendly, practical, second person, motivational, no AI disclosure.

## What each run does (cron)

Read every task in the list. Then in this order, pick ONE:

1. If any task is in 'rejected' status — rewrite it first. Read the comments for the feedback. Update the description in place. Move to 'approval'. Comment Navid.
2. Else if any task is in 'todo' status — pick the one with the earliest due date (use number prefix as tiebreaker). Move status to 'writing'. Draft the full post in the task description. Generate hero image via Gemini and attach. Move to 'approval'. Top-level comment to Navid with a one-line summary.
3. Else if todo + rejected are both empty AND fewer than 6 posts sit in 'approval'+'for publish' combined — create one fresh SEO-driven topic (new task in 'todo' with full outline in the description, follows the 4 pillars below). Do NOT write it the same run — that comes next run.
4. Else — do nothing, queue is full. Log and exit.

Only ONE post per run. Never two.

## How to write a draft

- Length: 1,000–1,400 words.
- Voice: friendly, practical, second person ('you'), matches the 3 existing posts.
- SEO: long-tail keyword in title and in the first 100 words. If the title is vague, rewrite for search.
- Structure: short intro hook → 4–6 H2 sections → conclusion + CTA.
- Real examples only. No fabricated stats, no fake customer quotes, no AI disclosure.
- CTA at the end: one strong call to install the Chrome extension (https://chromewebstore.google.com/detail/gaplicnpaiidofkoeonioomcnadoofkf) and try the dashboard (https://dashboard.subturtle.app/). Not a list — one clear ask.
- Hero image: generate via mcp__gemini__generate_image (flash model unless quality matters). Prompt a clean, friendly, modern, on-brand visual. Attach to the task. Do not generate fake screenshots.

## 4 content pillars (for net-new topic generation)

1. Learn-X-with-Y lists — 'Learn English with Friends', '10 Netflix shows to improve your German'.
2. Subturtle vs alternatives — comparisons, when to use which.
3. Practical tips with screenshots — single-feature deep dives.
4. The method — why subtitle-based learning works.

Skip topics drafted in this list or already on the blog in the last 30 days.

## When a comment on a task wakes me to iterate

- Read the full thread, the current draft, the image.
- Rewrite as asked. Keep length and voice rules.
- If feedback is on the image — regenerate with the new direction.
- Update the description in place.
- If status was 'rejected' or 'writing', move to 'approval'. If already 'approval', leave it.
- Reply in-thread to the comment confirming what changed.

## Hard rules

- Never publish to WordPress automatically. Drafts stay in ClickUp; Navid publishes.
- No AI disclosure in post body.
- No fabricated metrics, customer quotes, or partnerships.
- No pricing claims that don't match the live dashboard.
- Never claim a post went live anywhere.
- One post per run, maximum.
