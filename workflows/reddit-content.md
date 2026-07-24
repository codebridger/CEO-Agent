# Reddit content workflow

Purpose: grow awareness for Subturtle through genuinely helpful Reddit comments, never forced posting.

## Scope
- Subs: r/languagelearning, r/EnglishLearning, r/LearnJapanese, r/Spanish, r/French, r/German.
- r/Korean is fully off-limits - never open it, never draft from it, ever. That sub bans all AI-written content, no exceptions.

## Two lanes
- Value comment (default): no Subturtle mention, no link, purely helpful.
- Gated mention: only when a thread directly asks what tools/apps people use, or inside r/Spanish's official self-promo megathread - check first whether that megathread needs mod approval before assuming it is open.

## Daily scan (generate step)
- New comments: target up to 1-2 NEW top-level comments/day, only on genuinely fitting threads where existing comments miss an angle Subturtle's approach would add. 0 on days nothing fits - never force it to hit a quota.
- Reply check (same daily scan): also check the account's notifications/inbox for replies to previously POSTED comments. Check both old.reddit.com/message/inbox and www.reddit.com/notifications, since they surface slightly different things. For each reply that contains a real question or asks for something concrete, draft a specific, genuinely useful answer - same voice and lane rules as new comments (default to no Subturtle mention unless the person explicitly asks what tool/app you use). Skip pure upvotes and replies that are just agreement or thanks with no question - those need no action.

## Task creation rules (every draft - new comment or reply-answer)
- List: Subturtle Content Marketing (901809890244).
- Title MUST start with '[Reddit] r/<sub> — <short topic>'. This prefix is the reliable identifier for these tasks in the shared list - use it for any filtering/lookup, not the tag (see below).
- Tag: reddit-comment - attempt once via the add-tag tool. ClickUp tags are name-keyed, not ID-keyed (confirmed 2026-07-24: the connector tool only accepts a tag name, there is no ID-based path available, and the tag itself does exist in the space under that exact name). Verify with a single re-fetch after adding. If it did not stick, do NOT retry in a loop - confirmed 2026-07-24 that repeated attempts return the identical empty result with no propagation delay, so it is a hard write failure (likely a token/permission scope gap on my side), not a timing issue, and retrying wastes time. Just note the task ID in the daily report so Navid can batch-tag the failures by hand.
- Status: to do (not the list default inactive).
- Assignee: Aso (self) - never left inactive/unassigned.
- Due date: day of creation + 1.
- Body: which sub, the thread/comment link (for a reply-answer, link the exact comment being replied to), the lane, the drafted text.

## Posting (iterate step, triggered by a comment saying 'approved')
1. Confirm the Aso Dara browser is up first. If not, stop and ping Navid directly - do not retry or guess.
2. Run as a long job (browser + multi-step).
3. Open the thread (or the specific comment, for a reply-answer), post the drafted text. On old.reddit.com the SAVE button can silently eat the first click - verify the comment actually posted (screenshot or reload) before trusting it, retry the click if needed.
4. Grab the live permalink.
5. Set the task's Publish Url custom field to the live permalink, then re-fetch the task to confirm the field actually holds the URL before moving on. Also add a 'Posted: <permalink>' task comment.
6. Set the task to Closed only once the URL is confirmed live in the Publish Url field.
