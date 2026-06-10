# Batch decisions log

One line per decision made autonomously during the batch run.

- **2026-06-10** — Started batch. Resuming from clean tree after 8h.5.
- **0c sweep** — admin host-gender chips: bug was both EN `host_female`/`host_male` set to "Sitter". Fixed to "Female sitter" / "Male sitter" (mirrors AR pattern, no separate admin-only key needed).
- **0c sweep** — zero-count admin dashboard cards become inert (disabled + faded) rather than navigating into an empty list.
- **0c sweep — 8e last-photo edge case** — chose "block the delete with a friendly message" over the count-tracking column approach. Simpler, no migration, prevents the re-snapshot bug.
- **Milestone A — pet vaccination dates** — free-text `yyyy-mm-dd` input instead of native date picker for MVP. Real picker is polish; not blocking.
- **Milestone A — vaccination check** — SOFT warn before submitting booking (per spec), NOT a hard block. Host can decline on their side.
- **Milestone A — care_notes visibility** — shown to host only when `booking.status IN ('accepted','active','completed')`. Pre-accept the host shouldn't see private care notes; they only need them once committed. (Owner already knows their own pet's notes — only host gets the display.)
- **Milestone A — vaccination_doc_url** — column was already in 0001's pets schema; not adding upload UI in this batch (would need pet-photo bucket pattern replication). Deferred to a polish pass after the data model proves out.
