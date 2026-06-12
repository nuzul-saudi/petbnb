# Autonomous batch — kickoff instructions for Claude Code

Paste this at the start of any unattended batch run. Operating rules
remain in force for the whole session until you tell me otherwise.

---

You're running an unattended batch. Work through the plan one piece at
a time; don't wait for me between commits. I'll review the result
after.

## Operating rules

1. **Per-piece commits.** Each round / phase / feature lands as its own
   commit with a descriptive message naming the round number. Never
   batch unrelated changes into one commit.
2. **Green before commit.** Run `npx tsc --noEmit` and confirm clean
   BEFORE every commit. No commit with TypeScript errors. Ever.
3. **Full CI at round end.** Run `npm run ci` (= i18n parity + tsc +
   vitest) before closing a round. Must be green.
4. **Migrations: WRITE but do NOT APPLY.** Drop SQL files in
   `supabase/migrations/NNNN_<name>.sql` with verification queries in
   the file head. I apply them via the Supabase SQL editor after I
   review the diff. Never run `supabase db push` or similar.
5. **RLS preflight: grep first.** Before adding a new RLS policy, grep
   `supabase/migrations/*.sql` for prior policies on the same table.
   Drop-then-recreate, don't double-add.
6. **Append to `docs/batch-decisions.md`** at the end of each round —
   one short bullet per non-obvious decision (why this approach,
   what was rejected, what's deferred).
7. **Push after round completes.** `git push origin main` is
   pre-authorized as long as CI is green.
8. **Don't modify `CLAUDE.md`.** That's my spec; it changes only when
   I explicitly ask.
9. **Feminine Arabic register** (ـكِ not ـكَ, أضيفي not أضف) in any new
   Arabic copy — the hosts are women.
10. **Never commit secrets.** No `.env`, no API keys, no Supabase
    project IDs, no Resend keys, no screenshots with real user data.
    Verify with `git status` before every commit.
11. **Per-piece todo list.** Use the TodoWrite tool to track work
    across the round. One item in_progress at a time.
12. **Plain-language updates only when something interesting
    happens** — not every tool call. I don't need a running narration.
13. **Follow the plan in order. Don't invent new rounds.** The plan
    file (or my opening message) names the rounds. Work them in that
    order. If you finish faster than expected, that's fine — don't
    fill the time with features that weren't on the list. A feature
    being useful, defensible, or "a natural next step" is NOT a
    reason to add it. The plan is the plan.
14. **Stop when the plan runs out.** When the last scoped item is
    committed and CI is green, the session is DONE. Report what
    shipped, what's queued for me (migrations to apply, decisions to
    review), and stop. Do not start a new round. Do not pick the
    next thing off §13 of CLAUDE.md or any backlog. If you genuinely
    think more work is warranted, ASK — one sentence — and wait.
    Re-interpreting "finish the plan" as "keep going" is the failure
    mode this rule exists to prevent.

## What you should ASK me about, not decide on

- Anything that changes pricing math, fee splits, or refund policy.
- Anything that mutates production data (DELETE / UPDATE across
  multiple rows) outside of a planned migration.
- Anything that touches billing, payments, or insurance integration
  semantics.
- Adding a new external dependency (npm package, API service).

## What's in scope to decide autonomously

- Schema choices within the planned migration (column type, defaults,
  check constraints).
- Index choices.
- Component composition / file structure.
- Copy in Arabic + English locales, as long as the register and
  meaning match.
- Polish items that fall naturally out of the round.

## Picking up after a context reset

If the session was summarized or restarted mid-batch, do this first:
1. `git log --oneline -10` and `git status` — what already landed?
2. Read `docs/batch-decisions.md` — what was decided in prior rounds?
3. Read this file's "Operating rules" again.
4. Check the active TodoList. If it doesn't exist, rebuild it from
   the plan.
5. Resume at the first unchecked item.

Don't ask "should I continue?" — just continue.
