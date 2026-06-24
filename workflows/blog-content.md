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

## Two custom fields on every task

Every task in this list has two custom fields I MUST keep in sync with reality:

- **Preview URL** — the WordPress draft preview URL for this post. Filled the moment I push the draft to WordPress as a DRAFT. Updated if the slug changes mid-review. Stays as the truth source for what Navid reviews, until the post is live.
- **Blog URL** — the live published URL on blog.subturtle.app. Empty while the post is still in draft/approval/rejected/for-publish. Filled the moment the WP MCP confirms publish. Never edited by hand.

If a field is missing on a task (older tasks may not have them), set the value anyway through the ClickUp API; the workspace already has the fields configured.

## What each run does (cron)

Read every task in the list. Then in this order, pick ONE:

1. If any task is in 'rejected' status, rewrite it first. Read the comments for the feedback. Update the description in place, push the update to the existing WordPress draft (do NOT create a new WP post), refresh the Preview URL field if the slug changed. Move to 'approval'. Comment Navid.
2. Else if any task is in 'todo' status, pick the one with the earliest due date (use number prefix as tiebreaker). Move status to 'writing'. Draft the full post in the task description. Generate hero image via Gemini and attach. Run the humanize check (below). Push to WordPress as a DRAFT, upload the hero as the featured image on that draft, capture the preview URL, fill the task's Preview URL field. Move to 'approval'. Top-level comment to Navid with a one-line summary + the Preview URL.
3. Else if todo + rejected are both empty AND fewer than 6 posts sit in 'approval'+'for publish' combined, create one fresh SEO-driven topic (new task in 'todo' with full outline in the description, follows the 4 pillars below). Do NOT write it the same run, that comes next run. Preview URL + Blog URL fields stay empty at this stage.
4. Else, do nothing, queue is full. Log and exit.

Only ONE post per run. Never two.

## How to write a draft

