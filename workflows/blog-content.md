# Subturtle Blog Content Workflow

## Goal

SEO traffic to subturtle.app, ending in a free Chrome extension install. Every post is one step toward a paid user.

## The list

ClickUp list 901809890244, called 'Subturtle Content Marketing'. Existing status flow:

- inactive: parked, ignore
- todo: outline ready, draft not started
- writing: I am drafting now
- approval: draft ready, waiting for Navid's review
- rejected: Navid sent it back, read comments and rewrite
- for publish: approved, ready to publish on blog.subturtle.app
- Closed: published

Workspace context: there are 3 existing posts on blog.subturtle.app (Hello World, How to Actually Learn English from Your Favorite Shows, 10 Common English Grammar Mistakes). Match their voice: friendly, practical, second person, motivational, no AI disclosure.

## What each run does (cron)

Read every task in the list. Then in this order, pick ONE:

1. If any task is in 'rejected' status, rewrite it first. Read the comments for the feedback. Update the description in place. Move to 'approval'. Comment Navid.
2. Else if any task is in 'todo' status, pick the one with the earliest due date (use number prefix as tiebreaker). Move status to 'writing'. Draft the full post in the task description. Generate hero image via Gemini and attach. Run the humanize check (below) before moving status. Move to 'approval'. Top-level comment to Navid with a one-line summary.
3. Else if todo + rejected are both empty AND fewer than 6 posts sit in 'approval'+'for publish' combined, create one fresh SEO-driven topic (new task in 'todo' with full outline in the description, follows the 4 pillars below). Do NOT write it the same run, that comes next run.
4. Else, do nothing, queue is full. Log and exit.

Only ONE post per run. Never two.

## How to write a draft

- Length: 1,000 to 1,400 words.
- Voice: friendly, practical, second person ('you'), matches the 3 existing posts.
- SEO: long-tail keyword in title and in the first 100 words. If the title is vague, rewrite for search.
- Structure: short intro hook, 4 to 6 H2 sections, conclusion plus CTA.
- Real examples only. No fabricated stats, no fake customer quotes, no AI disclosure.
- CTA at the end: one strong call to install the Chrome extension (https://chromewebstore.google.com/detail/gaplicnpaiidofkoeonioomcnadoofkf) and try the dashboard (https://dashboard.subturtle.app/). Not a list, one clear ask.

## Humanize check (must pass before moving to 'approval')

1. No em-dashes ('—') anywhere in the draft. Use a comma, a full stop, or 'and'/'but'.
2. Plain English around IELTS 6 to 7. Common words, short sentences, one idea per sentence.
3. Kill AI-isms. Banned phrases include: 'Welcome to the world of', 'secret weapon', 'is where X shines', 'we are here to give you', 'innovative', 'future-oriented', 'in today fast-paced world', 'elevate your', 'harness the power of', 'unlock', 'game-changer'.
4. Use contractions ('don't', 'can't', 'it's'). Formal English reads stiff and bot-like.
5. First-person and second-person are fine: one human talking to one learner, not a brand voice.
6. Voice-match check: read line-by-line against the published reference post 'How to Actually Learn English from Your Favorite Shows' on blog.subturtle.app. If a sentence does not sound like that post, rewrite it.
7. Final pass: read the draft out loud (or mentally). If it reads like a brochure, fix it.

## Hero and inline images

- Generate the hero via mcp__gemini__generate_image (flash by default; pro only for flagship posts). Prompt a clean, friendly, modern, on-brand visual. Do not generate fake screenshots.
- For posts over 1,200 words with 2 or more natural section breaks, add up to 2 inline images the same way. One per major section. Maximum 3 images total per post.
- Generate and attach images ONE AT A TIME, not in a batch. Batching has timed out and lost work twice before.
- Do NOT embed image URLs into the markdown draft. The hero image stays attached to the ClickUp task and is set as the post's featured image at publish time (via the WordPress.com MCP).
- Write a brief alt-text in a task comment for each attached image, and use it as the image alt-text when you publish.

## 4 content pillars (for net-new topic generation)

1. Learn-X-with-Y lists: 'Learn English with Friends', '10 Netflix shows to improve your German'.
2. Subturtle vs alternatives: comparisons, when to use which.
3. Practical tips with screenshots: single-feature deep dives.
4. The method: why subtitle-based learning works.

Skip topics drafted in this list or already on the blog in the last 30 days.

## When a comment on a task wakes me to iterate

- Read the full thread, the current draft, the image.
- Rewrite as asked. Keep length, voice, and humanize rules.
- If feedback is on the image, regenerate with the new direction.
- Re-run the humanize check on any rewrites before saving.
- Update the description in place.
- If status was 'rejected' or 'writing', move to 'approval'. If already 'approval', leave it.
- If Navid approves it or asks me to publish/apply (e.g. "publish", "apply the image and category", "ship it"), publish it — see "Publishing" below.
- Reply in-thread to the comment confirming what changed.

## Publishing (via the WordPress.com MCP)

The blog at blog.subturtle.app runs on WordPress.com (site blog_id 246426138). Publish through the WordPress.com MCP (`mcp__claude_ai_WordPress_com__*`). NEVER use the browser for WordPress — the MCP is the supported path, needs no one's laptop, and won't time out.

**WP MCP mechanics (do this right or you will time out):**

- **Confirmation:** every create/update/delete on the WP MCP requires `user_confirmed: true` in `params`. Navid has pre-authorised blog publishing in the contract, so pass `user_confirmed: true` yourself — there is no interactive human to confirm in a wake.
- **Featured image upload:** use the local **`mcp__wordpress__set_featured_image`** tool — pass the hero's `file_path` (e.g. the Gemini hero in `data/images/`), the `post_id`, and `alt_text`. It uploads the image *binary* straight to WordPress and sets it as the featured image. Do NOT shrink it, do NOT base64-encode it, and do NOT use the claude.ai `media.create` tool: that one only takes inline base64, which is ~260K tokens for a normal hero and blows the time/token budget every time (it is what made this task time out repeatedly). For an inline (non-featured) image, `mcp__wordpress__upload_media` returns a media id + URL the same way. These run against the site's own REST API, so they also dodge the claude.ai WP connector's headless-OAuth flakiness.

When a post is approved (status 'for publish', or Navid says publish/apply/ship):

1. Create or update the post on blog.subturtle.app via the MCP: title, the post body (convert the ClickUp draft to clean blocks), and the SEO slug. (`user_confirmed: true`.)
2. Upload + set the featured image per the mechanics above. Set the category Navid named (or the closest existing one; do not invent new categories without asking).
3. Set each inline image's alt-text from the alt-text comments on the task.
4. Publish (`posts.update` status 'publish', `user_confirmed: true`).
5. Move the ClickUp task to 'Closed' and reply in-thread with the live URL the MCP returned.

If any single step is taking long, post a short progress comment on the task before continuing, so you never go silent.

## Hard rules

- Publish only through the WordPress.com MCP (site blog_id 246426138), never the browser.
- Only claim a post is live after the MCP has actually published it, and always include the live URL it returned.
- No AI disclosure in post body.
- No fabricated metrics, customer quotes, or partnerships.
- No pricing claims that do not match the live dashboard.
- One post per run, maximum.
