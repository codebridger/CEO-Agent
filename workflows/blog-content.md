# blog-content workflow playbook

One workflow for every blog post on blog.subturtle.app. Aso runs this end-to-end. Navid reviews and approves; he does not pick dates.

## Tools — Royal MCP for text, browser required for the SEO step

The blog now runs the **Royal MCP** plugin (`mcp__royal-mcp__wp_*`, ~69 tools, remote HTTP). It does the full job headlessly: create/edit/schedule posts, categories/tags, media, AND Yoast SEO fields. This replaces the old claude.ai WordPress.com MCP for this workflow.

- **Text / posts / taxonomy / SEO → `mcp__royal-mcp__wp_*`.** `wp_create_post`, `wp_update_post`, `wp_add_post_terms`, `wp_get_seo_meta`, `wp_update_seo_meta`, `wp_get_post_meta`.
- **Local image bytes → `mcp__wordpress__*`.** Gemini heroes live on disk; `mcp__wordpress__upload_media` (file path → URL) and `mcp__wordpress__set_featured_image` (file path + post_id) push the binary directly. Do NOT use Royal's `wp_upload_media` (base64, ~260K tokens, times out) for a local hero; the file-path server keeps bytes out of the token stream.
- **Browser (`mcp__browser__*`) is REQUIRED for Step 3 (Yoast SEO), plus the fallback for the rest.** Royal MCP can *set* the SEO fields and *read* the scores, but it CANNOT compute the live Yoast SEO/readability score — `_yoast_wpseo_linkdex` and `_yoast_wpseo_content_score` only get calculated inside the WordPress block editor by Yoast's JS analyzer, and there is no API for it (confirmed in practice: after an MCP-only write those two meta keys stay empty). So Step 3 is done as a **main step in the browser**: open the draft, let Yoast recompute, use the AI buttons, confirm green. The browser is also the fallback for Steps 1-2 if Royal MCP is unreachable.

## Task shape (what every blog task must contain)

Task description is short, NOT the draft:
- Topic (one line)
- Target keyword (long-tail, e.g. 'how to learn english from netflix')
- Angle (one line, what makes this post different)
- The 4-step checklist below

Every blog task MUST have this ClickUp checklist, checked off in order:
- [ ] 1. Draft the blog in WordPress (create WP draft, fill Preview URL field)
- [ ] 2. Generate the 2 images and place them in the post (both inline, top one as hero)
- [ ] 3. Set up SEO in Yoast, push SEO + readability to GREEN (see spec below)
- [ ] 4. Schedule the blog

Custom fields on every blog task: Preview URL, Blog URL.

## Step 1 — Draft in WordPress (Royal MCP)

The DRAFT LIVES IN WORDPRESS, not in the task description. Do not paste the full draft into ClickUp.

1. Create the WP post as DRAFT via `mcp__royal-mcp__wp_create_post` (status: "draft"):
   - Title, slug (SEO slug, matches the target keyword).
   - Category: set via `wp_add_post_terms` (taxonomy `category`). Pick the closest EXISTING category (`wp_get_categories` first); do NOT invent new ones. If the closest is not obvious, flag it in the approval comment so Navid can rename.
   - Body: start with the scaffold (intro, 2-3 H2 sections, closing with real Chrome Web Store button + inline subturtle.app + dashboard.subturtle.app link where the AI Coach / flashcards / review is mentioned).
