# Thread chat-8crzyb7-1458

## Story so far (compacted 2026-07-02T17:27:19.756Z)

## Story so far (compacted 2026-07-02)

**Who:** Navid Shad (founder, just finished MSc AI Engineering) and Aso Dara (CEO agent). DM thread `chat-8crzyb7-1458`.

**Background carried in:**
- Browser/Playwright unblocked. Reddit u/subtitles_and_coffee live but quiet.
- Activation bug fixed in prod. LinkedIn thesis carousel + Reddit-comparison post shipped. WP categories/tags fixed.
- Blog-ideas pitch job runs every 3 days at 09:00 Vilnius.
- Stripe MCP OAuth still pending (Navid said skip for now).
- LinkedIn About/title rewrite unfinished.
- 4 blog posts live but their tasks stuck in "for publish."

**This window's decisions:**

1. **PM check moved to long-job path.** Root cause of PM failures was the 5-min default agent timeout. Navid shipped PR #20 which added: `long: true` flag on scheduled jobs → 20-min budget, browser access (Navid-DM-gated), checkpoint-and-continue up to 20 chunks, live footprints per checkpoint, stop after 3 failed resumes. Aso flipped `job-pm-check-mqqf85q7` to `long: true`. First long PM run set for 16:00 Vilnius. Aso confirmed PM boundary: reads 3 lists (Subturtle.app, LinkedIn Content, Content Marketing), comments on stuck tasks, recognizes wins in matching public channels, DMs Navid a summary; does not create tasks silently, does not touch Stripe/Mixpanel (heartbeat's job).

2. **Blog workflow updated for Preview URL / Blog URL fields.** New rules locked into `wf-blog-content-mqbiekea`:
   - DRAFT → push to WP as draft via MCP, set featured image, fill "Preview URL" custom field, move to approval.
   - ITERATE → find existing draft by slug and UPDATE in place, keep Preview URL stable.
   - PUBLISH → fill "Blog URL" with live URL, reply in-thread, close task.

3. **Duplicate workflow cleaned up.** Aso accidentally created `wf-blog-content-mqrq7h00` instead of updating the existing one; removed it. Single source of truth: `wf-blog-content-mqbiekea`.

4. **Current inventory:** 1 blog workflow (`wf-blog-content-mqbiekea`), 1 LinkedIn workflow (`wf-linkedin-content-mqb1jzix`, Sat 09:00), 2 cron jobs (`job-blog-ideas-pitch-mql2rlgd` every 3 days 09:00, `job-pm-check-mqqf85q7` 10:00 + 16:00 daily, now long-job).

5. **Release stats pulled (2026-07-02).** Navid asked for stats on last release; Stripe skipped by his call, Mixpanel came back online. Findings on v1.15.1 (2026-06-17, small bundle-dropdown fix):
   - Word-detail unique users 31 → 28, volume 93 → 53 events, logins 15 → 11, phrase-saved near zero both weeks, checkout-opened 0 both weeks. Translation errors 1 → 3 (noise at that scale).
   - `leitner_review_submitted` fired 9 times post-release, 0 before — unclear if real user or test.
   - Release did no visible harm and moved no needle.
   - Honest gap Aso flagged: standing memory listed main-prod as project 2599235 but Aso only has access to "Subturtle Legacy" 2795069 (which has the real event surface). Asked Navid whether 2599235 is different or if memory should be updated. Bottom-line message: too few users to read any release signal; activation funnel (view → save → practice → checkout) collapses immediately — that's the real problem, not the release.

**Latest ask (open, not started):** Navid wants the WordPress article flow updated so every article requires:
- 2 images, both inside the main text, one also set as the hero.
- A category.
- Proper SEO.

Awaiting Aso's plan and workflow update.

**Other open threads:**
- Long-job PR for PM — merged as PR #20, PM flipped, waiting on first 16:00 run.
- Wake-routing PR against CEO-Agent (generic @-mention scanner) — still not green-lit.
- Idea 1 (Pause-Rewind Rule) blog task — waiting on "go."
- LinkedIn title + About — not locked.
- 8 LinkedIn ideas overdue from thesis weeks — awaiting Navid's pick.
- 86eu7hzzt (visual asset pipeline) — archive-or-revive pending.
- 86eu70peq Grammar blog thread with 5 old fix commitments — pending direction.
- Post the 3 blog-launch wins in Content Marketing channel — waiting on "post the wins."
- Mixpanel project ID discrepancy (2599235 vs 2795069) — waiting on Navid.

## Recent
### Aso Dara · 2026-07-02T14:32:09.512Z

Locked in. Updating the blog-content playbook now with three tightened rules:

1. Two images required per post, both embedded INSIDE the body text (one at the top after the intro, one mid-article at a natural section break). The top one is ALSO set as the WordPress featured image (hero). No more optional inline images, no more hero-only posts.

2. SEO checklist is now mandatory before draft push: long-tail keyword in title + first 100 words + at least one H2, meta description 140 to 160 chars, SEO slug matches the keyword, alt-text on both images uses the keyword or a variation, one internal link (to subturtle.app or dashboard.subturtle.app) and one external link to a real source.

3. Category MUST be set on the WordPress draft at creation time, not at publish. If no matching category exists, I pick the closest existing one and flag it in the approval comment so you can rename if you want. I will not invent new categories on my own.

Mechanics on the images (so nothing times out): generate them one at a time via Gemini, upload each via mcp__wordpress__upload_media to get a media id + URL, embed both URLs into the post body as image blocks, then call mcp__wordpress__set_featured_image with the top image file to set the hero. All at draft-push time, before the task moves to approval.

Rolling the update out now.

### Aso Dara (action) · 2026-07-02T14:32:09.518Z

workflow: updated wf-blog-content-mqbiekea — "blog-content" — sonnet · playbook blog-content · iterate-only (no cron) · list 901809890244

### Navid Shad (founder) · 2026-07-02T17:16:55.330Z

more update over the wordpress workflow:
each task should have a check list check specifically should be define in the task and checks step by step:
1. draft the blog in the wordpress not in the task description
2. generate the images and use theme
3. setup the seo
4. schedule the blog

the seo should be done in an specific way I will provide more data soon

### Aso Dara · 2026-07-02T17:16:55.869Z

Got it. Rolling three changes into the playbook now:

1. Draft lives in WordPress from the start, not in the task description. First step of every task is: create the WP DRAFT (title + slug + category + empty body scaffold), fill the Preview URL field, then write the actual body directly in WordPress. Task description keeps only: topic, target keyword, one-line angle, and the 4-step checklist. No more full draft text sitting in the task description.

2. Every task gets a real ClickUp checklist with these 4 steps, checked off in order:
   [ ] 1. Draft the blog in WordPress (create WP draft, fill Preview URL)
   [ ] 2. Generate the 2 images and place them in the post (both inline, top one as hero)
   [ ] 3. Set up SEO (details pending from you)
   [ ] 4. Schedule the blog

3. Final step is SCHEDULE, not publish. After your approval, I set the WP post to a future publish date (you tell me the slot, or I pick the next open weekday morning at 09:00 Vilnius), the WP MCP schedules it, I fill the Blog URL field with the scheduled URL, and close the task. Nothing goes live before its scheduled time.

One question: for the schedule step, do you want me to pick the slot on my own (spacing posts every 2 to 3 days) or do you want to approve each date on the task before I schedule?

SEO section left as-is for now with a big TODO placeholder. Send me the SEO spec when ready and I will lock it in.

### Aso Dara (action) · 2026-07-02T17:16:55.872Z

workflow: updated wf-blog-content-mqbiekea — "blog-content" — sonnet · playbook blog-content · iterate-only (no cron) · list 901809890244

### Navid Shad (founder) · 2026-07-02T17:19:02.343Z

yes you have to figure out the date based on the space mechanism you have, I dont care about it

### Aso Dara · 2026-07-02T17:19:02.896Z

Understood. Spacing rule locked in: I schedule posts on my own using the current backlog rhythm, no per-task date approval.

Rule I will follow:
- Next open weekday slot at 09:00 Europe/Vilnius.
- Minimum 2 days between posts, target 3 days when the backlog allows.
- Skip weekends unless the queue is deep (5+ approved drafts waiting), then use Saturday 09:00 as overflow.
- I log the picked date in the task comment when I schedule, so you can override with one reply if the slot is wrong.

Playbook updated with this.

### Aso Dara (action) · 2026-07-02T17:19:02.904Z

remember: noted "- (2026-07-02, via Navid Shad (founder)) (2026-07-02) Blog scheduling rule: Aso picks the post date on her own, Navid does not want to approve slots. Algorithm: next open weekday 09:00 Europe/Vilnius, min 2 days between posts, target 3 days when backlog allows, skip weekends unless 5+ approved drafts are queued (then Saturday 09:00 overflow). Log the chosen date in the task comment when scheduling so Navid can override with one reply."

### Aso Dara (action) · 2026-07-02T17:19:02.905Z

workflow: updated wf-blog-content-mqbiekea — "blog-content" — sonnet · playbook blog-content · iterate-only (no cron) · list 901809890244

