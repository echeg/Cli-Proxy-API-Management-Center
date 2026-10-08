# Timeline hides reset-credit expiries outside the visible span

- found: 2026-10-08, plan: quota-reset-expiry-ledger, phase: planning
- severity: minor
- area: src/features/quota/quotaTimelineModel.ts

The Timeline draws Codex reset-credit expiry ticks only when the expiry falls inside the
visible two-week span (`projectResetCredits`, `src/features/quota/quotaTimelineModel.ts:191-211`).
Credits are also extracted only after a window anchor is chosen
(`quotaTimelineModel.ts:382-401`), and only for Codex. Credits are granted for 30 days,
so most expiries sit past the 14-day weekly span (for example, span 10/04-10/18
vs expiries 10/22 and 10/29). The Timeline then shows no reset information at all.

Suggested direction: add an off-span edge indicator or a lane-head summary
("2 resets, next expires 10/22"). Consider mapping Claude grants into `lane.resetCredits` too.
