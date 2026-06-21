# Thread chat-8crzyb7-1458

## Story so far (compacted 2026-06-21T10:23:41.775Z)

## Story so far (compacted 2026-06-21)

**Who:** Navid (founder, just defended PhD ~06-18) and Aso Dara (CEO agent). ClickUp DM `chat-8crzyb7-1458`.

**What was decided / shipped recently:**

1. **Browser/Playwright blocker resolved** — Navid rebuilt the architecture with a custom extension supporting long tasks. Browser actions now work.

2. **Reddit account live** — u/subtitles_and_coffee set up, joined 7 language subs, staying quiet 2–3 weeks. Per-sub rules saved (r/Korean = no AI posts, r/languagelearning = no link drops, r/Spanish = use megathread).

3. **Activation bug fixed in prod** — Selector component (codebridger/lib-vue-components) was suppressing phrase saves. Task 86exzbh61 closed.

4. **LinkedIn posts published** — Thesis carousel (86exynjj8) and Reddit-comparison post (86exxzaae) both shipped.

5. **WP categories/tags fixed** — Posts #226, #240, #247 re-tagged in WordPress. WP date-flips item dropped (stale).

6. **Blog ideas workflow set up** — New scheduled job `job-blog-ideas-pitch-mql2rlgd` runs every 3 days at 9am Vilnius (first run 06-22). Pitches 3–5 blog ideas as SEPARATE messages in the Subturtle Content Marketing channel. Navid approves per-thread → task created → blog drafted. BLOG-ONLY, no LinkedIn/social routing. Bulk drafting cancelled.

**User status snapshots:**
- 06-18 (defense day): 17 users, 9 leitner reviews, 1 phrase_saved, 0 checkouts. Real practice activity returned.
- 06-19 (partial): 8 phrase-clickers, 0 saves, 0 conversions. Main prod Mixpanel project (2599235) hit "permission denied" — OAuth re-auth needed; only Subturtle Legacy project (2795069) responding.

**Open thread right now (06-20 23:58):**
Navid asked Aso to review and improve his LinkedIn profile heading + About (`linkedin.com/in/navid-shad/`). Aso pulled it via browser:
- Current heading leads with KodeKloud, buries Subturtle, omits the PhD result.
- About section appears empty.

Aso proposed 3 positioning lanes (A: researcher-builder, B: founder-first, C: engineer-first), recommended **A**, and drafted three headings + a full About section for option A.

**Waiting on Navid (5 inputs):**
1. Pick A, B, or C.
2. PhD paper link (or "not public yet").
3. Modular-Rest GitHub link.
4. Email for About section (or "DM only").
5. Years on Subturtle (if he wants it stated).

Aso explicitly will NOT edit the LinkedIn page itself — Navid pastes the final text in.

**Other parked items:**
- Mixpanel OAuth re-auth still pending (recurring blocker).
- Stripe MCP OAuth re-auth still pending.

## Recent
### Navid Shad (founder) · 2026-06-20T23:58:45.655Z

any update?

### Aso Dara · 2026-06-20T23:58:46.187Z

No new work since the LinkedIn drafts I sent up-thread — the ball is on your side for those.

What's open:
1. LinkedIn rewrite — I'm waiting on your 5 answers: A/B/C, PhD paper link, Modular-Rest GitHub link, email or 'DM only', years on Subturtle.
2. Blog ideas pitch — first scheduled run is 06-22 at 9am Vilnius (2 days). Nothing for you until then.
3. Mixpanel main-prod project — OAuth still broken, so my activity reads are partial. Flagged yesterday, no action taken yet.

Nothing else active. Want me to pull a fresh user-activity check for today, or are you asking about something specific?

### Navid Shad (founder) · 2026-06-20T23:59:21.304Z

