# Migration 0048 / Phase 3 — Trust surface batch (PLAN)

> **Status: PLAN — not yet built.** Plan-doc-first because 0048 is a
> migration. Flow: this doc → Strategy + founder review → build (SQL
> written-not-applied, app code) → line-by-line SQL review → Omar
> applies → verification → `docs/migration-apply-log.md`.
>
> **Baseline:** main through Phase 1.5 analytics (commit `4a072f6`),
> migrations applied through 0047. 0049 (email guard) is written but
> independent — 0048/0049 can apply in either order.

## 1. Goal & scope

Close the three cheap trust/legal gaps (pre-pilot plan, Phase 3):

1. **Cancellation-policy disclosure** — owners currently discover the
   refund tiers only by cancelling. Show the policy BEFORE they commit.
2. **Share/OG meta** — a Petbnb link pasted into WhatsApp today unfurls
   with nothing. Ship site-wide brand tags.
3. **Legal routes + consent** — `/terms` + `/privacy` placeholders,
   consent checkbox in both signup funnels, and PDPL-useful evidence of
   consent (`profiles.tos_accepted_at`, migration 0048).

## 2. Cancellation-policy disclosure

- **Where:** (a) a policy card on `/listings/[id]/request` above the
  sticky summary bar; (b) a one-line summary on the listing detail
  (near the price / stay-dates widget).
- **Copy renders FROM CODE, not hand-written numbers:** the card takes
  its tiers from `src/lib/payments-policy.ts` exports so the text can
  never drift from the refund math. The 48h threshold and 50% rate are
  currently inline literals inside `computeCancellationRefund` — the
  build will export them as named constants
  (`CANCELLATION_FULL_REFUND_HOURS = 48`, `CANCELLATION_LATE_REFUND_RATE
  = 0.5`) and the function body will consume the same constants
  (pure-refactor; `tests/payments-policy.test.ts` pins behavior).
- **i18n:** new `cancellation_policy.*` keys, both locales, masculine
  register, placeholders filled from the constants (e.g. `{hours}`,
  `{percent}`). Latin digits per the locked decision.
- No schema, no RLS.

## 3. Share/OG meta (`src/app/+html.tsx`)

- Add to the web HTML shell: `<title>`, meta description, `og:title`,
  `og:description` (Arabic-first copy), `og:image` (a brand card asset
  bundled at `public/og-card.png` — 1200×630, sand background + wordmark
  per §8 tokens; generated in this batch), `og:type=website`,
  `twitter:card=summary_large_image`.
- **Honest SPA limitation, stated in code comment + here:** Expo web is
  a client-rendered SPA — every route serves the same HTML shell, so
  these tags are SITE-WIDE. Per-listing dynamic OG (listing title +
  photo in the unfurl) needs server rendering; logged as a post-pilot
  Vercel follow-up in CLAUDE.md §11.
- No schema.

## 4. Legal routes + consent + migration 0048

### Routes
- `/terms` + `/privacy` — static screens rendering placeholder copy
  **clearly marked as draft** (visible "مسودة — draft" banner). Final
  PDPL/ToS text arrives from the Business Track and is swapped in
  without code changes (the screens render from i18n keys).
- **The `/privacy` placeholder MUST include an analytics-disclosure
  section** (Strategy note): names PostHog; explains anonymous visitor
  IDs; states the purpose (product improvement, funnel measurement);
  states no message contents or phone numbers are collected as
  analytics; mentions Sentry error reports. Written in plain Arabic +
  English placeholder form now, refined by the Business Track later.
- Linked from: sign-in screen footer, the become-host application
  footer, and the listing-detail footer.

### Consent checkbox — recommended placement (D1 for review)
- **Recommended: on `(auth)/set-password.tsx`, signup mode only.** Both
  funnels pass through it exactly once (owner → `/name`, host →
  `/become-host/application`), and returning users never see it (reset
  mode skips it). Checkbox label: "أوافق على الشروط وسياسة الخصوصية"
  with tappable links to `/terms` + `/privacy`; the submit Button stays
  disabled until checked.
- On submit, alongside the password set, write
  `profiles.tos_accepted_at = now()` (the profile row already exists
  via the auth trigger).
- **Alternative considered:** checkbox on the sign-in email step —
  rejected: that screen also serves returning sign-ins and password
  resets, so the checkbox would nag existing users (and consent before
  OTP proves little — the account doesn't exist yet).
- **Existing-user backfill question (D2):** current users (test
  accounts) have `tos_accepted_at = NULL`. Recommend: leave NULL (they
  pre-date the terms); the profile screen can later show a one-time
  consent prompt when the real PDPL text lands. No blocking UI now.

### Migration 0048 (tiny)
```
alter table public.profiles
  add column tos_accepted_at timestamptz;   -- NULL = never consented
```
- **Writable by self via the existing profiles self-UPDATE policy** — no
  new RLS. A guard trigger is NOT proposed: unlike read_at, a user
  rewriting their own consent stamp only weakens their own position,
  and profiles has no column-guard trigger precedent to extend. Flag
  for Strategy: if PDPL evidence should be tamper-proof, we add a
  forward-only trigger like 0044's (cheap; decide in review) (D3).
- `src/types/database.ts` updated in the same commit.
- Verification queries: column present + a signup smoke writes it.

## 5. Build order (one batch, per-piece commits)

1. `payments-policy.ts` constants refactor (pure, tests pin behavior).
2. Cancellation card on request screen + line on listing detail + i18n.
3. OG meta + brand card asset in `+html.tsx`.
4. Migration 0048 (written) + `database.ts` types.
5. `/terms` + `/privacy` screens (placeholder i18n incl. analytics
   disclosure) + footer links.
6. Consent checkbox on set-password (signup mode) + `tos_accepted_at`
   write.
7. Decision-log append + push.

## 6. ⛔ Omar checkpoint

- Review + apply 0048 (`begin;/commit;`), run verifications, log apply.
- Smoke both signup funnels: consent checkbox blocks until ticked;
  after signup `select tos_accepted_at from profiles where id = '<new
  user>'` is non-null.
- Share a listing link to yourself on WhatsApp → brand unfurl card
  appears (site-wide card, not per-listing — expected).
- Eyeball `/terms` + `/privacy` in both locales (draft banners visible).

## 7. Open decisions for review (consolidated)

- **D1** — consent checkbox on set-password (signup-only)? *(rec: yes)*
- **D2** — existing users stay `tos_accepted_at = NULL` until the real
  text lands? *(rec: yes, no blocking UI now)*
- **D3** — forward-only guard trigger on `tos_accepted_at` for
  tamper-proof PDPL evidence? *(rec: yes — 6 lines, mirrors 0044's
  pattern, cheap insurance)*

## 8. Non-goals (Phase 3)

Per-listing dynamic OG (post-pilot Vercel follow-up), real PDPL/ToS
copy (Business Track), per-sitter cancellation tiers (policy is locked
platform-wide), cookie-consent banners (no third-party ad cookies in
the app), consent re-prompt flows for existing users.
