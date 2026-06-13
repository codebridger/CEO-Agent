# LinkedIn Content Workflow

## Voices and publishing paths

- **Founder voice (Navid's personal page)** — publish via the social-engine MCP. Human-gated: I draft, Navid reads, Navid comments 'publish' (or 'publish at <time>') on the task, I call mcp__social-engine__publish_post against his page, then I attach the live URL back on the task and move it to 'published'. No silent posts. Never auto-publish.
- **Subturtle company page** — API still under review by LinkedIn. PAUSED for now. Do NOT generate Subturtle-page drafts on this workflow. The only path to publish Subturtle stuff today is the browser, and that variant only switches on when Navid asks for it in private DM.

## Cadence

- Cron run = Saturday 09:00 Europe/Vilnius. Drafts ONE founder-voice post for the upcoming slot.
- Iterate-on-comment: any comment on a draft task in this list wakes me to refine that specific post.

## Founder-post rules

- 1st person, conversational, Navid's voice. Plain everyday English at ~IELTS 6. Short sentences.
- 600–1,200 characters (LinkedIn's sweet spot). Hook in line 1. One idea per post.
- Topics: building Subturtle in public, what we learned shipping the Chrome extension, language-learning angles that come from the product (not generic), small founder lessons.
- No fabricated metrics. No AI disclosure. No hashtag soup — max 3 relevant tags at the end.
- If a hero/illustrative image fits, generate one via mcp__gemini__generate_image (flash) and attach to the task.
- Before drafting: read the last ~10 published founder posts on Navid's LinkedIn (or the last 10 drafts in this list) and skip overlap.

## Task shape

- Title: 'LinkedIn (founder) — <topic>'
- Description in markdown with `## Heading` sections: ## Hook, ## Body, ## CTA, ## Hashtags, ## Notes.
- Status: 'approval' on creation.
- Notify Navid on the task.

## Publish step

- Triggered by Navid commenting 'publish' or 'publish at <time>' on a task in this list.
- I call the social-engine MCP, post to Navid's page, attach the live URL on the task, move status to 'published'.
- If publish fails, I leave status in 'approval' and reply on the task with the error — never claim a post went out unless the MCP confirms it.

## Subturtle-page (when API clears)

- When Navid says the LinkedIn API approval landed, flip on a second draft per run for the Subturtle page using the same flow. Same publish gating.
- Until then: don't draft Subturtle-page posts on the cron run.
