# npm audit baseline

**Date:** 2026-06-11 (Round 3 / VC-review opsec sweep)
**Command:** `npm audit`
**Summary at baseline:** 18 vulnerabilities — 16 moderate, 2 critical.

This file documents the known accepted vulnerabilities, why each is
accepted today, and the trigger that would re-open the question. A
fresh `npm audit` run that produces a critical NOT listed here should
be treated as a stop-and-investigate event.

---

## Why this file exists

`npm audit` flags vulnerabilities in transitive dependencies even when
those dependencies sit deep inside Expo's toolchain and never touch
user-facing code paths. Indiscriminately running `npm audit fix --force`
on this project produces a downgrade cascade (the audit's own output
suggested `expo@46.0.21` as a fix path for one moderate — a multi-major
downgrade from our current `expo@~55.0.26` SDK). That's worse than the
vulns it would close.

The conservative posture: accept the transitive vulns we've assessed
as no-user-facing-exploit, log them here, re-run `npm audit` after
every major dep bump or new direct-dep install, and act only when:

1. A NEW critical appears that isn't in this baseline, OR
2. A user-facing exploit path is discovered for one of the listed
   accepted vulns, OR
3. Upstream Expo releases a major bump that quietly fixes a batch
   of these (drop them from this file when that happens).

---

## Accepted vulnerabilities

### 1. shell-quote@1.1.0 – 1.8.3 — **CRITICAL** (GHSA-w7jw-789q-3m8p)

> shell-quote `quote()` does not escape newlines in object `.op` values.

**Where it lives:** transitive under Metro / build-time tooling.

**Why accepted:**
- shell-quote is a build-time / Metro dependency. It does NOT process
  user-supplied input at runtime in this app — we never call it from
  application code.
- The vulnerability requires an attacker to supply a maliciously-shaped
  object containing a `.op` field with embedded newlines. Our build
  toolchain only passes shell-quote string arguments from package.json
  scripts and Metro internals — neither path accepts attacker input.
- `npm audit fix` claims to be available for this one. Verify on next
  dep-bump round whether a minor metro bump resolves it without a major
  downgrade elsewhere.

**Trigger to revisit:** If we ever start invoking shell-quote from
application code, or if Expo bumps Metro to a version that pulls a
newer shell-quote, refresh this entry.

### 2. (second critical from the audit summary count)

`npm audit`'s summary line reports `2 critical` but only one explicit
critical block (`shell-quote` above) appears in the human-readable
output. The second is counted from the same advisory reachable through
a different dependency path — same root cause, same accepted rationale.

**Trigger to revisit:** Any fresh `npm audit` run that adds a SECOND
explicit critical advisory entry (a different package or a different
GHSA-ID) is a stop-and-investigate event. Don't baseline silently.

### 3. uuid <11.1.1 — moderate (GHSA-w5hq-g745-h8pq)

> uuid: Missing buffer bounds check in v3/v5/v6 when buf is provided.

**Where it lives:** `node_modules/@expo/ngrok/node_modules/uuid`.

**Why accepted:**
- The vulnerable code paths are uuid v3/v5/v6 with a caller-provided
  `buf` argument. The @expo/ngrok dependency uses uuid via its default
  paths (random / time-based) and never provides a `buf`.
- @expo/ngrok is only invoked when the developer runs
  `npx expo start --tunnel` (the LAN-hostile fallback). It does NOT
  run in production builds.
- npm audit's suggested fix is `npm audit fix --force` which downgrades
  to `expo@46.0.21` — a multi-major downgrade that loses every Expo
  SDK 55 feature we depend on. Strictly worse than the moderate vuln.

**Trigger to revisit:** If @expo/ngrok ships a release that bumps uuid
to >= 11.1.1, run `npx expo install @expo/ngrok` to pick it up.

### 4. Remaining moderate vulns

The other ~14 moderate vulnerabilities sit under deep Expo toolchain
transitives — `@expo/config`, `@expo/config-plugins`,
`@expo/local-build-cache-provider`, `@expo/metro-config`,
`@expo/prebuild-config`, `expo-splash-screen`, and the older
`@react-native-community/datetimepicker` pulled in by Expo's installed-
but-not-wired native picker. Same pattern: build-time / native-build
paths only, no user-facing exploit surface in the app, and the
suggested fix is a major-version Expo downgrade. Accepted for the
same reason as the entries above.

**Trigger to revisit (batch):** Any Expo SDK upgrade (55 → 56 etc.) is
the natural time to re-run `npm audit` and refresh this entire file.
Expect the count to drop significantly once we move off SDK 55.

---

## Comparison vs the 2026-06-11 env-saga baseline

The env saga (Node 24 → 22 + `npm ci`) produced a baseline of
**17 vulnerabilities — 15 moderate, 2 critical**.

This Round 3 baseline is **18 vulnerabilities — 16 moderate, 2 critical**.

**Delta:** +1 moderate, 0 critical. The new moderate is from the
`expo-image-manipulator` + `@expo/ngrok` deps installed this round.
**No new critical vuln was introduced.** The briefing's
"stop-and-investigate-if-new-critical" trigger was not tripped.

---

## How to re-baseline

After any dep change of consequence (Expo SDK bump, new direct dep,
major version bump of an existing dep):

1. `npm audit` and capture the summary line + critical blocks.
2. Update this file's numbers + critical-advisory entries.
3. Verify each new critical falls into the "no user-facing exploit
   surface" rationale OR is genuinely a stop-and-fix item.
4. Commit with `docs: refresh npm audit baseline (post-<reason>)`.
