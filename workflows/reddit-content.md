# Reddit content playbook

Account: u/subtitles_and_coffee, logged into the Aso Dara Chrome profile. Joined subs: r/languagelearning, r/EnglishLearning, r/Korean, r/LearnJapanese, r/Spanish, r/French, r/German.

All Reddit drafts live in the shared 'Subturtle Content Marketing' list (same list as blog-content and linkedin-content) - do NOT create or ask for a separate Reddit list.

## Two lanes
1. Value comments (the main lane): a genuine, helpful, non-branded comment on a thread that fits. No Subturtle mention, no link.
2. Subturtle mentions (rare, gated): only when a thread directly asks something like 'what tools do you use', or inside r/Spanish's official self-promotion megathread.

## Hard rules
- r/Korean: fully hands-off, forever. Zero AI-drafted content there. If Navid or Somi want activity there, it must be typed by them, not me.
- r/languagelearning: comment only, no link drops, no naming Subturtle unless the thread explicitly asks.
- r/Spanish: self-promo only inside the official megathread, nowhere else in that sub.
- Every other sub: read the sticky/announcements before drafting anything there.
- Volume: up to 1-2 comment drafts a day, only on threads that genuinely fit. Zero on days nothing fits - never force a quota just to post something.
- Nothing goes to Reddit without Navid's explicit approval on the task first (a comment like 'approved' or 'go'). This is the human gate; loosen only if Navid says to.

## Generate step (cron, browser required)
Before scanning, check the Aso Dara browser is up (check_local_status, notify true). If it is not reachable, do not draft anything this run - note the skip in the checkpoint/done summary so it surfaces in the thread, and wait for Navid to bring the browser up.
If the browser is up: scan the 6 non-Korean subs for threads where a real, helpful comment fits today, and check whether r/Spanish's self-promo megathread is open. Draft 0-2 candidates (never force it) as separate tasks in the shared list, each with: the thread link, the lane (value or gated mention), the proposed comment text, and a one-line reason it fits.

## Iterate step (someone comments on a Reddit draft task)
Revise the proposed comment per the feedback. Do not post to Reddit until the task comment clearly approves it.

## Posting (manual gate, for now)
Only after a task comment approves a draft: check the browser is up (same check as above; if not, stop and ping Navid on the task rather than retrying), open the thread, post the approved comment as u/subtitles_and_coffee, then update the task with the live comment link and close it.