### Navid Shad (founder) · 2026-07-02T17:19:27.348Z

[@Aso Dara](#user_mention#113552267) yes you have to figure out the date based on the space mechanism you have, I dont care about it

### Aso Dara · 2026-07-02T17:19:27.875Z

All set, Navid. Playbook is live with the new rules:

1. Draft lives in WordPress from step 1, not in the task description.
2. Every task gets a 4-step ClickUp checklist (draft in WP, generate images + place them, SEO, schedule).
3. Two images required, both inline in the body, top one also set as hero.
4. Category set at draft time.
5. Final step is SCHEDULE at a date I pick using the spacing rule (next open weekday 09:00 Vilnius, min 2 days apart, target 3, weekends only if 5+ drafts queued). Date logged in the task comment so you can override.

One thing still open: the SEO spec. Send it whenever ready and I will replace the placeholder in the playbook with the exact steps you want.

### Navid Shad (founder) · 2026-07-02T17:21:41.543Z

regarding the SEO, we should use Yoast plugin
please open this wp link on browser and check all these sections and figure out which sections should we use give me a report here [@Aso Dara](#user_mention#113552267)

link: [https://blog.subturtle.app/wp-admin/post.php?post=507&action=edit](https://blog.subturtle.app/wp-admin/post.php?post=507&action=edit)

### Aso Dara (on it) · 2026-07-02T17:21:42.116Z

On it. Opening the Yoast panel on that post now and will send you back a report on which sections we should use.

### Aso Dara · 2026-07-02T17:26:47.484Z

I have everything I need — 13 sections catalogued. Writing the report now.

Done. Yoast SEO **Premium** is installed on the blog (confirmed by the "Yoast SEO Premium" label in the top bar and sidebar). I opened post 507 in the editor and clicked through every section in the Yoast sidebar. Screenshots taken for each panel. Here is the full picture.

**Yoast version:** Premium (paid version). This is important because 4 of the 13 sections are Premium-only.

**All 13 sections I found, one line each:**

1. **Focus keyphrase** — the main keyword the post should rank for. Also lets you add keyphrase synonyms.
2. **Premium SEO analysis** — runs 19 checks and gives a green/orange score. On post 507 it shows 18 good, 1 improvement (meta description too long).
3. **Readability analysis** — 7 checks: passive voice, consecutive sentences, subheading distribution, paragraph length, sentence length, transition words, word complexity.
4. **Add related keyphrase** (Premium) — track a second keyword you also want to rank for.
5. **Track SEO performance** — opens a Wincher popup to track Google ranking position over time. Not connected, and Wincher is a paid extra.
6. **Internal linking suggestions** (Premium) — Yoast scans the site for related posts to link to. Currently says "no relevant articles found" because the blog is small.
7. **Search appearance** — the Google preview. SEO title, Slug, Meta description, with a colour bar showing when the length is right. Has AI "Generate SEO title" and "Generate meta description" buttons.
8. **Social media appearance** — Facebook/X/LinkedIn/Slack card preview. Override social image, social title, social description.
9. **Schema** — two dropdowns: Page type (Web Page by default) and Article type (Article by default). Controls the schema.org JSON-LD Google reads.
10. **Content blocks (New)** — insert Yoast blocks into the body: AI Summarize, Estimated reading time, Related links, Table of contents, Breadcrumbs, FAQ, How-to.
11. **Advanced** — noindex toggle, nofollow toggle, Meta robots advanced, Breadcrumbs Title, Canonical URL.
12. **Cornerstone content** — mark this post as a pillar/cornerstone piece.
13. **Insights** — prominent words list, Flesch reading ease (85.7 here = easy), reading time (6 min), word count (1183).

**What we should use, and how it maps to our playbook:**

Every rule in our playbook has a Yoast field that enforces it. Here is the map:

- **Focus keyphrase in title, first 100 words, one H2** → set it in **Focus keyphrase**, then let **Premium SEO analysis** check "Keyphrase in SEO title", "Keyphrase in introduction", "Keyphrase in subheading". All three must be green.
- **Meta description 140 to 160 chars** → **Search appearance > Meta description**. The colour bar under the field turns green in the right range. "Meta description length" check confirms it.
- **SEO slug matches the keyword** → **Search appearance > Slug** field. "Keyphrase in slug" check confirms it.
- **Alt text on both images uses the keyword** → **Premium SEO analysis > Keyphrase in image alt attributes** check reads the image blocks and grades them.
- **One internal + one external link** → **Premium SEO analysis > Internal links** and **Outbound links** checks. Both must be green.
- **Category set at draft** → this is NOT a Yoast field. It is a WordPress core taxonomy in the Post sidebar. Still required, just outside Yoast.
- **Voice/readability at IELTS 6-7 level** → **Readability analysis** and **Insights > Flesch score**. Flesch above 70 is a good target for our audience.

So the working rule is simple: before pushing a draft to approval, the **Premium SEO analysis** score must be green with 0 or 1 improvement, and **Readability** must be green. The **Search appearance** panel is where I fill in title, slug, and meta description. Everything else is either a nice-to-have or the Yoast defaults are fine.

**Sections we should skip:**

- **Add related keyphrase** — nice for tracking a second keyword, but our traffic is too small for a second keyword to matter. Skip until we have real search volume.
- **Track SEO performance (Wincher)** — needs a paid Wincher account, and our rankings are too early to track. Skip.
- **Internal linking suggestions** — Yoast returns nothing on small sites like ours. Revisit after 30+ posts.
- **Social media appearance** — we do not auto-share to Facebook or X. LinkedIn posts are hand-written. So the card overrides do nothing for us. Skip.
- **Content blocks** — only use case-by-case. FAQ block if the post actually has a Q&A section, How-to block if it is a real step guide. Do not force them.
- **Cornerstone content** — only turn this on for true pillar posts. 95% of our posts are not pillars. Leave off by default.
- **Schema** — the defaults (Web Page + Article) are correct for our posts. Only change if a post is clearly a How-to or a Recipe. Leave defaults for now.
- **Advanced** — leave everything as default. Only touch if we need to noindex a draft or set a canonical URL for a syndicated post.

**Unclear from the UI:**

- Whether the "AI Summarize", "Generate SEO title", and "Generate meta description" buttons use OpenAI credits or something we pay for per call. I did not click them to avoid a spend. Worth checking before the workflow leans on them.

That is the full Yoast picture. If you send the SEO spec you mentioned, I will fold it into the playbook checklist step 3 with the exact Yoast fields listed above so I can run it the same way on every post.

### Navid Shad (founder) · 2026-07-02T17:34:10.845Z

[@Aso Dara](#user_mention#113552267) good overview, yes we should not use that ai summary, so can you convert these into instruction for the wp workflow SEO part please

### Aso Dara · 2026-07-02T17:34:11.380Z

Locked in. Rolling the SEO section into the playbook now with the exact Yoast fields, and NO AI-generate buttons anywhere.

Here is what step 3 becomes on every blog task:

1. Open the WP draft in the block editor and open the Yoast sidebar.
2. Fill Focus keyphrase with the target long-tail keyword from the task. Leave 'Add related keyphrase' empty (Premium, low traffic, not worth it yet).
3. In Search appearance: write the SEO title by hand (55-60 chars, keyword near the front), write the meta description by hand (140-160 chars, keyword included, benefit-led), set the slug to match the keyword with no filler words. Do NOT click the AI Generate title or AI Generate meta description buttons.
4. Do NOT use AI Summarize. Do NOT insert the AI Summary block.
5. Alt text on both images uses the target keyword or a natural variation (already covered in step 2, Yoast will read it back).
6. Confirm one internal link (subturtle.app or dashboard.subturtle.app) and one external link to a real source are in the body.
7. Read the Premium SEO analysis panel. Score must be green with 0 or at most 1 improvement. All these checks must be green: Keyphrase in SEO title, Keyphrase in introduction, Keyphrase in subheading, Keyphrase in slug, Keyphrase in meta description, Keyphrase in image alt attributes, Meta description length, Internal links, Outbound links.
8. Read the Readability analysis panel. Score must be green.
9. Leave Schema defaults (Web Page + Article) unless the post is a real How-to.
10. Leave Advanced defaults. No noindex, no canonical override.
11. Skip: Add related keyphrase, Wincher tracking, Internal linking suggestions, Social media appearance, Cornerstone content, all Yoast Content Blocks (unless the post genuinely has a FAQ or a step-by-step how-to).
12. Only when Premium SEO analysis is green AND Readability is green, check off step 3.

One open question for later: I still do not know if the Yoast AI buttons cost us money per call, so I am hard-avoiding them for now. If you ever want to switch that on, tell me and I will loosen the rule.

### Aso Dara (action) · 2026-07-02T17:34:11.383Z

workflow: updated wf-blog-content-mqbiekea — "blog-content" — sonnet · playbook blog-content · iterate-only (no cron) · list 901809890244

### Navid Shad (founder) · 2026-07-02T17:37:25.824Z

[@Aso Dara](#user_mention#113552267) we dont need the ai of Yoast, yes it does need extra plan, should should be bought beforehand

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
