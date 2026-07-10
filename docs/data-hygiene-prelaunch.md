# Pre-launch data hygiene checklist

This doc enumerates known data inconsistencies in the production database
that accumulated during development + testing. They don't break anything
today, but they should be cleaned up before the founding-host program
hits real users.

Every section below includes the SQL needed to clean it up — **commented
out** so this file is safe to commit. Run them manually in the Supabase
SQL Editor when prepping for launch, after reviewing each.

**Apply order:** review → run each block individually → re-run the
"verify" query afterwards to confirm zero rows remain.

## ⛔ EXCLUDE list — never delete these rows

The dedicated **E2E CI accounts** (S10 golden-path test, Wave 1a) and
everything they own are exercised by GitHub Actions on every push and
MUST survive every purge below. Before running ANY cleanup block, add a
`WHERE` exclusion for these two users (by email in `auth.users`, or by
their profile ids once created):

- `e2e-owner@petbnb.local` — signs in via password in CI; owns the seed
  pet "E2E Cat" and accumulates inquiry messages + booking requests
  (one per CI run — trim the *bookings* periodically if noisy, but never
  the accounts, the pet, or the inquiry thread).
- `e2e-host@petbnb.local` — owns the approved seed listing
  "E2E Test Listing" (must stay approved + verified, with NO blocked
  dates, or the golden path goes red).

---

## 1. Listings with mismatched city / neighborhood

During Round 2 + Round 3 smoke testing, several listings had their
`city` toggled to `'riyadh'` for testing while keeping their original
neighborhood from the `'dammam'` seed (`al_shati`, etc). The card displays
"al_shati, الرياض" — visibly weird, doesn't break, but signals
test-data-in-prod to early users.

### Detect

```sql
-- Riyadh-listed but with a non-Riyadh neighborhood
select id, title_ar, city, neighborhood
from public.listings
where city = 'riyadh'
  and neighborhood not in (
    'malqa', 'العليا', 'النخيل', 'الياسمين', 'الورود',
    'حطين', 'الملقا', 'الياسمين', 'النخيل'
  );
```

### Fix options

```sql
-- Option A: re-tag the city to match the neighborhood (preserves the
-- listing's original location identity). Update on a per-listing basis.
-- update public.listings set city = 'dammam' where id = '...';

-- Option B: update neighborhood to a plausible Riyadh value if you
-- want to keep the listing visible in Riyadh.
-- update public.listings set neighborhood = 'malqa' where id = '...';
```

---

## 2. Pre-0009 legacy bookings with NULL additional_pet_discount

Bookings created before migration 0009 (5.6D, per-pet pricing) have
`additional_pet_discount IS NULL`. The display layer detects this and
falls back to the stored `total_sar`; the edit screen shows a "some
details may not transfer" warning. They work, but every edit / refund
calculation is one branch heavier because of them.

### Detect

```sql
select count(*) as legacy_bookings
from public.bookings
where additional_pet_discount is null;
```

### Decision

Don't backfill — these snapshots are immutable records of what the
booking actually was at the time. The legacy branch in the display
code is the right pattern. **Just verify the count is small enough to
ignore.** If there's > 0 ever, consider canceling them via the admin
queue + having affected hosts re-issue.

---

## 3. Pre-R1C1 booking fee snapshots with decimal SAR

Bookings accepted before Round 1 C1 (whole-SAR rounding) have decimal
fee snapshots — `owner_fee_sar = 37.5`, etc. The current code rounds
on display but the underlying numbers stay decimal.

### Detect

```sql
select count(*) as legacy_decimal_fees
from public.bookings
where owner_fee_sar is not null
  and (
    owner_fee_sar  != round(owner_fee_sar) or
    host_fee_sar   != round(host_fee_sar) or
    total_charged_sar != round(total_charged_sar) or
    payout_sar     != round(payout_sar)
  );
```

### Fix

