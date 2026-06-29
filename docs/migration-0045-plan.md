# Migration 0045 plan — role-aware listing visibility + editability

> **PLAN DOC ONLY — no SQL written.** Strategy reviews this plan
> before any migration file lands. Founder cleared the round 11
> diagnosis (Option A: visibility AND editability follow current
> role; data preserved; fully reversible on re-promotion).

## What this fixes (the diagnosed edge case)

When an admin demotes a user from `role='host'` → `role='owner'`
via `/admin/users/[id]`, today's RLS does not consult `host.role`:

- **Visibility** — `listings_select_active_verified_or_own` (0024)
  checks the listing host's `is_verified` + `is_suspended` but NOT
  their `role`. The demoted user's listings stay publicly
  browsable.
- **The owner feed RPC** — `available_listings` (0036) has the
  SAME shape and the SAME gap. **This is the one that actually
  gates the feed.** Without changing the RPC, any RLS-only fix is
  cosmetic — the feed still surfaces demoted-host listings.
- **Editability** — `listings_update_host` (0004) gates only on
  `host_id = auth.uid()` + `is_active_user()`, so the former host
  can still mutate their old listings via direct supabase-js
  calls. App gate at [`src/app/listings/[id]/edit.tsx:170`](../src/app/listings/[id]/edit.tsx#L170)
  is `data.hostId !== user.id` — no role check; renders the form
  for a now-owner who'll then fail at RLS only if we also tighten
  the policy.

## Locked semantics (founder pre-cleared)

- **Pure reversible role flip.** Admin demotion = `update profiles
  set role='owner' where id=$x`. NOTHING ELSE mutates — not
  `is_verified`, not `host_application_status`, not
  `host_profile_complete`. Re-promotion = a single
  `set role='host'` and the user is back at the exact state they
  left, no re-vetting required.
- **Data preserved.** Listings stay in `public.listings` as-is.
  `status='approved'` stays. Photos, drafts, blocked dates stay.
  The user's CURRENT role flips visibility + editability; the
  underlying data is untouched.
- **Symmetric.** Listing-host's current role gates public
  visibility. Caller's current role gates editability. Same rule
  on both sides; the SUBJECT (the listing's host vs the caller)
  is the only difference.

## Sweep plan — every policy + RPC touched in 0045

### (a) `listings` SELECT — `listings_select_active_verified_or_own` (0024)

Current predicate
[`supabase/migrations/0024_drop_is_active.sql:33-49`](../supabase/migrations/0024_drop_is_active.sql#L33):

```sql
using (
  public.is_admin()
  or host_id = (select auth.uid())
  or (
    status = 'approved'
    and exists (
      select 1 from public.profiles host
      where host.id = listings.host_id
        and host.is_verified = true
        and host.is_suspended = false
    )
  )
);
```

**0045 change:** add `host.role = 'host'` to the EXISTS body —
mirrors the structural shape of the existing `is_verified` +
`is_suspended` clauses. Admin bypass + own-listing bypass stay
unchanged (a demoted host still sees their own listings; admin
still sees everything).

### (b) ⭐ `available_listings` RPC (0036) — THE FEED GATE

Current predicate
[`supabase/migrations/0036_available_listings_rls_parity.sql:62-68`](../supabase/migrations/0036_available_listings_rls_parity.sql#L62):

```sql
and exists (
  select 1
  from public.profiles host
  where host.id = l.host_id
    and host.is_verified = true
    and host.is_suspended = false
)
```

**0045 change:** add `host.role = 'host'` here too, in the SAME
migration as (a). Without this the RLS change is cosmetic —
`available_listings` runs as SECURITY DEFINER so it bypasses RLS
on `listings`, meaning the feed pulls everything the RPC
predicate matches regardless of what we do to
`listings_select_active_verified_or_own`.

The 0036 verification block (lines 130-136) has a
`pg_get_functiondef ilike '%is_verified%'` parity check; 0045
adds a mirrored `pg_get_functiondef ilike '%role = ''host''%'`
check so the RPC's role-gating is verifiable the same way.

### (c) Editability sweep — every host-scoped mutation policy

Every policy where a host writes/modifies their own
listing-adjacent rows needs to gate on the **caller's current
role** being `host`. Enumerated:

| Table | Policy | Defined in | Cmd |
|---|---|---|---|
| `listings` | `listings_update_host` | `0004_admin_role.sql:166-176` | UPDATE |
| `listing_drafts` | `listing_drafts_select_host_or_admin` | `0022_listing_drafts.sql:106` | SELECT — see §c-note |
| `listing_drafts` | `listing_drafts_insert_host` | `0022_listing_drafts.sql:118` | INSERT |
| `listing_drafts` | `listing_drafts_update_host` | `0022_listing_drafts.sql:133` | UPDATE |
| `listing_drafts` | `listing_drafts_delete_host` | `0022_listing_drafts.sql:159` | DELETE |
| `listing_photos` | `listing_photos_insert_host` | `0004_admin_role.sql:214` (re-created from 0002:150) | INSERT |
| `listing_photos` | `listing_photos_update_host` | `0002_rls_policies.sql:161` | UPDATE |
| `listing_photos` | `listing_photos_delete_host` | `0002_rls_policies.sql:172` | DELETE |
| `listing_photo_drafts` | `listing_photo_drafts_select_host_or_admin` | `0022_listing_drafts.sql:176` | SELECT — see §c-note |
| `listing_photo_drafts` | `listing_photo_drafts_insert_host` | `0022_listing_drafts.sql:188` | INSERT |
| `listing_photo_drafts` | `listing_photo_drafts_update_host` | `0022_listing_drafts.sql:203` | UPDATE |
| `listing_photo_drafts` | `listing_photo_drafts_delete_host` | `0022_listing_drafts.sql:229` | DELETE |
| `listing_blocked_dates` | `listing_blocked_dates_insert_host` | `0027_availability_and_capacity.sql:49` | INSERT |
| `listing_blocked_dates` | `listing_blocked_dates_update_host` | `0027_availability_and_capacity.sql:64` | UPDATE |
| `listing_blocked_dates` | `listing_blocked_dates_delete_host` | `0027_availability_and_capacity.sql:90` | DELETE |
| `listing_blocked_dates` | `listing_blocked_dates_select_public` | `0029_round2_behavior.sql:73` | SELECT — public-readable, no change |

**§c-note (the two `_select_host_or_admin` policies):** these gate
the host's ability to read their OWN drafts in the editor. If we
also gate these on caller role, a demoted user loses access to
read back the drafts that they can no longer publish anyway —
which is arguably correct (consistent: can't edit, can't read the
draft of an unpublishable edit). Strategy decides. My
recommendation: yes, gate these too — the draft-read path feeds
the edit form, so dropping access here is consistent with the
edit-block.

**Storage policies on the `listing-photos` bucket**
(`0003_storage_buckets.sql:54-83`) — these gate the bucket
itself, not the `listing_photos` row. They allow uploads/deletes
by anyone authenticated under their own user folder. We can
either:

- Leave them alone — a former host who tries to upload a new
  photo would succeed at the storage layer but fail when the app
  tries to INSERT the `listing_photos` row (RLS blocked above).
  Awkward but contained.
- Also gate on role — but storage RLS can't easily call
  `is_host()` against `auth.uid()`'s profiles row. Possible via a
  policy with a subquery; needs care.

**Recommend leave alone for 0045.** Storage orphaning is a known
admin-cleanup concern (cleanupOrphanListingPhotos exists). Adding
storage-layer role gating is a separate, larger surface.

### (d) `listings` INSERT — confirmed NO CHANGE NEEDED

`listings_insert_host` from `0039_host_application_schema.sql:117-134`
already requires `p.role = 'host'`:

```sql
with check (
  public.is_admin()
  or (
    host_id = (select auth.uid())
    and public.is_active_user()
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'host'
        and p.host_application_status = 'approved'
        and p.host_profile_complete = true
    )
  )
);
```

A demoted user already can't create new listings. 0045 doesn't
touch this. ✓

### (e) Suggested cleaner mechanic — `public.is_host()` helper

Mirrors `is_admin()` + `is_active_user()` from
[`supabase/migrations/0038_is_admin_security_definer.sql`](../supabase/migrations/0038_is_admin_security_definer.sql).
The SECURITY DEFINER + pinned `search_path = public` pattern is
the same; same one-line predicate `(select role from profiles
where id = auth.uid()) = 'host'`.

**Why a helper for the editability path (§c) but inline for the
visibility path (§a/§b):**

The two checks have DIFFERENT subjects:

- §c — *caller's* current role. Pattern: `is_host()` (helper —
  reads `auth.uid()`'s profile row).
- §a/§b — *the listing's host's* current role. Pattern: inline
  `host.role = 'host'` (the existing EXISTS already joins
  `profiles host on host.id = listings.host_id`; we add one
  clause). Helper wouldn't fit — `is_host()` is about the caller,
  not an arbitrary user id.

So:

- §a: inline `and host.role = 'host'` in the existing EXISTS.
- §b: same inline change in the available_listings RPC body.
- §c: every host-scoped mutation policy adds an `and is_host()`
  clause alongside the existing `host_id = auth.uid()` + 
  `is_active_user()` checks. Compact + readable; one new helper
  function used across ~12 policies.

### (f) Demotion semantics — pure reversible role flip

Confirmed by the founder. The admin role-picker
([`src/app/admin/users/[id].tsx`](../src/app/admin/users/[id].tsx))
already does ONLY `set role=$new` — it doesn't touch
`is_verified` / `host_application_status` / `host_profile_complete`.
0045 doesn't change this. The reversibility property:

- Demote: admin flips `role='owner'`. Listings disappear from the
  public feed (§a/§b), can't be edited (§c). Data intact.
- Re-promote: admin flips `role='host'`. Listings reappear in the
  public feed instantly, edit access restored. No re-vetting,
  no re-application, no re-profile-completion. `is_verified` and
  `host_application_status` were never touched.

Important: this means an admin can demote and re-promote freely
without losing the host's setup. The role flip is the lever; the
host's verified-and-vetted state survives independently.

### (g) App-layer note — `listings/[id]/edit.tsx` UX gate (follow-up)

[`src/app/listings/[id]/edit.tsx:170`](../src/app/listings/[id]/edit.tsx#L170)
gates only on `data.hostId !== user.id`. Post-0045, a demoted
user (`role='owner'`) who hits the edit URL will see the full edit
form render, then their save will fail at the RLS layer with a
SQLSTATE error.

**Functionally safe — RLS is the lock — but de-confusing UX
matters.** App follow-up (not part of 0045): add `profile?.role
!== 'host'` to the gate so a demoted user sees the same
not-available panel that non-owners see. Same panel = no
information leak about whether the listing exists.

Same UX consideration applies to:
- `src/app/listings/[id]/photos.tsx` — host-only photo manager
- `src/app/listings/[id]/availability.tsx` — host-only blocked
  ranges
- `src/app/listings/new.tsx` — already gated on multiple
  conditions per 0039 routing (would just need
  `role !== 'host'` → redirect path)

Tag these as a single app follow-up PR after 0045 ships. The RLS
is the real guarantee; the app gates are confusion-reducers.

## Verification queries

Strategy decides whether to include these in the migration's
trailing comment block. Suggested:

```sql
-- 1. listings_select_active_verified_or_own now mentions role.
select pg_get_expr(qual, polrelid) ilike '%host.role = ''host''%'
  from pg_policies
 where schemaname = 'public'
   and tablename = 'listings'
   and policyname = 'listings_select_active_verified_or_own';
-- expect: t (true).

-- 2. available_listings RPC body now mentions role gating.
select pg_get_functiondef(p.oid) ilike '%host.role = ''host''%'
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'available_listings';
-- expect: t (true).

-- 3. is_host() helper exists, SECURITY DEFINER, pinned search_path.
select prosecdef, proconfig
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'is_host';
-- expect: 1 row. prosecdef = t. proconfig contains 'search_path=public'.

-- 4. Behavioral spot-check (manual on a non-prod listing):
--    a) Admin: select a host's user_id (h_id) with at least one
--       approved listing.
--    b) Note the listing visible to anon via available_listings.
--    c) update profiles set role='owner' where id = h_id;
--    d) Re-run available_listings; the listing disappears.
--    e) update profiles set role='host' where id = h_id;
--    f) Re-run available_listings; the listing reappears.
--    g) No is_verified / host_application_status mutations during
--       the test.
```

## What's NOT in 0045

- App-layer edit-gate tightening (§g) — separate PR.
- Storage RLS role-gating — out of scope; orphan-cleanup is the
  existing pattern.
- Auto-pause on demotion — Option B from the round 11 review,
  explicitly rejected in favor of role-aware RLS.
- Block-demote-when-listings-exist — Option D, explicitly
  rejected (preserves admin freedom).
- Any change to `is_verified` / `host_application_status`
  semantics — pure role flip per (f).

## Risks Strategy should weigh

1. **The `is_host()` helper signature.** Mirrors `is_admin()`.
   No callsites outside the new 0045 policies — single-purpose,
   tight. Worth confirming no existing function or column name
   collision with `is_host` in case some future code wants the
   name.

2. **Performance.** Adding `host.role = 'host'` to the existing
   EXISTS on `profiles` is one more column read on an already-
   running probe. The (id) primary-key access already returned
   the row; predicate evaluation cost is negligible. No new
   index needed (role is in the same row as is_verified +
   is_suspended which the predicate already touches).

3. **Behavioral side-effect of §c-note** (gating draft-SELECT on
   caller role). A demoted host loses read access to their own
   draft of a published listing they can no longer publish. If
   admin re-promotes, the draft access returns. Confirm this is
   acceptable to the founder (or skip §c-note's recommendation
   and leave draft-SELECT unchanged — Strategy's call).

4. **0036 RPC has `SECURITY DEFINER`**, so its predicate change
   takes effect immediately on apply without needing to re-grant
   anything. Same `revoke / grant` block as 0036 would be
   re-stated for parity.

5. **No data migration.** All existing rows stay as-is. The
   change is purely about predicate evaluation at read/write
   time.

## Done-ness criteria for the eventual migration

After 0045 lands and is applied:

- The verification queries above all return `true` / 1 row.
- Behavioral spot-check (a)-(g) demonstrates instant
  reversibility.
- No app-side changes deploy alongside the migration (deferred
  to the §g follow-up PR).
- `docs/migration-apply-log.md` gains a row with the verification
  evidence.

---

Strategy: review this plan, decide on the open question in
§c-note + risk (3) (draft-SELECT gating), then I write the SQL
in a separate round.
