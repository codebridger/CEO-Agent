# Thread clickup-task-86eu70pg4

### Navid Shad (founder) · 2026-07-13T10:43:41.222Z

(You have just been assigned this task.)

### Aso Dara (on it) · 2026-07-13T10:43:41.646Z

On it, Navid. Task 86eu70pg4 ("The Culture Behind the Words: How Learning English Opens Up a New World") has a due date of 2025-08-14, so it's badly overdue. I'm taking it as a long job now: full WordPress draft, 2 images, Yoast SEO to green, then I'll pick a schedule slot per my usual rule and post the date here.

### Aso Dara · 2026-07-13T10:48:04.343Z

I've drafted and set up the blog post, but couldn't finish the last step. Here's the status:

**Done:**
- Wrote and published as a WordPress draft: "The Culture Behind the Words: How Learning English Opens Up a New World" — https://blog.subturtle.app/?p=576
- Category set to "Cultural Immersion" (closest existing match, fits perfectly)
- Full body written in house voice: no em-dashes, short sentences, real CTA links (Chrome Web Store button, subturtle.app on first mention, dashboard.subturtle.app near the AI Coach/flashcards mention), one outbound link to a credible BBC Future piece on language and thought
- 2 images generated and placed: hero right after the intro (also set as featured image), second at the idioms section break, both alt-texted with the target keyword
- SEO fields set via Yoast: focus keyword "learning english through culture," SEO title, meta description, slug — and I made sure the keyphrase shows up in the title, intro, one H2, slug, meta description, and an image alt, satisfying all the checkable Yoast rules
- Filled the Preview URL field on ClickUp task 86eu70pg4 and posted a comment there with the full status, tagging you

**Blocked:**
- The Aso Dara Chrome browser isn't connected right now (bridge is online, but the extension shows disconnected), so I couldn't force Yoast to recompute its live SEO/readability score, which only happens inside the block editor. The `_yoast_wpseo_linkdex` / `_yoast_wpseo_content_score` fields are still empty.
- Per the playbook I'm not scheduling an unconfirmed draft. Once you open the Aso Dara Chrome window (extension connected), let me know and I'll open the post, confirm both Yoast scores are green, fix anything orange, and schedule it — next open slot is Tuesday 2026-07-14, 09:00 Vilnius, since nothing else is currently queued.

### Navid Shad (founder) · 2026-07-13T10:56:05.174Z

@Aso Dara can you use royal mcp for Yoast SEO params?

### Aso Dara · 2026-07-13T10:56:05.573Z

@Navid Yes, I already did — the SEO title, meta description, and focus keyword ("learning english through culture") are all set on the post via `wp_update_seo_meta` in Royal MCP. Just checked post meta again to confirm: those three fields are there.

What Royal MCP can't do is compute the live Yoast score (`_yoast_wpseo_linkdex` and `_yoast_wpseo_content_score` are still empty). That score only gets calculated inside the WordPress block editor by Yoast's JS analyzer, no API for it. So I still need the Aso Dara Chrome browser connected to open the draft, let Yoast recompute, and confirm it's green before I schedule.

Once that browser is up, I'll take care of it and post the schedule date here.

### Navid Shad (founder) · 2026-07-13T10:58:09.589Z

@Aso Dara the aso browser is live now

### Aso Dara (on it) · 2026-07-13T10:58:09.988Z

Browser's confirmed live, Navid. Opening the draft now to force Yoast to recompute and confirm SEO + readability are green, then I'll schedule it and post the date here.

### Aso Dara · 2026-07-13T11:06:32.473Z

Everything's done. Final report for Navid:

Opened the post in the block editor with the Aso Dara browser and let Yoast recompute live. It came back with 3 real problems and 1 improvement, not just a stale-score issue:

- No internal links on the page — added one to our existing "How to Actually Learn English from Your Favorite Shows" post
- Keyphrase distribution was very uneven (clustered in the intro and ending) — added the keyphrase naturally into the grammar and idioms sections too
- Keyphrase only in one subheading — renamed the shows section to "How TV Shows Teach You to Learn English Through Culture"
- Meta description was over the character limit — trimmed it to 135 characters

Fixed all four via Royal MCP, reloaded the editor to force a fresh Yoast pass, and confirmed all 19 checks green with no problems left. Saved, then read the real scores back from post meta: **SEO 94/100, Readability 90/100**.

Scheduled the post for **Tuesday, 2026-07-14 at 09:00 Vilnius** (nothing else was queued, so that's the next open slot). One thing worth flagging: the site's actual WordPress timezone is set to Europe/Istanbul, not Europe/Vilnius — they share the same UTC+3 offset in July so it worked out fine this time, but it's worth knowing for future scheduling since a Vilnius/Istanbul DST mismatch would eventually cause an hour drift.

Updated ClickUp task 86eu70pg4: Blog URL field filled, replied to your "browser is live now" comment with the final scores and date, and closed the task.