```sql
-- Round to whole SAR. The math used to compute these was the
-- pre-R1C1 round2() — re-applying the new Math.round equivalent
-- (round() in SQL) matches what new bookings get.
-- update public.bookings
-- set owner_fee_sar     = round(owner_fee_sar),
--     host_fee_sar      = round(host_fee_sar),
--     total_charged_sar = round(total_charged_sar),
--     payout_sar        = round(payout_sar)
-- where owner_fee_sar is not null
--   and (
--     owner_fee_sar != round(owner_fee_sar) or
--     host_fee_sar  != round(host_fee_sar) or
--     total_charged_sar != round(total_charged_sar) or
--     payout_sar    != round(payout_sar)
--   );
```

**Don't run this if real money has already moved through any of these
bookings** — the totals are evidence of what each party actually paid.

---

## 4. Legacy self-bookings (pre-R2C1)

Round 2 C1 added the RLS clause blocking `owner_id = listing.host_id`.
Self-bookings created before that still exist in the data. They
collapse the role-symmetric review clause to a tautology and would
distort host rating averages if reviews were posted on them.

### Detect

```sql
select b.id, b.status, l.host_id, b.owner_id
from public.bookings b
join public.listings l on l.id = b.listing_id
where b.owner_id = l.host_id;
```

### Decision

Don't auto-delete (bookings are an audit trail). Recommended action
per-row:

```sql
-- Hard-flag with the dispute status so any reviews/cancellations on
-- it are clearly out-of-band. Admin can later cancel formally.
-- update public.bookings set status = 'disputed' where id = '...';
```

Or just leave them as historical — the new RLS prevents new ones from
landing, the role-symmetric review policy prevents fake reviews on
the old ones, and the host rating aggregation in `get_host_ratings`
(0032) operates per ratee_id without weight differences.

---

## 5. Pet photos still stored as 7-day signed URLs (pre-Round-6)

Round 6 moved `pets.photo_url` from "stored signed URL" → "stored
storage path, sign on render". Legacy rows still hold the
`https://...` form; they keep working until their 7-day URL expires,
at which point the host re-uploads.

### Detect

```sql
select count(*) as legacy_signed_urls
from public.pets
where photo_url is not null
  and photo_url like 'https://%';
```

### Optional fix

If you want to migrate the storage-path form proactively (so the
legacy branch in `signPetPhotoUrl` / `signPetPhotoUrls` can be
deleted post-cleanup), parse the path out of the URL:

```sql
-- The signed URL shape from Supabase Storage is:
--   https://<project>.supabase.co/storage/v1/object/sign/pet-photos/<path>?token=...
-- Extract the <path> segment.
--
-- update public.pets
-- set photo_url = substring(
--   photo_url
--   from '/storage/v1/object/sign/pet-photos/(.+?)\?'
-- )
-- where photo_url like 'https://%/storage/v1/object/sign/pet-photos/%';
```

After this runs, the legacy `startsWith('https://')` branch in
`signPetPhotoUrl` and `signPetPhotoUrls` can be removed.

---

## 6. Orphan storage objects in private buckets

`pet-photos`, `condition-report-photos`, `daily-update-media` buckets
may have orphan objects from cancelled uploads (the upload succeeded
but the row insert failed) or deleted parents that cascaded the DB row
but didn't remove the storage object. These don't cost much but they
accumulate.

### Detect

No SQL view — requires a script that lists bucket objects via the
Supabase admin API and joins against the table that should reference
them. Defer until post-launch when there's a real volume to consider.

---

## 7. Auth users with no profile row

Possible if the auth trigger that auto-creates the profile failed
silently. Should be near-zero.

### Detect

```sql
select au.id, au.email
from auth.users au
left join public.profiles p on p.id = au.id
where p.id is null;
```

### Fix

```sql
-- Per row: manually insert the profile with the default 'owner' role
-- and an empty name (forces the user through /role on next sign-in).
-- insert into public.profiles (id, full_name, role)
-- values ('<auth user id>', '', 'owner');
```

---

## Final pre-launch verification

After running the above, re-run the four DB smoke tests from Round 2:

1. Self-booking RLS rejection (post-R2C1)
2. Anon SELECT on listing_blocked_dates (R2C3 + 0029 Part B)
3. Valid review INSERT happy path (R2C6 + 0029 Part C + 0030)
4. Self-rating REJECTED (0030 role-symmetric clause)

Then run `npm run ci` locally and confirm GitHub Actions is green at
HEAD before flipping the founding-host program live.
