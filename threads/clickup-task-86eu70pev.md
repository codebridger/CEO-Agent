# Thread clickup-task-86eu70pev

### Navid Shad (founder) · 2026-06-13T20:57:08.550Z

@Aso Dara can you check this post, some already provided the link

### Aso Dara · 2026-06-13T20:57:09.197Z

Navid — I pulled the post draft (id 183, status "pending") from the blog via the WordPress connector and read all 5 tips end to end. Somi's preview link is gated, so the WP read was the only way to see the real content.

**Verdict:** the writing itself is fine. Friendly intro ("clarity, not perfection"), the 5 tips (schwa, sentence stress, connected speech, minimal pairs, shadowing) are correct and easy to follow, the Subturtle pitch sits naturally inside Tip 5 (shadowing → "pause, check meaning, replay"). The closing line "Hear the difference for yourself. Use Subturtle on YouTube" lands well.

**But it is not ready to publish, for one big reason: there is no CTA link anywhere.** The whole point of the post — revenue — is the click to install. Right now:

1. **The final CTA is bold text, not a button, and links to nothing.** A reader who decides "ok, I'll try it" has no path. Add a clear button linking to the Chrome Web Store listing (https://chromewebstore.google.com/detail/gaplicnpaiidofkoeonioomcnadoofkf). This is the single change that decides whether the post earns anything.
2. **Slug is empty and category is only "Uncategorized" (id 1), no tags.** Set a clean slug like `sound-more-natural-pronunciation-tips`, pick a real category (e.g. Speaking / Pronunciation), and add 3–5 tags. This is SEO and blog navigation.
3. **Alt text on the images still reads like image-prompt notes** (e.g. "A friendly, relatable character (fitting the 18-35 age range)…"). Rewrite as plain descriptions — better for SEO and accessibility.
4. **Optional but worth it:** add one in-body link to Subturtle around Tip 5 too (not only at the end), so the click is offered the moment the reader feels the pull.

If Somi adds the CTA button + slug + tags + alt-text cleanup, it's good to ship. Without the CTA, publishing it costs us the traffic. Want me to draft the exact Gutenberg block for the CTA button so Somi can drop it in?

### Navid Shad (founder) · 2026-06-13T21:03:14.053Z

@Aso Dara can you fix those points?

### Aso Dara · 2026-06-13T21:03:14.513Z

Navid — yes, I can do the fixable parts directly on the draft (it stays in "pending", I won't publish). Plan:

1. **CTA button at the end** — I'll add a Gutenberg button block linking to the Chrome Web Store listing (https://chromewebstore.google.com/detail/gaplicnpaiidofkoeonioomcnadoofkf), styled to match the post.
2. **In-body link inside Tip 5** — wrap "Subturtle" with the same store link so the click is offered the moment the reader feels the pull.
3. **Slug** — `sound-more-natural-pronunciation-tips`.
4. **Category + tags** — move out of "Uncategorized" into a Speaking/Pronunciation category, add tags like `pronunciation`, `speaking`, `english-learning`, `accent`, `shadowing`. I'll pick what already exists on the blog rather than create new ones; if nothing fits I'll flag it instead of inventing.
5. **Alt text** — rewrite all image alts as plain descriptions of what's shown, drop the prompt-style notes.

Two things to confirm before I touch it:

- **Who's the author?** I'll keep Somi as the author and leave it in `pending` so she or you do the actual publish click. I'll also comment on the task so Somi sees what I changed and can push back.
- **CTA copy** — I'll use "Try Subturtle on YouTube — free Chrome extension" on the button. Tell me if you want a different line.

If both are fine, say "go" and I'll do the edits in one pass and report back here with the diff. If you want me to wait for Somi instead, I'll just drop the Gutenberg snippet in a comment for her.

### Navid Shad (founder) · 2026-06-13T21:09:14.328Z

alright fix theme

### Aso Dara · 2026-06-13T21:09:14.841Z

Navid — done. Post 183 still in "pending", I did not publish.

**Changes applied:**
- **Slug** → `sound-more-natural-pronunciation-tips`
- **Category** → moved out of Uncategorized into "Language Tips"
- **Tags** → `shadowing`, `ESL strategies`, `learning`, `education`, `active learning` (all already existed). A "pronunciation" tag would be ideal but doesn't exist — I didn't create one, as I said I wouldn't invent. Tell me if you want me to add it.
- **In-body link in Tip 5** → first "Subturtle" now links to the Chrome Web Store.
- **CTA button at the end** → new centred button block: "Try Subturtle on YouTube — free Chrome extension" → store listing.
- **Alt text on all 6 images** rewritten as plain descriptions (banner, schwa diagram, sentence stress, connected speech arrows, ship/sheep minimal pair, shadowing sound waves) — no more prompt-style notes.

**Not changed:**
- Author (still Somi, as planned).
- Status stays "pending" — so Somi or you click publish.
- Body copy of the 5 tips — left as written.

**Links to check:**
- Edit: https://blog.subturtle.app/wp-admin/post.php?post=183&action=edit
- Preview: https://blog.subturtle.app/?p=183&preview=true

If the preview looks right, ship it. If the button styling clashes with the theme or you want different CTA copy, tell me and I'll redo just that block.

### Navid Shad (founder) · 2026-06-13T21:18:45.510Z

That is really great, which time is good for publishing?

### Aso Dara · 2026-06-13T21:18:45.966Z

@Navid Shad Navid — I don't have hard Subturtle blog traffic data to calibrate from (no analytics connector on the blog yet), so this is general best-practice, not a measured call.

**My pick: Tuesday 16 June, ~09:00 UTC.**

Reasoning:
- **Tue–Thu mornings** consistently outperform weekends and Mondays for educational/B2C blog reads. Today is Saturday — publishing now hits the weakest window.
- **09:00 UTC** catches three of our biggest learner pools in one shot: morning in Europe (10:00 CEST), early afternoon in Iran/MENA (12:30 IRST), evening in India (14:30 IST), and it leaves the US day still to come.
- Avoiding **Wednesday 17** because that's your thesis deadline — if the post drives a spike of installs/signups and something breaks, you won't have hands.

**Before you ship**, two cheap multipliers:
1. **Have a social post ready to fire the same hour** — LinkedIn (I can publish via the social-engine MCP) + any other channel Somi runs. A blog post with no push gets ~zero organic traffic on day one.
2. **Confirm the CTA button actually links out** — open the preview, click it, make sure it lands on the Chrome Web Store. I edited it but a human eye on the live render is worth 30 seconds.

If Tuesday 09:00 UTC works, tell me and I'll draft the LinkedIn post now so it's queued and ready. If you want a different window, name it.

### Navid Shad (founder) · 2026-06-13T21:21:50.780Z

alright schedule the post

### Aso Dara · 2026-06-13T21:21:51.312Z

@Navid Shad Navid — scheduled. Post 183 is now `future`, set to auto-publish on **Tuesday 16 June 2026 at 09:00 UTC** (12:00 Istanbul, the site's timezone). WordPress will publish it on that timer; no human click needed.

Quick checklist:
- **Preview before Tuesday:** https://blog.subturtle.app/?p=183&preview=true — worth one click on the CTA button to confirm it lands on the Chrome Web Store from the live render.
- **Edit if needed:** https://blog.subturtle.app/wp-admin/post.php?post=183&action=edit — if you change anything, status stays `future` unless you flip it.
- **Reschedule:** just tell me a new time and I'll move it.

**Next step on my side:** want me to draft the **LinkedIn post** now and queue it to publish at the same hour (09:00 UTC Tue)? I'd publish through the social-engine MCP — same rules as before, I'd show you the draft first, you say go, then it ships. A blog post without a social push usually gets close to zero traffic on day one, so this is the cheap multiplier.

Say "draft it" and I'll have it ready in the next reply.

### Navid Shad (founder) · 2026-06-13T21:22:58.494Z

@Aso Dara the cta works

### Aso Dara · 2026-06-13T21:22:58.985Z

@Navid Shad Navid — good, that was the one thing I couldn't verify from my side. Post is locked in for Tue 16 Jun 09:00 UTC.

Shall I draft the **LinkedIn post** now and queue it to publish at the same hour? Without a social push the blog post will get close to zero traffic on day one. Say "draft it" and I'll have it in the next reply for your review before anything ships.

### Navid Shad (founder) · 2026-07-13T12:29:35.615Z

@Aso Dara the seo of this task need some work

### Aso Dara (on it) · 2026-07-13T12:29:36.023Z

On it, Navid — I'll open post 183 (the pronunciation tips post) in the editor, see what Yoast is flagging, fix it, and confirm both scores are green before reporting back.

### Aso Dara · 2026-07-13T12:37:51.545Z

Status confirmed still `publish`, same URL and date. Done.

Fixed the SEO on the "Sound More Natural" pronunciation post. It had never been through the Yoast gate before, since it predates that step.

**Before:** SEO score not computed (empty), readability 90 (already fine, no changes needed there).
**After:** SEO score 92, readability 90. Both green.

What I changed:
- Set the focus keyphrase to "pronunciation tips" and wrote a proper SEO title and meta description for it (title/description were both empty before).
- Added the keyphrase to the intro paragraph, one more body paragraph, and a subheading (it only appeared twice before, clustered near the end).
- Added alt text with the keyphrase to two images.
- Added an outbound link (Wikipedia, on "schwa") and an internal link to our own Pause-Rewind Rule post, since neither existed before, only the Chrome Web Store links.
- Trimmed the meta description to a cleaner length.

Didn't touch: publish status (still live, same URL), the CTA button, the Subturtle links from the June fix, or the voice/tone. Post stays published at https://blog.subturtle.app/2026/06/16/sound-more-natural-pronunciation-tips/.
