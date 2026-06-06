# Editable instructions (the agent's playbooks)

These are the CEO agent's **editable instruction files** (PRD §4.3) — the playbooks
and checklists that shape its scheduled runs. They are version-controlled and loaded
at runtime by `src/prompts/load.ts`, so the agent can improve them through the normal
PR flow (the `self-improve` action) without a code change.

- `heartbeat.md` — the heartbeat playbook (the recurring CEO routine).
- `pm-check.md` — the project-management sweep checklist.

`{{placeholders}}` are filled in by the app with the run's dynamic values (paths,
channel ids, the current inbox activity, etc.) — keep them intact when editing.

This is **not** the contract. `CONTRACT.md` defines identity, permissions, and the
"never do" list; it changes only by a PR that Navid merges. These files tune *how*
the agent carries out what the contract already allows.
