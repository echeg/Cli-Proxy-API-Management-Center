# Codex reset-credit expiry is treated as a recovery instant

- found: 2026-10-08, plan: quota-reset-expiry-ledger, phase: planning
- severity: minor
- area: src/features/quota/resetSchedule.ts

`collectQuotaRowInstants` documents that "only genuine capacity-return events are collected"
(`src/features/quota/resetSchedule.ts:77-85`). It still adds available Codex reset-credit
expiries as `kind: 'credit'` instants (`resetSchedule.ts:96-109`). A credit expiring is
lost capacity, not regained capacity. Yet `nextRecoveryMs` (`resetSchedule.ts:214-225`) uses
it as a key for the "soonest recovery" sort, and `pickUrgentRowId` can highlight it as if
it were a reset.

Suggested direction: exclude credit expiries from recovery ranking, or rename/split the
instant kinds so that sorting and urgency only use window resets. Check the existing sort tests
before changing the order.