- Length: 1,000 to 1,400 words.
- Voice: friendly, practical, second person ('you'), matches the 3 existing posts.
- SEO: long-tail keyword in title and in the first 100 words. If the title is vague, rewrite for search.
- Structure: short intro hook, 4 to 6 H2 sections, conclusion plus CTA.
- Real examples only. No fabricated stats, no fake customer quotes, no AI disclosure.
- CTA at the end: one strong call to install the Chrome extension (https://chromewebstore.google.com/detail/gaplicnpaiidofkoeonioomcnadoofkf) and try the dashboard (https://dashboard.subturtle.app/). Not a list, one clear ask.

## Push to WordPress as a DRAFT and fill Preview URL

After the draft passes the humanize check and the hero image is attached to the ClickUp task, push it to WordPress BEFORE moving the task to 'approval':

1. Create the post on blog.subturtle.app via `mcp__claude_ai_WordPress_com__*` with status 'draft' (NOT 'publish'). Pass `user_confirmed: true`. Include title, body (clean blocks from the draft), and the SEO slug.
2. Upload the hero image as the featured image via the local `mcp__wordpress__set_featured_image` tool with the file_path on disk, the post_id, and alt_text. Do NOT use the claude.ai `media.create` (base64 — times out).
3. Capture the post_id and the preview URL the MCP returns. The preview URL is what Navid uses to review.
4. Fill the task's **Preview URL** custom field with that URL.
5. Move task to 'approval' and tag Navid with a one-line summary + the Preview URL in the top-level comment.

If the WP draft push fails, do NOT move the task to 'approval'. Leave it in 'writing' and comment the error on the task so we see it.

## Humanize check (must pass before pushing to WordPress)

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
- Do NOT embed image URLs into the markdown draft. The hero image stays attached to the ClickUp task and is set as the post's featured image at draft-push time (via `mcp__wordpress__set_featured_image`).
- Write a brief alt-text in a task comment for each attached image, and use it as the image alt-text when you push to WordPress.

## 4 content pillars (for net-new topic generation)

1. Learn-X-with-Y lists: 'Learn English with Friends', '10 Netflix shows to improve your German'.
2. Subturtle vs alternatives: comparisons, when to use which.
3. Practical tips with screenshots: single-feature deep dives.
4. The method: why subtitle-based learning works.

Skip topics drafted in this list or already on the blog in the last 30 days.

## When a comment on a task wakes me to iterate

- Read the full thread, the current draft, the image, the current Preview URL on the task.
- Find the existing WordPress draft for this task. Prefer looking it up by slug (or by parsing the post_id from the Preview URL). NEVER create a new WP post on iterate — always UPDATE the existing draft in place. This keeps the Preview URL stable across rounds.
- Rewrite as asked. Keep length, voice, and humanize rules.
- If feedback is on the image, regenerate with the new direction, re-upload via `mcp__wordpress__set_featured_image` against the same post_id.
- Re-run the humanize check on any rewrites before saving.
- Update the ClickUp task description in place.
- Push the changes to the existing WordPress draft (title, body, slug if the title changed). Status stays 'draft'.
- If the slug changed and the preview URL is therefore different, update the Preview URL field on the task and call it out in the iterate reply.
- If status was 'rejected' or 'writing', move to 'approval'. If already 'approval', leave it.
- If Navid approves it or asks me to publish/apply (e.g. 'publish', 'apply the image and category', 'ship it'), publish it. See 'Publishing' below.
- Reply in-thread to the comment confirming what changed (and link the Preview URL if it changed).

## Publishing (via the WordPress.com MCP)

The blog at blog.subturtle.app runs on WordPress.com (site blog_id 246426138). Publish through the WordPress.com MCP (`mcp__claude_ai_WordPress_com__*`). NEVER use the browser for WordPress, the MCP is the supported path, needs no one's laptop, and won't time out.

**WP MCP mechanics (do this right or you will time out):**

- **Confirmation:** every create/update/delete on the WP MCP requires `user_confirmed: true` in `params`. Navid has pre-authorised blog publishing in the contract, so pass `user_confirmed: true` yourself, there is no interactive human to confirm in a wake.
- **Featured image upload:** use the local **`mcp__wordpress__set_featured_image`** tool, pass the hero's `file_path` (e.g. the Gemini hero in `data/images/`), the `post_id`, and `alt_text`. It uploads the image binary straight to WordPress and sets it as the featured image. Do NOT shrink it, do NOT base64-encode it, and do NOT use the claude.ai `media.create` tool: that one only takes inline base64, which is ~260K tokens for a normal hero and blows the time/token budget every time. For an inline (non-featured) image, `mcp__wordpress__upload_media` returns a media id + URL the same way.

When a post is approved (status 'for publish', or Navid says publish/apply/ship):

1. The post already exists in WordPress as a draft (we pushed it on draft creation and kept it in sync on iterate). UPDATE it via the MCP: confirm title, body, slug, and that the featured image is still set. (`user_confirmed: true`.)
2. Set the category Navid named (or the closest existing one; do not invent new categories without asking).
3. Set each inline image's alt-text from the alt-text comments on the task.
4. Publish (`posts.update` status 'publish', `user_confirmed: true`).
5. Fill the task's **Blog URL** custom field with the live URL the MCP returned.
6. Move the ClickUp task to 'Closed' and reply in-thread with the live URL.

If any single step is taking long, post a short progress comment on the task before continuing, so you never go silent.

## Hard rules

- Publish only through the WordPress.com MCP (site blog_id 246426138), never the browser.
- Only claim a post is live after the MCP has actually published it, and always include the live URL it returned + the Blog URL field filled.
- Preview URL field MUST be filled before a task moves to 'approval'. Blog URL field MUST be filled the moment a post goes live.
- No AI disclosure in post body.
- No fabricated metrics, customer quotes, or partnerships.
- No pricing claims that do not match the live dashboard.
- One post per run, maximum.
