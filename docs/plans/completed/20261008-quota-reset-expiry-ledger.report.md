# Report: Subscription resets in the Ledger: expiry list and inline use

Plan: `docs/plans/20261008-quota-reset-expiry-ledger.md` · Branch: `quota-reset-expiry-ledger` · Base: `main` · Mode: full · Executor: claude · Task model: claude:opus:high · Review model: claude:opus:high · Started: 2026-10-08T11:15:50Z · Finished: 2026-10-08T12:48:45Z

## Summary

The branch adds subscription resets and quota reserve to the Quota page's Ledger view. It is built on a sync with upstream.

- **Upstream sync (Task 1).** `upstream/main` was merged in with a merge commit (`3883cde`). This brought in:
  - the Vietnamese and Korean locales
  - `ClaudeResetGrantDetails`, which shows Claude grant expiry in Cards
  - Codex cooldown clearing after a reset
  - plugin logos, a GitHub token setting, the removal of `testModel`, and fixes to OAuth and multi-agent config paths

  The fork-only keys that were missing were added to `vi.json` and `ko.json`.
- **Data and model (Tasks 2–3).** Claude reset grants are now read into the shared quota store. The read runs as a third parallel request inside `fetchClaudeQuota`, and a failure doesn't break the quota fetch. `CLAUDE_USAGE_URL` stays query-free. Codex credits keep their `title`. A new React-free `resetInventory.ts` lists the resets soonest-expiry first and drops expired ones.
- **Actions (Tasks 4–5).** The Claude hook gains a modal-free `execute()` and `confirmMessage`. After a Claude claim answers `reset` or `already_used`, the proxy cooldown is cleared through `clearClaudeCooldownAfterClaim`, with a connection guard. Codex gets a modal-free `performReset` through `executeQuotaReset`. Cards keep their modal flows and existing source guards.
- **Ledger UI (Tasks 6–7).** Each row gets a resets chip, which turns amber when a reset expires within 3 days, and an expandable drawer. The drawer lists each reset with its expiry and has an inline two-step "Use a reset" confirmation. Focus and Esc are handled, and the layout works at ≤700px.
- **Quota reserve (Tasks 8–9).** Reserve fields from the backend are normalized on read. The Ledger shows a reserve badge and a tick on each window meter. The Auth Files details sheet gets a reserve editor for Codex and Claude credentials only, which writes `quota_reserve` through the existing PATCH request.
- **Docs (Task 11).** `README.md` and `README_CN.md` were updated. During internal review, `AGENTS.md` was changed to list all six locales.
- **External review fixes.** After the external review:
  - a Claude claim with an unknown outcome stays reachable
  - open drawers survive a Refresh All
  - the reserve status reloads after any refresh or reset, in both the Ledger and Cards views

Phase durations (through finalize, before report assessment and archival):

| phase | duration_ms | approx. |
|---|---:|---|
| tasks | 2214232 | 36m 54s |
| internal review | 2670709 | 44m 31s |
| evaluation | 392281 | 6m 32s |
| external review | 297523 | 4m 58s |
| other | 0 | 0s |
| **total** | **5574745** | **1h 32m 55s** |

Run counters:
- task iterations: 11, failed retries: 0
- internal review: 2 loop iterations, ended by `review_done`
- post-review: 2 iterations

## Change scope

- **Diff size:** 93 files changed, 10091 additions and 342 deletions (`main...HEAD`).
- **Commits:** 33. These include the upstream merge `3883cde` and the upstream commits it brought in (`f03160e`, `fc9b8e2`, `2ce627d`, `18ca877`, `ebb4289`, `673b8ee`, `bb32461`, `3a71fcf` and others).
- **Commits made on this branch:**
  - 10 feature commits, `9ebacf5` through `9ec0012`
  - 3 internal-review fix commits: `640acab`, `ebfb317`, `0a61de5`
  - 1 external-review fix commit: `8d57977`
- **New source modules:**
  - quota resets: `resetInventory.ts`, `resetActions.ts`, `hooks/quotaReset.ts`, `components/QuotaLedgerResets.tsx` and its `.module.scss`
  - Claude: `claude/claimCooldown.ts`, `claude/ClaudeResetGrantDetails.tsx` (upstream)
  - quota reserve: `authFiles/quotaReserve.ts`, `authFiles/components/AuthFileQuotaReserveField.tsx`
  - from upstream: `plugins/pluginLogo.ts`
