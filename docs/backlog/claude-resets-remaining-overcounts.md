# Claude "Resets remaining" counts unusable grants

- found: 2026-10-08, plan: quota-reset-expiry-ledger, phase: planning
- severity: minor
- area: src/features/quota/providers/claude/ClaudeResetGrants.tsx

`useClaudeResetGrants` returns `count` as the sum of `resetsLeft` over all grants
(`src/features/quota/providers/claude/ClaudeResetGrants.tsx:115`). That sum includes expired,
paused, and not-yet-started grants, so the number shown can exceed the resets that can
actually be spent. The spend selector (`selectResetGrant.ts`) applies stricter rules.

Suggested direction: count only grants with `resetsLeft > 0`, `endsAt` in the future, and a
started `startsAt`. Mark paused grants separately. Keep the source-text guard
`quotaClasses.codexPlanValue}>{claudeReset.count` in `tests/claudeResetGrants.test.ts` valid.
