# LinkedIn Content Workflow

## List

- All LinkedIn drafts live in the merged **Subturtle Content Marketing** list (901809890244), alongside blog and Reddit content. The old standalone LinkedIn list is retired — do not create tasks there.

## Voices and publishing paths

Both voices are LIVE via the `mcp__social-engine__` MCP (confirmed 2026-07-21 via `list_accounts`):

- **Founder voice (Navid's personal page)** — publish via `mcp__social-engine__publish_post` with no account_id (defaults to Navid's personal profile). Human-gated: I draft, Navid reads, Navid comments 'publish' (or 'publish at <time>') on the task, I call publish_post, then I put the live URL into the task's **🔗 Publish Url** custom field and move it to 'published'. No silent posts. Never auto-publish.
- **Subturtle company page** — publish the same way via `mcp__social-engine__publish_post` with `account_id: acct:NaogxEouwoHsKqTqP8KH`. Same human gate: draft, Navid comments 'publish' on the task, I post, put the live URL into the **🔗 Publish Url** field, mark published. No longer paused — API access confirmed live.
- A third account (`CodeBridger LDT`, org, id acct:7HKerwOKQ9hNeScDQBlc) also showed up in list_accounts. Do NOT draft or publish to it — nobody has asked for that page yet. Flag it to Navid if it comes up again.

## Cadence

- Cron run = Saturday 09:00 Europe/Vilnius. Drafts TWO posts for the upcoming slot: one founder-voice, one Subturtle-voice.
- Iterate-on-comment: any comment on a draft task in this list wakes me to refine that specific post.

## Founder-post rules

- 1st person, conversational, Navid's voice. Plain everyday English at ~IELTS 6. Short sentences.
- 600–1,200 characters (LinkedIn's sweet spot). Hook in line 1. One idea per post.
- Topics: building Subturtle in public, what we learned shipping the Chrome extension, language-learning angles that come from the product (not generic), small founder lessons.
- No fabricated metrics. No AI disclosure. No hashtag soup — max 3 relevant tags at the end.
- If a hero/illustrative image fits, generate one via mcp__gemini__generate_image (flash) and attach to the task.
- Before drafting: read the last ~10 published founder posts on Navid's LinkedIn (or the last 10 drafts in this list) and skip overlap.

## Subturtle-page post rules

- Product/company voice, not personal — but still plain IELTS-6 English, short sentences, one idea per post, no AI-isms.
- 600–1,200 characters. Hook in line 1.
- Topics: product updates, language-learning tips that showcase the product naturally, small wins worth sharing (a feature shipped, a milestone), never forced self-promo.
- No fabricated metrics. No AI disclosure. Max 3 hashtags.
- Same image rule as founder posts (Gemini flash, attach to task) when it fits.
- Before drafting: read the last ~10 published/drafted Subturtle-page posts and skip overlap.

## Task shape

- Title: 'LinkedIn (founder) — <topic>' or 'LinkedIn (Subturtle) — <topic>'.
- Description in markdown with `## Heading` sections: ## Hook, ## Body, ## CTA, ## Hashtags, ## Notes.
- Tags: 'linkedin' plus 'navid-page' (founder-voice posts) or 'subturtle-page' (company-page posts) — both tracks are now active.
- Status: 'approval' on creation.
- Notify Navid on the task.

## Publish step

- Triggered by Navid commenting 'publish' or 'publish at <time>' on a task in this list.
- I call `mcp__social-engine__publish_post` (default account for founder-voice, `account_id: acct:NaogxEouwoHsKqTqP8KH` for Subturtle-voice).
- After posting, put the live post URL into the task's **🔗 Publish Url** custom field — this is mandatory every time, not just a task comment. Also move status to 'published'.
- If publish fails, I leave status in 'approval' and reply on the task with the error — never claim a post went out unless the MCP confirms it, and never fill Publish Url unless the post is actually live.
