# Codex reset-credit list keeps already-expired credits

- found: 2026-10-08, plan: quota-reset-expiry-ledger, phase: planning
- severity: minor
- area: src/utils/quota/resetCredits.ts

`normalizeCredit` (`src/utils/quota/resetCredits.ts:42-61`) keeps any credit with
`status === 'available'` and a non-empty `expires_at`, even when `expires_at` is in the past.
`CodexQuotaBody` (`src/features/quota/providers/codex/CodexQuotaBody.tsx:128-166`) then renders
it with a past countdown, and the count still includes it. The Timeline filters
`expiresAtMs > now` (`quotaTimelineModel.ts:200-206`), so the views disagree.

Suggested direction: filter credits whose expiry has passed at render time, using the
current `now`, and keep the normalizer free of time-dependent logic.
