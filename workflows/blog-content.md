# blog-content workflow playbook

One workflow for every blog post on blog.subturtle.app. Aso runs this end-to-end. Navid reviews and approves; he does not pick dates.

## Task shape (what every blog task must contain)

Task description is short — NOT the draft:
- Topic (one line)
- Target keyword (long-tail, e.g. 'how to learn english from netflix')
- Angle (one line — what makes this post different)
- The 4-step checklist below

Every blog task MUST have this ClickUp checklist, checked off in order:
- [ ] 1. Draft the blog in WordPress (create WP draft, fill Preview URL field)
- [ ] 2. Generate the 2 images and place them in the post (both inline, top one as hero)
- [ ] 3. Set up SEO in Yoast (see spec below)
- [ ] 4. Schedule the blog

Custom fields on every blog task: Preview URL, Blog URL.

## Step 1 — Draft in WordPress

The DRAFT LIVES IN WORDPRESS, not in the task description. Do not paste the full draft into ClickUp.

1. Create the WP post as DRAFT via mcp__claude_ai_WordPress_com__ (site 246426138):
   - Title, slug (SEO slug, matches the target keyword)
   - Category set at creation time — pick the closest existing WP category, do NOT invent new ones. If the closest is not obvious, flag it in the approval comment so Navid can rename.
   - Body: start with the scaffold (intro, 2-3 H2 sections, closing with real Chrome Web Store button + inline subturtle.app + dashboard.subturtle.app link where the AI Coach / flashcards / review is mentioned).
2. Write the actual body in WordPress. Voice = IELTS 6-7 plain English, short sentences, common words, one idea per sentence, contractions OK. NO em-dashes anywhere — use commas, full stops, 'and', 'but' instead. Line-by-line voice check against blog post #65 'How to Actually Learn English from Your Favorite Shows'.
3. Kill AI-isms: 'Welcome to the world of', 'secret weapon', 'is where X shines', 'we're here to give you'.
4. CTA check (mandatory): the closing lines link to REAL destinations. Real Chrome Web Store button (https://chromewebstore.google.com/detail/gaplicnpaiidofkoeonioomcnadoofkf), inline subturtle.app link on first Subturtle mention, dashboard.subturtle.app link wherever AI Coach/flashcards/review is mentioned.
5. Once the WP draft has real body content, fill the task's Preview URL field with the returned URL. Check off step 1.

## Step 2 — Two images, both inline, top one as hero

Every post has EXACTLY 2 images. Both go INSIDE the post body. The top one is also set as the WordPress featured image.

1. Image 1 (top / hero): sits right after the intro paragraph. This is the featured image too.
2. Image 2 (mid-article): sits at a natural section break between two H2 sections.
3. Generate them ONE AT A TIME via mcp__gemini__generate_image (default flash, use pro only if quality demands it). Getting them both in one call has blown timeouts twice.
4. For each image: mcp__wordpress__upload_media with the local file path (do NOT use base64 via claude.ai WP MCP — it times out on hero-sized images). Get the media URL back.
5. Embed both image URLs into the WordPress body as image blocks at their positions.
6. Set the featured image with mcp__wordpress__set_featured_image using the top image's file_path and the post_id.
7. Alt-text on both images uses the target keyword or a natural variation.
8. Check off step 2.

## Step 3 — SEO in Yoast

The blog runs Yoast SEO Premium. Every draft is graded through the Yoast sidebar in the WordPress block editor before it can leave 'approval'.

Mandatory fields and checks:

1. Open the WP draft in the block editor and open the Yoast sidebar.
2. **Focus keyphrase**: set to the target long-tail keyword from the task. Do NOT set 'Add related keyphrase' — it's Premium and our traffic is too small to matter yet.
3. **Search appearance** panel — fill all three by hand, do NOT use the AI Generate buttons:
   - **SEO title**: 55-60 characters, keyword near the front, benefit-led.
   - **Meta description**: 140-160 characters, keyword included, benefit-led. The green colour bar under the field must show green.
   - **Slug**: matches the target keyword, no filler words.
4. **Do NOT insert or use the Yoast AI Summarize block or the AI title/meta generate buttons.** They are off-limits until Navid clears the cost side.
5. **Alt text on both images**: uses the target keyword or a natural variation. Yoast reads these back in step 7.
6. **Links**: confirm one internal link (subturtle.app or dashboard.subturtle.app) and one external link to a real source (research paper, credible outlet) are in the body.
7. **Premium SEO analysis** panel — score must be GREEN with 0 or at most 1 improvement. All of these individual checks MUST be green:
   - Keyphrase in SEO title
   - Keyphrase in introduction
   - Keyphrase in subheading
   - Keyphrase in slug
   - Keyphrase in meta description
   - Keyphrase in image alt attributes
   - Meta description length
   - Internal links
   - Outbound links
   If any of the above is orange or red, fix the copy and re-run until they go green.
8. **Readability analysis** panel — score must be GREEN. Flesch reading ease target above 70 (visible in Insights). Fix long sentences, passive voice, subheading distribution as flagged.
9. **Schema** panel — leave defaults (Web Page + Article). Only switch Article type to 'How-to' if the post is a real step-by-step guide.
10. **Advanced** panel — leave everything default. No noindex, no nofollow, no canonical override.
11. **Skip these sections entirely** (do not touch): Add related keyphrase, Track SEO performance / Wincher, Internal linking suggestions, Social media appearance, Cornerstone content, Yoast Content Blocks (unless the post genuinely has a FAQ or a step-by-step how-to — then FAQ/How-to blocks only).
12. Only when Premium SEO analysis is green AND Readability is green, check off step 3.

## Step 4 — Schedule the blog (I pick the date, Navid does not approve slots)

After Navid approves the draft, I pick the publish date on my own using this rule:

- Next open weekday 09:00 Europe/Vilnius.
- Minimum 2 days gap between consecutive posts.
- Target 3 days between posts when the backlog allows.
- Skip weekends by default.
- Overflow rule: if 5 or more approved drafts are waiting in the queue, use Saturday 09:00 as an extra slot.

Process:
1. Check the WP scheduled queue to see the last scheduled post date.
2. Pick the next slot per the rule above.
3. Schedule the WP post to that date/time via mcp__claude_ai_WordPress_com__ (status: future, date: chosen slot).
4. Fill the task's Blog URL field with the scheduled URL (the WP URL is already known at scheduling time).
5. Post a comment on the task: 'Scheduled for <date> at 09:00 Vilnius. Reply here to override.'
6. Check off step 4.
7. Close the task.

Navid can override a slot with one reply. If he does, reschedule to the new slot and re-comment.

## Iterate (comment on an existing task)

When someone comments on a task in this list and wakes me: do NOT create a new WP post. Find the existing WP draft by slug (Preview URL on the task) and UPDATE it in place so the Preview URL stays stable. If the slug must change, update the field and note it in the reply comment.

## Never do

- Never publish a post live. Only schedule.
- Never invent new WordPress categories.
- Never paste the full draft into the ClickUp task description — the draft lives in WordPress.
- Never use em-dashes in body copy.
- Never skip the CTA check or the 2-image rule.
- Never use Yoast AI Summarize, AI Generate SEO title, or AI Generate meta description.