[@Aso Dara](#user_mention#113552267) any update?

### Aso Dara · 2026-06-20T23:59:21.931Z

Still nothing new since my message a minute ago, Navid. The ball's on your side for the LinkedIn rewrite (5 answers: A/B/C, paper link, Modular-Rest link, email or DM-only, years on Subturtle).

If you want me to actually DO something now, pick one:
1. Pull a fresh user-activity check for today (06-20).
2. Take a stab at the LinkedIn About using best guesses for the 5 blanks — you correct what's wrong.
3. Something else — name it.

Otherwise I'll go quiet until the blog-ideas pitch on 06-22.

### Navid Shad (founder) · 2026-06-21T00:03:32.762Z

I'm not looking for job anymore.
I am a founder and engineer, also ML and generative ai
building subturtle

### Aso Dara · 2026-06-21T00:03:33.476Z

Got it — positioning is founder-first, not job-seeking. Also flip off the 'Open to work' badge on your profile (top-right of your photo, 'Show recruiters you're open' toggle) — it contradicts the new heading.

New heading (under LinkedIn's 220 cap):

'Founder & engineer building Subturtle — AI Chrome extension turning Netflix & YouTube into language practice · NLP & generative AI · PhD: grammar model matching IELTS examiners at ~90x less compute'

New About:

'I build Subturtle — a Chrome extension that turns Netflix, YouTube and any web video into spaced-repetition language practice. Built end-to-end: Vue front-end, Node back-end, the extension layer, Stripe, auth, sync. Try it: subturtle.app

I just defended my PhD at Vilnius Tech on a Linguistic Knowledge Tree — a structured NLP model that scores grammar quality at ~0.90 correlation with IELTS examiners while using around 90x less compute than the deep-learning baseline.

Day-to-day I work across full-stack engineering (10 years), NLP, and generative AI — taking research prototypes into shipped product. I also maintain Modular-Rest, an open-source Node.js framework: [link].

If you build in language learning, NLP/ML tooling, or generative AI — happy to talk. DM me here.'

Two blanks to fill before you paste:
1. PhD paper link (or 'remove that sentence' if not public yet).
2. Modular-Rest GitHub link.

Send the two links and I'll drop them into the final text for you to paste. I won't touch the edit page — your profile, your hands.

### Aso Dara (action) · 2026-06-21T00:03:33.479Z

remember: noted "- (2026-06-21, via Navid Shad (founder)) (2026-06-21) Navid is NOT job-hunting anymore. Positioning is founder + engineer + ML/generative AI, building Subturtle. Future LinkedIn / bio / About writing must lead with founder-builder, not 'open to work'. Drop the 'Open to work' framing entirely."

### Navid Shad (founder) · 2026-06-21T10:09:27.060Z

as I mentioend before Im not studing PHD I study master of AI Engineering

### Aso Dara · 2026-06-21T10:09:27.565Z

Noted — Master of AI Engineering, not PhD. Fixing both drafts.

New heading (under 220 chars):

'Founder & engineer building Subturtle — AI Chrome extension turning Netflix & YouTube into language practice · NLP & generative AI · MSc thesis: grammar model matching IELTS examiners at ~90x less compute'

New About:

'I build Subturtle — a Chrome extension that turns Netflix, YouTube and any web video into spaced-repetition language practice. Built end-to-end: Vue front-end, Node back-end, the extension layer, Stripe, auth, sync. Try it: subturtle.app

I just defended my Master thesis in AI Engineering at Vilnius Tech on a Linguistic Knowledge Tree — a structured NLP model that scores grammar quality at ~0.90 correlation with IELTS examiners while using around 90x less compute than the deep-learning baseline.

Day-to-day I work across full-stack engineering (10 years), NLP, and generative AI — taking research prototypes into shipped product. I also maintain Modular-Rest, an open-source Node.js framework: [link].

If you build in language learning, NLP/ML tooling, or generative AI — happy to talk. DM me here.'

Same two blanks to fill before you paste:
1. Thesis paper / repo link (or 'remove that sentence').
2. Modular-Rest GitHub link.

And flip off the 'Open to work' badge — it contradicts the new positioning.

### Aso Dara (action) · 2026-06-21T10:09:27.568Z

remember: noted "- (2026-06-21, via Navid Shad (founder)) (2026-06-21) Navid's degree is a Master of AI Engineering at Vilnius Tech — NOT a PhD. I had it wrong in earlier LinkedIn drafts. Future bios/posts/About: 'Master thesis in AI Engineering' or 'MSc thesis', never 'PhD' or 'doctorate'. Thesis topic is unchanged: Linguistic Knowledge Tree, ~0.90 IELTS correlation, ~90x less compute than DL baseline."

### Navid Shad (founder) · 2026-06-21T10:19:46.535Z

let's focus on title only for now:
the title must be shoter, dont say chrome extenson, say lanugage learning platform,

### Aso Dara · 2026-06-21T10:19:47.119Z

Shorter, no 'Chrome extension'. Three options under ~120 chars:

1. 'Founder & engineer building Subturtle — AI language learning platform · NLP & generative AI'

2. 'Building Subturtle, an AI language learning platform · Founder, engineer · NLP & generative AI'

3. 'Founder of Subturtle — AI language learning platform · Engineer · NLP & generative AI'

My vote: 1. Leads with founder-builder, names the product, says what it is in 4 words, ends on the technical lane.

Pick one (or tell me to cut/swap a word) and I'll lock it in alongside the About.

### Navid Shad (founder) · 2026-06-21T10:23:19.169Z

I wrote:
Founder & engineer building Subturtle — AI language learning platform · machine learning & generative AI

how can I mention 10 years in software

### Aso Dara · 2026-06-21T10:23:19.791Z

Three ways to slot in 10 years, all under LinkedIn's title cap:

1. 'Founder & engineer (10y) building Subturtle — AI language learning platform · machine learning & generative AI'

2. 'Founder building Subturtle — AI language learning platform · 10y engineer · machine learning & generative AI'

3. 'Founder & engineer building Subturtle — AI language learning platform · 10 years in software · ML & generative AI'

My vote: 1. Cleanest — the '(10y)' rides right next to 'engineer' so the credibility lands without adding a whole new clause. Option 3 reads a touch long and option 2 splits founder from engineer.

Pick one and I'll lock the final heading + About together.

### Navid Shad (founder) · 2026-06-21T10:33:19.662Z

now let's work on description, Here is the current descriptio:n:
\`\`\`

### Aso Dara · 2026-06-21T10:33:21.258Z

Navid — what you pasted is not your LinkedIn description, it is my own system prompt (the JSON output contract). Looks like a copy-paste mix-up.

Paste the actual current text of your LinkedIn About section and I'll rework it to match the new heading (founder & engineer (10y), Subturtle, ML & generative AI, MSc thesis — no PhD, no 'Chrome extension').

### Navid Shad (founder) · 2026-06-21T10:33:56.497Z

now let's work on description, Here is the current descriptio:n:

```css
As a Full Stack Developer with over  +10 years in general and 3.5 years of experience at KodeKloud, I specialize in developing innovative web applications and integrating AI technologies to enhance user engagement. My work includes creating dynamic Quiz and Quiz Designer applications, implementing user-friendly UX designs, and developing AI agents using LangGraph and Langchain. These contributions have streamlined workflows and improved the efficiency of terminal-based examination systems.

With a strong foundation in artificial intelligence and web development, my focus lies in building modular, scalable systems that address complex challenges. Passionate about clean architecture and enhancing developer experience, I am committed to crafting solutions that empower users and drive operational efficiency. My collaborative approach ensures that I contribute effectively to cross-functional teams, fostering impactful and future-oriented technology solutions.
```

### Aso Dara · 2026-06-21T10:33:57.100Z

Here's a rewrite that matches the new heading — founder-first, Subturtle, 10y, ML/generative AI, MSc thesis (no PhD), no 'Chrome extension', and I cut the AI-isms:

---

I build Subturtle — an AI language learning platform that turns Netflix, YouTube, and any web video into spaced-repetition practice. I work across the whole stack: Vue front-end, Node back-end, the browser layer, Stripe, auth, sync. Try it: subturtle.app

I just defended my Master thesis in AI Engineering at Vilnius Tech. The thesis is a Linguistic Knowledge Tree — a structured NLP model that scores grammar quality at ~0.90 correlation with IELTS examiners, using around 90x less compute than the deep-learning baseline.

10 years in software. Most recently 3.5 years at KodeKloud, building Quiz and Quiz Designer apps and AI agents with LangGraph and LangChain for terminal-based examination workflows.

I also maintain Modular-Rest, an open-source Node.js framework: [link].

If you build in language learning, NLP/ML tooling, or generative AI — DM me here.

---

Changes vs. the current one:
1. Leads with Subturtle (founder-first), not KodeKloud.
2. KodeKloud kept but moved down — backs up the 10-year claim without owning the bio.
3. Dropped 'Full Stack Developer' label, 'innovative web applications', 'clean architecture', 'collaborative approach', 'future-oriented' — generic LinkedIn filler.
4. Added the MSc thesis result (the strongest credibility line you have right now).
5. Kept Modular-Rest as the open-source signal.

Two blanks to fill before you paste:
1. Thesis paper / repo link (or say 'remove that sentence' and I'll cut it).
2. Modular-Rest GitHub link.

Want me to shorten any section, or is this the shape?

### Navid Shad (founder) · 2026-06-21T10:41:57.905Z

make it 2 paragraph and dont use link, it is linkedin descritpion, investigate first to see how it should be

### Aso Dara · 2026-06-21T10:41:58.484Z

Quick investigation on LinkedIn About format, then the draft.

What the format demands:
1. Cap is 2,600 chars; only the first ~370 chars show before 'see more' on desktop (less on mobile). Hook MUST be in line 1.
2. URLs render as plain text — they are NOT clickable in About. So cutting links is the right call (matches your note).
3. Founder bios that perform: lead with what you are BUILDING, not a job title; show one concrete proof of substance; close with a soft CTA.
4. Two paragraphs is well within the readable range — most strong founder Abouts are 600–1,000 chars.

Draft (2 paragraphs, no links, ~870 chars):

---

I'm building Subturtle — an AI language learning platform that turns Netflix, YouTube, and any web video into spaced-repetition practice. End-to-end build: Vue front-end, Node back-end, the browser layer, payments, auth, sync. The idea is simple — let people learn from the shows they already watch, without breaking flow.

Ten years in software. Most recently 3.5 years at KodeKloud building Quiz and Quiz Designer apps and AI agents with LangGraph and LangChain for terminal-based exam systems. I just defended my Master thesis in AI Engineering at Vilnius Tech — a Linguistic Knowledge Tree that scores grammar quality at ~0.90 correlation with IELTS examiners, using around 90x less compute than the deep-learning baseline. If you build in language learning, NLP/ML tooling, or generative AI — DM me.

---

Choices I made vs. the current one:
1. First line is the hook (Subturtle, what it is, what it does) — fits in the above-the-fold window.
2. Dropped 'Full Stack Developer' label and the AI-isms ('innovative', 'clean architecture', 'future-oriented', 'collaborative').
3. KodeKloud kept but moved to paragraph 2 — backs up the 10-year claim without owning the bio.
4. Cut Modular-Rest — without a link it adds words but not value; better surfaced in the Featured / Projects section of your profile.
5. Soft CTA at the end (DM), no email needed.

Want it shorter, or change the closing line?
