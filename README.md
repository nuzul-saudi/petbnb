# Petbnb

A Saudi Arabia-first, Arabic-language, RTL marketplace connecting pet owners
with verified hosts who board pets in their own homes.

## Status

Pre-launch MVP. Steps 1–8 complete. See `CLAUDE.md` for the full spec and
`ONBOARDING.md` for the developer onboarding doc.

## Stack

Expo (React Native) · TypeScript strict · Supabase · Vitest · GitHub Actions CI

## Development

    node -v          # Must be v20.x or v22.x — Node 24 breaks Metro
    npm ci
    npx expo start --clear

## CI

    npm run ci       # i18n parity → tsc → vitest

### E2E in CI (S10 golden path)

GitHub Actions runs a Playwright golden-path E2E (`e2e/golden-path.spec.ts`)
against the exported web build + the real Supabase backend: guest → browse →
open listing → password sign-in → send inquiry → submit booking request.
**Actions-only** — it is deliberately NOT part of local `npm run ci`. The job
**skips with a green notice** until the secrets below exist.

Required **GitHub Actions secrets** (Settings → Secrets and variables →
Actions):

| Secret | Value |
|---|---|
| `SUPABASE_URL` | the Supabase project URL (same value the Vercel build uses) |
| `SUPABASE_PUBLISHABLE_KEY` | the `sb_publishable_…` key |
| `E2E_OWNER_PASSWORD` | password of `e2e-owner@petbnb.local` |
| `E2E_HOST_PASSWORD` | password of `e2e-host@petbnb.local` (reserved for later host-side specs) |

Required **seed data** (one-time, via the app):

1. Account `e2e-owner@petbnb.local` (owner) — set a password via the normal
   set-password flow; add one **vaccinated** pet named exactly `E2E Cat`.
2. Account `e2e-host@petbnb.local` (host) — approved + verified, with one
   **approved** listing titled exactly `E2E Test Listing` and **no blocked
   dates**.
3. Both accounts are on the purge EXCLUDE list in
   `docs/data-hygiene-prelaunch.md` — never delete them. Booking requests
   accumulate one per CI run on the E2E accounts; trim those bookings
   periodically if noisy.

Analytics stay clean by construction: the E2E export env omits
`POSTHOG_KEY`/`SENTRY_DSN`, so both SDKs no-op and are never imported.
Flake policy: 1 retry; Playwright traces are uploaded as a `playwright-traces`
artifact on failure.

## License

Proprietary. All rights reserved.

<!-- Deploy trigger: 2026-07-08 — force a fresh Vercel build from source so
the SENTRY_DSN / POSTHOG_KEY / POSTHOG_HOST env vars bake into the bundle
(a prior "Redeploy" promoted a cached artifact without them). No-op. -->

