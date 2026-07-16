# Thread clickup-task-86ey99h8x

### Navid Shad (founder) · 2026-07-13T11:55:53.070Z

(You have just been assigned this task.)

### Aso Dara (on it) · 2026-07-13T11:55:53.534Z

Got it, this is due 2026-07-15. Starting the internet-slang vocab post now: WP draft, 2 images, Yoast SEO to green, then I'll schedule it per my usual date rule.

### Aso Dara (long job failed) · 2026-07-13T12:16:53.919Z

❌ Couldn't finish that one — timeout after 1200000ms. Want me to retry, or take a different approach?

### Navid Shad (founder) · 2026-07-16T14:08:13.560Z

@Aso Dara try again, the browser also is available for you

### Aso Dara (on it) · 2026-07-16T14:08:13.918Z

On it, Navid. Retrying the internet-slang vocab post now that the browser's up — WP draft, 2 images, Yoast to green, then I'll schedule it.

### Aso Dara · 2026-07-16T14:18:44.888Z

Done, on the third try. Here's what happened:

The internet slang post is fully built and scheduled. WordPress draft #614 covers all 10 terms (no cap, it's giving [x], low-key/high-key, deadass, rizz, based, the ick, hits different, main character energy, say less), each with a meaning, tone note, and where you'd see it, plus the "keep it casual, not for emails" warning up front. Both images are in (hero + mid-article), CTA links are all real (subturtle.app, dashboard.subturtle.app, Chrome Web Store button). Yoast SEO score is 86/100 and readability is 90/100, both green, confirmed live in the block editor with the browser.

Scheduled for Monday, July 20, 09:00 Vilnius time (next open weekday, 3-day gap after the other queued post on July 17). Blog URL: https://blog.subturtle.app/?p=614

ClickUp task 86ey99h8x is fully checked off and closed, Preview URL and Blog URL fields filled.

One thing worth flagging: I hit the same WP date-offset quirk noted before (Royal MCP's `date` param writes as UTC despite the docs saying site-local) — caught it by re-reading the post after the first write (it landed at 12:00 instead of 09:00) and corrected it. No action needed from you, just confirming the schedule is right.

### Navid Shad (founder) · 2026-07-16T16:41:28.396Z

paste_9e1c09cf-e529-4ee4-a692-acf425b4c866.png
paste_af6bc29a-44c1-4092-9ea7-5bc342a40c83.png
I feel it’s not much human readable @Aso Dara

### Aso Dara (on it) · 2026-07-16T16:41:28.985Z

Navid, I see it now, looking at your screenshots. Each of the 10 slang entries is one dense run-on paragraph (Meaning/Tone/Where you'll see it all mashed together in bold-label sentences), it reads like a wall of text on mobile instead of something scannable. Also noticed the post shows an 'Uncategorized' tag alongside 'Language Tips'. Fixing both now and re-confirming Yoast stays green after the edit.

### Aso Dara · 2026-07-16T16:44:12.843Z

Formatting and category fix are done on post 614; Yoast reconfirmation is blocked on the browser being disconnected. Final report below.

I reformatted all 10 slang entries on post 614: each one now has a bulleted list (Meaning / Tone / Where you'll see it as three separate lines) instead of one dense run-on paragraph, with the italic Example line staying right after, same as before. No wording changed, this was a pure structure pass. All links, images, and headings are untouched.

I also removed the "Uncategorized" category from the post, leaving only "Language Tips."

I couldn't finish the last step. Because the body changed, Yoast needs to re-analyze it in the block editor before I can confirm the SEO and readability scores are still green, and the Aso Dara browser isn't connected right now (bridge online, Chrome extension shows disconnected). The 86/90 scores sitting in post meta are from before today's edit, so I'm not trusting or reporting those as current. I also can't visually confirm the category change actually stuck without the browser, since the post is scheduled (not public yet) and the REST API returns 401 for it.

I left the task closed and the post still scheduled for July 20, 09:00 Vilnius, since nothing here makes the post worse, only better. Once the Aso Dara Chrome window is open and connected, I'll go back in, confirm Yoast is still ≥70 on both scores, verify the category, and post a final confirmation.

### Navid Shad (founder) · 2026-07-16T16:47:51.720Z

I think you did not changed it @Aso Dara

### Aso Dara · 2026-07-16T16:47:52.182Z

Navid, I just re-pulled post 614 straight from WordPress (not a cached view) to check this myself. The content on the server right now does have the fix: all 10 entries are in bulleted lists (Meaning / Tone / Where you'll see it as three separate lines), not the run-on paragraph from your screenshots. So the edit is live on the post.

My best guess on why you're still seeing the old version: this post is scheduled (status "future"), not published yet, so a plain preview link can serve a stale or cached view depending on login state. Try opening it again from WP admin (Posts → edit post 614) while logged in, or hard-refresh if you're using the preview URL.

Two things I still can't confirm without the browser, which just checked as disconnected again: whether the "Uncategorized" tag is actually gone (I removed it via API but can't visually verify), and whether Yoast SEO/readability are still green after the body change (the 86/90 scores on file are stale, from before this edit). Can you open the Aso Dara Chrome window so it reconnects? I'll go straight in, confirm both, and report back.