2. Write the actual body via `wp_update_post`. Voice = IELTS 6-7 plain English, short sentences, common words, one idea per sentence, contractions OK. NO em-dashes anywhere, use commas, full stops, 'and', 'but' instead. Line-by-line voice check against blog post #65 'How to Actually Learn English from Your Favorite Shows'.
3. Kill AI-isms: 'Welcome to the world of', 'secret weapon', 'is where X shines', 'we are here to give you'.
4. CTA check (mandatory): the closing lines link to REAL destinations. Real Chrome Web Store button (https://chromewebstore.google.com/detail/gaplicnpaiidofkoeonioomcnadoofkf), inline subturtle.app link on first Subturtle mention, dashboard.subturtle.app link wherever AI Coach/flashcards/review is mentioned.
5. Once the WP draft has real body content, fill the task's Preview URL field with the returned URL. Check off step 1.

Fallback: if Royal MCP is unreachable, do this step in WP admin via the browser (see Browser-down fallback).

## Step 2 — Two images, both inline, top one as hero

Every post has EXACTLY 2 images. Both go INSIDE the post body. The top one is also set as the WordPress featured image.

1. Image 1 (top / hero): sits right after the intro paragraph. This is the featured image too.
2. Image 2 (mid-article): sits at a natural section break between two H2 sections.
3. Generate them ONE AT A TIME via `mcp__gemini__generate_image` (default flash, use pro only if quality demands it). Getting them both in one call has blown timeouts twice.
4. For each image: `mcp__wordpress__upload_media` with the local file path. Get the media URL back.
5. Embed both image URLs into the WordPress body as `wp:image` blocks at their positions via `wp_update_post`.
6. Set the featured image with `mcp__wordpress__set_featured_image` using the top image's file_path and the post_id.
7. Alt-text on both images uses the target keyword or a natural variation (pass it on upload; Yoast reads these back in Step 3).
8. Check off step 2.

## Step 3 — Yoast SEO in the browser, push SEO + readability to GREEN

**This step is done in the browser. It is a main step, not a fallback.** Royal MCP can set the SEO fields and read the scores back, but it CANNOT compute the live Yoast score — `_yoast_wpseo_linkdex` (SEO) and `_yoast_wpseo_content_score` (readability) are only calculated by Yoast's JS analyzer inside the WordPress block editor, and there is no API for it. After an MCP-only write those two meta keys stay EMPTY. Confirming both are green is mandatory before scheduling, so the block editor is required here.

Scores: both are 0-100, green ≥ 70, orange 40-69, red < 40. Target the green band, aim 90+ (like post #488).

### 3a. (Optional, headless) pre-fill the fields via MCP

To save editor time you MAY pre-set the fields with `mcp__royal-mcp__wp_update_seo_meta` before opening the browser — but this alone does NOT score the post, so it never completes Step 3 on its own:
- **focus_keyword**: the target long-tail keyword from the task. (Do NOT add related keyphrases — Premium, not worth it at our traffic.)
- **title** (SEO title): 55-60 chars, keyword near the front, benefit-led.
- **description** (meta description): 140-160 chars, keyword included, benefit-led.
- **slug**: matches the target keyword, no filler words.

Also make the BODY satisfy the Yoast rules while drafting (Step 1), so the editor pass goes straight to green:
- Keyphrase in the SEO title, first paragraph, at least one H2/H3 subheading, the slug, the meta description, and at least one image alt. Density ~0.5-3% (present, not stuffed).
- At least one **internal link** (subturtle.app / dashboard.subturtle.app) and one **outbound link** to a real credible source.
- Readability: sentences mostly under 20 words, short paragraphs, a subheading roughly every 300 words, passive voice under ~10%, enough transition words, Flesch above 70. (Matches the house voice — keep it tight.)

### 3b. Do the SEO in the block editor and confirm GREEN (browser — required)

1. Before starting, call `mcp__browser__check_local_status`. If the browser is not connected, STOP Step 3 (see Browser-down fallback) — you cannot confirm the score without it.
2. Open the draft: navigate to `https://blog.subturtle.app/wp-admin/post.php?post=<post_id>&action=edit`. Yoast re-analyzes on load. Open the Yoast sidebar and read the **SEO analysis** and **Readability** panels.
3. Set / confirm the Search appearance fields. **Yoast AI buttons are on our plan — use them:** **Generate SEO title** and **Generate meta description** produce keyword-aware, correctly-sized copy in one click. Use them to draft or tighten those two fields, then eyeball the result (keyword up front, green length bars). Set the **focus keyphrase** to the task's target keyword.
4. For any check that is orange or red, fix the copy (inline in the editor, the AI buttons above, or `wp_update_post`) and let Yoast re-run. The individual SEO checks that MUST be green: keyphrase in SEO title / introduction / subheading / slug / meta description / image alt; meta description length; internal links; outbound links.
5. **Save the post in the editor** so Yoast persists the refreshed scores to meta. Then verify — read the sidebar lights directly, and/or re-read `_yoast_wpseo_linkdex` + `_yoast_wpseo_content_score` via `mcp__royal-mcp__wp_get_post_meta` to confirm both ≥ 70 (empty = Yoast never ran; go back to step 2).
6. Leave Schema (Web Page + Article; only How-to for a real step-by-step) and Advanced (no noindex/nofollow/canonical) at defaults. Skip: related keyphrase, Wincher, internal-linking suggestions, social appearance, cornerstone.
7. Only when SEO score AND readability score are both confirmed green, check off step 3.

If the browser is down when you reach this step, see Browser-down fallback: finish Steps 1-2, optionally pre-fill via 3a, leave Step 3 unchecked, and tag Navid to bring the browser up — a draft cannot be scheduled until its Yoast score is confirmed green.

## Step 4 — Schedule the blog (I pick the date, Navid does not approve slots)

After Navid approves the draft, I pick the publish date on my own using this rule:

- Next open weekday 09:00 Europe/Vilnius.
- Minimum 2 days gap between consecutive posts.
- Target 3 days between posts when the backlog allows.
- Skip weekends by default.
- Overflow rule: if 5 or more approved drafts are waiting in the queue, use Saturday 09:00 as an extra slot.

Process:
1. Check the WP scheduled queue (`wp_get_posts` status=future) to see the last scheduled post date.
2. Pick the next slot per the rule above.
3. Schedule the WP post via `mcp__royal-mcp__wp_update_post` (status: "future", date: chosen slot).
4. Fill the task's Blog URL field with the scheduled URL (the WP URL is already known at scheduling time).
5. Post a comment on the task: 'Scheduled for <date> at 09:00 Vilnius. Reply here to override.'
6. Check off step 4.
7. Close the task.

Navid can override a slot with one reply. If he does, reschedule to the new slot and re-comment.

## Browser-down fallback

Royal MCP does Steps 1 and 2 (and the optional 3a pre-fill) headlessly, so a down browser does not block drafting or images. But **Step 3 (Yoast SEO) genuinely requires the browser** — the score only computes in the block editor — so a down browser blocks completing SEO and therefore scheduling.

- The draft and images can proceed via MCP even with the browser down. But before Step 3, call `mcp__browser__check_local_status`. If the browser is down: finish Steps 1-2 (and optionally pre-fill the SEO fields via MCP), leave Step 3 and Step 4 unchecked, and post a comment tagging Navid: 'draft + images are done; I need the Aso Dara browser up to run the Yoast SEO step and confirm the score is green before I can schedule.' Do NOT schedule an unconfirmed draft.
- If Royal MCP itself is unreachable (`wp_*` calls failing), fall back to WP admin in the browser for that step; if the browser is also down, STOP, do not retry silently, and tag Navid.

## Iterate (comment on an existing task)

When someone comments on a task in this list and wakes me: do NOT create a new WP post. Find the existing WP draft by slug (Preview URL on the task) and UPDATE it in place via `wp_update_post` so the Preview URL stays stable. If the slug must change, update the field and note it in the reply comment. If the edit touches body or SEO copy, re-run Step 3b to reconfirm the Yoast score is still green before rescheduling.

## Never do

- Never publish a post live. Only schedule.
- Never invent new WordPress categories.
- Never paste the full draft into the ClickUp task description, the draft lives in WordPress.
- Never use em-dashes in body copy.
- Never skip the CTA check or the 2-image rule.
- Never schedule a draft whose Yoast SEO or readability score has not been confirmed green.
- Never fake the score by writing `_yoast_wpseo_linkdex` / `_yoast_wpseo_content_score` directly — fix the actual copy.