- **Main modified areas:**
  - `QuotaPage.tsx`, `QuotaLedger.tsx` and its SCSS, `QuotaCard.tsx`
  - `useQuotaActions.ts`, `ClaudeResetGrants.tsx`, `claude/data.ts`, `codex/data.ts`
  - the API layer: `authFiles.ts`, `providers.ts`, `transformers.ts`
  - shared types: `quota`, `authFile`, `provider`, `visualConfig`, `common`
  - from upstream, config sections and the visual config: `SectionConnectivity`, `visualConfigServer`, `visualConfigAdditions`, `searchIndex`
  - provider forms and the workbench
- **Locales:** `en`, `ru`, `zh-CN` and `zh-TW` were modified. `vi.json` and `ko.json` are new compared with `main`.
- **Docs:** `AGENTS.md`, `README.md`, `README_CN.md`, the plan file, and a new backlog file, `docs/backlog/locale-gaps-plugin-resource-ru.md`.
- **Tests:** 32 test files changed, 16 of them new. The new ones include:
  - `resetInventory`, `quotaLedgerResets`, `quotaLedgerReserve`, `quotaReserve`, `quotaResetExecution`
  - `claudeClaimCooldown`, `claudeQuotaResetGrants`, `authFilesQuotaReserve`
  - locale and upstream suites

## Risk

**medium**

- **Public APIs.** No API is exposed, but the branch consumes backend contracts in new ways:
  - It reads `quota_reserve`, `quota_reserve_active` and `quota_reserve_until` from `GET /v8/management/credentials`.
  - It writes `quota_reserve` through `PATCH /v8/management/credentials/fields`.
  - A Claude claim now also calls `POST /v8/management/routing/cooldown/reset`.

  The reserve contract comes from a separate backend plan, CLIProxyAPI `20261008-quota-reserve`, and was not checked against a live backend. Without those fields the Ledger hides the reserve UI. The Auth Files editor still shows, and an older backend will reject a save with a 400 error.
- **Irreversible actions.** Spending a reset can't be undone. The new inline Ledger path reuses the existing Codex and Claude flows: the Claude claim journal, retry window and stale-generation guards. It was tested only with spies and SSR, never against a live reset (the plan forbids that).
- **Data schemas.** Client types gain only optional fields: `resetGrants`, `resetGrantsError`, credit `title`, and the `quotaReserve*` fields. Nothing changes in browser storage.
- **Configuration.** The upstream merge changes where some config is read and written:
  - migrated OAuth settings now point at `upstream.*`
  - `optimize-multi-agent-v2` is read and written at its canonical client path
  - there is a new GitHub token field

  These are upstream changes brought in by the merge, but they do affect how the config is saved.
- **Concurrency.** The new asynchronous paths all carry guards:
  - `reloadReserveVerdicts` drops a result if a newer read, a newer list load, a session switch or an unmount happened meanwhile
  - the cooldown clear checks the connection revision
  - `executeQuotaReset` checks the cache generation

  The change to show skeletons only on a session's first load (`initialLoading`) affects every view: Cards and Timeline now keep their content on screen during a refresh.
- **Migrations.** None.

## Migrations and operational steps

