# Overnight batch — execution plan + checklist

Last next-migration number used: 0038 (is_admin SECURITY DEFINER).
Next available: **0039**. The brief says 0031 but that's stale; using 0039.

Arabic register: **masculine** (per the founder's most recent
direction in the previous batch's i18n sweep). The brief mentions
feminine but masculine is the live decision.

## AUTH milestone

- [ ] AUTH-1: sign-in screen relabel ("Sign in or Sign up"),
      subtitle hint, "Continue as guest" link
- [ ] AUTH-2: password set step after OTP verification (new users
      only; detected by checking the profile row)
- [ ] AUTH-3: sign-in screen dual path (OTP vs password) + Sign in
      with password
- [ ] AUTH-4: Forgot password — OTP-based reset back into the
      password set step
- [ ] AUTH-5: Google OAuth scaffold (env-flagged off by default)
- [x] AUTH-6: chip overflow — already shipped in 9ea7e98 (verify
      and note in batch-decisions)

## HOST DETAIL milestone

- [ ] HD-1: owner identity (name, avatar, rating, completed-as-
      owner count) on the host's booking detail
- [ ] HD-2: pet details (name, breed, age, photo, vaccination
      indicators, care notes) on the host's booking detail. Care
      notes UNGATED — show pre-accept (decision change vs current).
- [ ] HD-3: visual section grouping + polish to match owner-side
      detail patterns

## STRETCH

- [ ] S1: admin approval — soft warn when listing has <3 photos
- [ ] S2: host identity (mirror of HD-1) on the OWNER's booking
      detail — host's rating + completed-stays count
- [ ] S3: "New here?" hint on sign-in — folded into AUTH-1

## Execution rules

- After each piece: `npx tsc --noEmit`, commit, log decisions to
  `docs/batch-decisions.md`.
- If a piece turns out heavy, skip and log why; move to the next.
- `npm run ci` at the end before the final push.

## Out of scope

Real payments, push notifications, phone OTP, Google OAuth
activation (credentials), applying migrations.