- Database, data and configuration migrations: none.
- Deployment (only if wanted, as in the plan's Post-Completion section):
  1. Run `bun run build`.
  2. Back up the hosted `management.html`.
  3. Copy `dist/index.html` over it.
- Quota reserve only works once the CLIProxyAPI `20261008-quota-reserve` backend is deployed. Until then, the Ledger reserve UI stays hidden and editor saves are rejected.

## Plan deviation

All 11 tasks are checked off. Nothing was blocked or skipped.

**Added (7 items):**
1. **Korean locale.** Upstream `f03160e` added `ko.json` and `tests/koreanLocale.test.ts` after the plan was written. The same 37 missing keys went into `ko.json`, and later "all five locales" steps mean six.
2. **Test order bug.** The merge exposed an order-dependent failure in `tests/authFileCooldowns.test.ts`: upstream suites switch the shared i18n instance to `en`, and the markup HTML-escapes the hint's apostrophe. The test now compares against the escaped text.
3. **⚠️ CSS-module classes under SSR.** Bun resolves SCSS module imports to a path string, so class names are `undefined` in SSR tests. The amber tone is therefore `data-tone="warn"` (styled with `.chip[data-tone='warn']`) instead of the planned modifier class, and the tests check the attribute.
4. **Drawer chip always closable.** An open drawer keeps its chip as a toggle while loading ("Loading…"), after a failed read, and when no resets are left ("No resets left"). Claude grants count `resetsLeft` toward the total.
5. **Action builders split out.** The pure builders (`codexResetAction`, `claudeResetAction`, `countResets`, `formatMonthDay`) live in `resetActions.ts`, so `QuotaLedgerResets.tsx` exports only components (a react-refresh lint rule). Window lists use the `quota_management.resets.windows_and` key because the ES2020 TypeScript lib has no `Intl.ListFormat`. The Claude hook exposes `selectedGrant` so the confirmation names the grant it spends.
6. **Reserve normalization moved.** It lives in `normalizeAuthFileEntry` (`authFiles.ts`), not in `transformers.ts` as planned. Other details:
   - a missing `mode` defaults to `soft`, and a verdict without a valid reserve is dropped
   - the badge and tick use `data-reserve-badge` and `data-reserve-tick` attributes
   - an active reserve without an end time reads "Held · hard"
   - the `.meter` wrapper appears only when a reserve is set
7. **Reserve editor shape.** The pure model is in `authFiles/quotaReserve.ts` and the controls in `AuthFileQuotaReserveField.tsx`. Editor state is one optional `quotaReserve` draft instead of the three flat fields in the plan. The draft reads the auth JSON's `quota_reserve` first and falls back to `file.quotaReserve`. Turning off a stored reserve sends `null`, even if the stored value was invalid.

**Verification notes from Task 10:**
- `upstream/main` is an ancestor of HEAD.
- `bun run verify` passed with 1675 tests and 0 failures.
- ESLint showed no warnings on the 73 files changed at that point.
- The new key namespaces have matching keys and `{{tokens}}` in all six locales.
- The ru/zh-TW locale gaps already present upstream were filed to the backlog.

**Other differences:**
- Task 11 recorded "no change needed" for `AGENTS.md`. Internal review later changed it (`640acab`) to list the six locales. The local `CLAUDE.md` is untracked, so whether it was synced can't be seen from the diff.
- External review changed behaviour beyond the plan. The inline-claim path now has a "Reset outcome unknown" chip, and the reserve status reloads through an `afterProbe` callback in `useQuotaActions`, which also affects Cards. A refresh now keeps view content on screen instead of showing skeletons.

**Blocked:** none.
**Skipped:** none.

## Backlog

- `docs/backlog/locale-gaps-plugin-resource-ru.md`: "ru and zh-TW locales miss plugin-resource and login keys" (minor).
  - `ru.json` lacks `nav_groups.plugin_pages` and the `plugin_resource.*` keys.
  - `zh-TW.json` lacks `auth_login.login_another_account` and `auth_login.view_auth_files`.
  - **Disposition:** filed and left open. The gaps came from upstream and also exist on `upstream/main`, and fixing them was out of scope for this plan.

## External review

### codex:gpt-6-astra:high

- label: codex
- iterations: 3
- duration_ms: 689772
- ended by: done
- had findings: true

**Iteration 1** (truncated: false)
- [P2] Preserve access to unresolved Claude claims after closing the drawer (`QuotaLedgerResets.tsx:75`) -> fixed. The claim journal gained `hasUnresolved` and a shared `claudeResetOperationKey`. The chip stays a toggle labelled "Reset outcome unknown" while a claim is unresolved, and the new `chip_unresolved` key is in all six locales.
- [P2] Refresh the reserve status after quota changes (`QuotaPage.tsx:443`) -> fixed for the Ledger. `reloadReserveVerdicts` plus a pure `mergeQuotaReserveVerdicts` run after row refresh, reset and Refresh All, with session guards. The Cards view was left out and raised again in iteration 2.
- [P2] Keep open drawers mounted during page-wide refresh (`QuotaPage.tsx:400`) -> fixed. Skeletons now show only for a session's first list (`initialLoading`).

**Iteration 2** (truncated: false)
- [P2] Refresh reserve statuses after Cards actions (`QuotaPage.tsx:505`) -> fixed. `useQuotaActions` takes an optional `afterProbe(file)` callback. It runs after `refreshQuota` and `runReset` settle, so both views reload the status.

**Iteration 3** (truncated: false)
- No issues found. The fixes were committed as `8d57977` ("fix: address codex review findings", 17 files).

## Validation

- Commands: none supplied.
- Timings: duration_ms 0, runs 0.

The run logged no timed validation commands. The task and review agents reported running `bun run verify` themselves:
- Task 10: 1675 tests, 0 failures
- after the first external-review round: 1698 tests
- after the second round: 1700 tests, with lint and build passing

Those runs are not in the supplied timings. The Quota and Auth Files pages were not checked in a browser or against a live backend: drawer behaviour, the reserve badge after a real reset, and the unresolved chip after a lost Claude response are all unverified. The manual checks in the plan's Post-Completion section are still outstanding.