# Subscription resets in the Ledger: expiry list and inline use

## Overview
- On the Quota page (`#/quota`), the user works in the **Ledger** view. They want each Codex and Claude subscription to show the rate-limit resets it holds, when each one expires, and an action to use one from the UI.
- Today the Ledger shows no reset information. Cards shows a Codex reset list with expiry, but for Claude only a count ("Resets remaining 1"). The Timeline hides credit ticks outside its 14-day span.
- The work first syncs the fork with upstream, which brings Claude grant expiry to Cards. It then lifts Claude grants into the shared quota store and adds a React-free reset inventory model. The Ledger gets a compact per-row chip with an expandable drawer that lists every reset with its expiry and offers an inline, two-step "Use a reset" action. That action reuses the existing Codex and Claude reset flows. After a successful Claude claim the proxy cooldown is cleared, which Codex already does.
- It also adds UI for the backend **quota reserve**, for subscriptions shared with services outside the proxy (CLIProxyAPI plan `docs/plans/20261008-quota-reserve.md`):
  - a Ledger reserve badge ("Reserve 25% · soft" / "Held until 10/14 · hard")
  - a threshold tick on the window meters
  - a reserve editor in the Auth Files details sheet

  The UI tolerates older backends: without the fields, no reserve UI is shown.
- Live example (2026-10-08): each Codex account holds 2 "Full reset" credits expiring around 10/22–23 and 10/29. Each Claude account holds 1 grant, "Claude Opus 5.5 launch: one usage-limit reset for Pro and Max" (1 of 1 left), which ends on 2026-10-22T16:00Z and clears `five_hour`/`seven_day`.

## Decisions
- **Context**: Codex reset credits already live in the shared store (`useQuotaStore.codexQuota[file].rateLimitResetCredits`) and reach every view through `quotaFor`. The Ledger just ignores them. Claude grants exist only in the local state of the `useClaudeResetGrants` hook, which only `QuotaCard` mounts (Cards view). The Ledger never reads them.
- **Chosen approach** (approved section by section in brainstorming):
  1. **Upstream sync first.** Merge `upstream/main` into the working branch as a merge commit, with no rebase and no force-push, so the fork commits `77dfd43`, `5743bac`, `f83b383` and `adcfb8a` are preserved.
     - The only conflict is `tests/providerModelOptions.test.ts`. Take upstream's version (`translations` via `createInstance` plus top-level `await`).
     - Upstream added the `vi` locale and `tests/vietnameseLocale.test.ts`. Add vi translations for the keys that are missing after the merge.
     - Upstream `2ce627d` brings `ClaudeResetGrantDetails`, the Claude grant expiry list in Cards. It auto-merges into `QuotaCard.tsx`.
  2. **Store**: add optional `resetGrants` and `resetGrantsError` to `ClaudeQuotaState`/`ClaudeQuotaData`. Fill them from `readClaudeResetGrants` as a third, non-fatal, parallel request inside `fetchClaudeQuota`'s existing `Promise.allSettled`. `CLAUDE_USAGE_URL` stays query-free.
  3. **Pure model**: `src/features/quota/resetInventory.ts`, with `buildResetInventory(provider, quota, nowMs)` → `{ items, error? } | null`. Items are sorted by expiry, soonest first. Expired items are dropped.
  4. **Ledger UI = "Concept C"** (chosen from three visual mockups): a chip under the plan label ("2 resets · next expires 10/23"). It turns amber when the soonest expiry is ≤ 3 days away. It expands a full-width drawer under the row that lists each reset (label, "soonest" tag, "expires MM/DD, HH:mm · in N days"). The drawer footer has "Use a reset…", which becomes an inline amber confirmation. There is no modal in the Ledger.
  5. **Action wiring reuses existing flows.** Codex: `useQuotaActions` gains a modal-free `performReset`; Cards keep the modal `resetQuota`. Claude: `useClaudeResetGrants` gains `execute()` + `confirmMessage`; `confirm()` with `showConfirmation({` stays for Cards. The Claude hook is mounted only inside an **open** drawer, so it reads fresh status before spending.
  6. **Claude cooldown parity**: after a Claude claim answers `reset`/`already_used`, call `authFilesApi.resetCooldown(authIndex)` with a connection guard, as Codex's `resetCodexQuota` already does. This applies to Cards and Ledger.
  7. **Quota reserve UI.** The backend contract comes from the CLIProxyAPI plan `20261008-quota-reserve`:
     - `GET /v8/management/credentials` entries gain `quota_reserve: {percent, mode}`, `quota_reserve_active: boolean` and `quota_reserve_until: RFC3339`
     - `PATCH /v8/management/credentials/fields` accepts `{"quota_reserve": {percent, mode} | null}` (400 on invalid values or unsupported providers)

     Normalize these in the API layer.
     - Ledger shows the backend's verdict (no client-side recompute) as a badge in `.identity` plus a thin tick on each window meter at the reserve threshold.
     - Auth Files edits it in `AuthFileDetailsSheet` (codex/claude only): toggle, percent 1-99, soft/hard select with explanation.
     - No reserve UI in Cards or Timeline, and no editing from the Ledger.
- **Rejected alternatives**:
  - Showing resets in Timeline too, Ledger-only, or a separate summary block. The user chose Ledger + Cards.
  - Building without the upstream sync. It duplicates upstream's `ClaudeResetGrantDetails` and risks two lists after a later sync.
  - Having each Ledger row fetch grants for display without the store. No caching, a refetch on every view switch, and no reuse.
  - Adding `?cedar_ember=1` to the primary Claude usage GET. CLIProxyAPI only records Claude quota probes for `earliest-reset` routing when the query is empty (`CLIProxyAPI internal/api/handlers/management/api_tools_quota.go:56-76`).
  - Concept A (inline list + existing modal; it was the recommendation and the lowest risk). Concept B (rail icon + anchored popover; it needs a new popover primitive).
  - Per-reset "spend this one" buttons. Codex's consume API accepts only `redeem_request_id` and OpenAI picks the credit.
- **Verified facts**:
  - `fetchClaudeQuota` (`src/features/quota/providers/claude/data.ts:~176-224`, merged tree) runs usage and profile in `Promise.allSettled`.
  - `readClaudeResetGrants` (`src/services/api/claudeResetGrants.ts:254`) GETs `/api/oauth/usage?cedar_ember=1&skip_spend=1` with a 12s timeout and returns `AnthropicResetGrantStatus` (`grants[]` with `id, label, resetsTotal, resetsLeft, startsAt, endsAt, clears, paused, usableNow`).
  - The Codex normalizer `normalizeCredit` (`src/utils/quota/resetCredits.ts:42-61`) keeps `{id,status,grantedAt,expiresAt}` and drops `title`.
  - `useQuotaActions.resetQuota` (`src/features/quota/hooks/useQuotaActions.ts:84-134`) wraps its whole flow in `showConfirmation`.
  - The source guards in `tests/claudeResetGrants.test.ts` require:
    - `QuotaCard.tsx` contains `quotaClasses.codexPlanValue}>{claudeReset.count`, `disabled={claudeReset.blocked}` and `onClick={claudeReset.confirm}`.
    - The hook contains `showConfirmation({` and `pending ? 'claude_reset.retry_confirm'`.
    - The hook must NOT contain `<Modal` or `status.grants.map`.
    - The `claude_reset` key sets match across locales.
  - `tests/quotaLedger.test.ts` counts `role="group"`, so the new UI must not add that role.
  - Components that bind `QuotaBody.module.scss` at module init cannot be imported in bun SSR tests (`src/features/quota/types.ts` `bindQuotaClasses`). The Ledger therefore uses its own SCSS module and the pure model, not `ClaudeResetGrantDetails` or `CodexQuotaBody`.
  - `bun test` runs in UTC. `QuotaLedger` calls `useNow()` (frozen at module load under SSR).
  - The backend `POST /v8/management/routing/cooldown/reset` (`CLIProxyAPI internal/api/handlers/management/quota.go:27`) works for any provider by `auth_index`.
  - Upstream `18ca877` makes Codex reset clear the cooldown (`tests/codexQuotaReset.test.ts` shows the spy pattern).
  - Existing i18n keys that can be reused: `claude_reset.read_error|cooldown|unknown|expired|retry|retry_confirm|confirm_text` and `codex_quota.reset_cooldown_failed`.
  - The open upstream PRs #456 (Claude free resets) and #422 (Codex cooldown after a reset credit) overlap this area.

## Context (from discovery)
- Files/components involved:
  - sync: `tests/providerModelOptions.test.ts`, `src/i18n/locales/vi.json`
  - data: `src/types/quota.ts`, `src/features/quota/providers/claude/data.ts`, `src/services/api/claudeResetGrants.ts`, `src/utils/quota/resetCredits.ts`
  - model: new `src/features/quota/resetInventory.ts`
  - actions: `src/features/quota/hooks/useQuotaActions.ts`, `src/features/quota/providers/claude/ClaudeResetGrants.tsx`, new `src/features/quota/providers/claude/claimCooldown.ts`, new `src/features/quota/hooks/quotaReset.ts`
  - UI: `src/features/quota/components/QuotaLedger.tsx` + `QuotaLedger.module.scss`, new `src/features/quota/components/QuotaLedgerResets.tsx` + `QuotaLedgerResets.module.scss`, `src/features/quota/QuotaPage.tsx` (props to `QuotaLedger` at ~435-443)
  - i18n: `src/i18n/locales/{en,ru,zh-CN,zh-TW,vi}.json`
  - reserve: `src/services/api/transformers.ts` + `src/services/api/authFiles.ts` + the `AuthFileItem` type, `src/features/authFiles/components/AuthFileDetailsSheet.tsx` (priority field at ~209), `src/features/authFiles/hooks/useAuthFilesPrefixProxyEditor.ts` (editor state + patch building, priority at ~48/73/304-315)
- Related patterns found:
  - Pure models next to the feature (`resetSchedule.ts`, `ledgerModel.ts`, `quotaTimelineModel.ts`).
  - SSR tests with `renderToStaticMarkup` plus a stub `quotaFor` (`tests/quotaLedger.test.ts`).
  - API spies via `spyOn(apiCallApi, 'request')` / `spyOn(authFilesApi, 'resetCooldown')` (`tests/codexQuotaReset.test.ts`).
  - `buildResetDisplay` / `parseIsoToMs` / `formatInstantShort` from `@/utils/quota`.
  - Masking of upstream text with `maskQuotaText` when `!showEmails`.
- Dependencies identified: Ledger UI depends on the store change and the model. The Ledger action depends on `performReset` and the hook's `execute()`. The whole plan sits on top of the upstream sync (Task 1).

## Development Approach
- **Testing approach**: TDD. Write the failing tests first, then the implementation, within the same task.
- Complete each task fully before moving to the next.
- Make small, focused changes. Follow `AGENTS.md`: Bun only, `@/` imports, 2-space indent, single quotes, no `any` without need, theme tokens only, all user-facing text in i18n.
- **CRITICAL: every task MUST include new/updated tests** for code changes in that task.
  - tests are not optional - they are a required part of the checklist
  - write unit tests for new functions/methods
  - write unit tests for modified functions/methods
  - add new test cases for new code paths
  - update existing test cases if behavior changes
  - tests cover both success and error scenarios
- **CRITICAL: all tests must pass before starting next task** - no exceptions
- **CRITICAL: update this plan file when scope changes during implementation**
- Run focused tests after each change, and `bun run verify` at the end of each task.
- Maintain backward compatibility. Cards and AuthFiles behavior must not change, apart from the upstream sync and Claude cooldown parity.
- New translation keys go under the fork-only namespace `quota_management.resets.*` in **all six** locales (en, ru, zh-CN, zh-TW, vi, ko — `ko` arrived with the Task 1 upstream sync). Never add keys to upstream-owned `claude_reset.*` / `codex_quota.*`; that avoids sync conflicts and keeps the `claude_reset` parity test valid.
- Never spend a live reset during development or verification.

## Testing Strategy
- **Unit tests**: required for every task (see Development Approach). There are `bun:test` suites under `tests/`. Use pure-logic tests, `renderToStaticMarkup` SSR tests, and source-contract tests. Use explicit `now` values and UTC-safe fixtures.
- **E2E tests**: the project has no browser DOM/e2e harness. Interactive behavior (expand, Esc, focus) is checked manually in Post-Completion.

## Progress Tracking
- Mark completed items with `[x]` immediately when done
- Add newly discovered tasks with ➕ prefix
- Document issues/blockers with ⚠️ prefix
- Update plan if implementation deviates from original scope
- Keep plan in sync with actual work done

## What Goes Where
- **Implementation Steps** (`[ ]` checkboxes): tasks achievable within this codebase - code changes, tests, documentation updates
- **Post-Completion** (no checkboxes): items requiring external action - manual testing, deployment, upstream tracking

## Decision Log
- 2026-10-08 brainstorm: **accepted** - Ledger + Cards scope (Cards' Claude dates come from the upstream sync); Timeline stays untouched.
- 2026-10-08 brainstorm: **accepted** - scope expanded from display-only to also using a reset from the Ledger UI, after the user asked for it.
- 2026-10-08 brainstorm: **accepted** - Ledger UI changed from an always-visible per-row expiry list to Concept C (chip + expandable drawer with inline confirmation). The full date list now sits behind one click, which the user accepted in exchange for density.
- 2026-10-08 brainstorm: **rejected** - "Concept A (inline list + existing modal) is lower risk" - the user preferred C's density and in-context confirmation. Risk is contained by extracting modal-free `performReset`/`execute()` while keeping the modal paths and source guards for Cards.
- 2026-10-08 brainstorm: **rejected** - "Concept B (rail icon + popover)" - it needs a new popover primitive and has an unlabeled icon action.
- 2026-10-08 brainstorm: **accepted** - clear the proxy cooldown after a successful Claude claim (parity with Codex), in this plan.
- 2026-10-08 brainstorm: **accepted** - quota reserve UI added to this plan (Tasks 8-9), not a separate plan, to avoid conflicts on `QuotaLedger.tsx`/`QuotaPage.tsx` with the resets work. The backend ships in CLIProxyAPI `20261008-quota-reserve`.
- 2026-10-08 brainstorm: **rejected** - "show/use individual resets" - the Codex consume API cannot target a credit, so the action is one per subscription.

## Implementation Steps

### Task 1: Sync upstream/main into the working branch
- [x] run `git fetch upstream` then `git merge --no-ff upstream/main` (merge commit; no rebase, no force-push). Resolve the only conflict, `tests/providerModelOptions.test.ts`, by taking upstream's side: `translations` via `createInstance()` + top-level `await translations.init(...)`, and `{ i18n: translations }`. Drop the fork's `fieldI18n`/`beforeAll` variant and any import that becomes unused.
- [x] check that the auto-merged `src/features/quota/components/QuotaCard.tsx` renders upstream `<ClaudeResetGrantDetails>` exactly once (right after the "Resets remaining" count), that the fork's `displayName` changes survive, and that `src/features/quota/providers/claude/ClaudeResetGrants.tsx` exposes both `displayName` and `grants`
- [x] add every key that is in `src/i18n/locales/en.json` but missing from `src/i18n/locales/vi.json` (about 39: fork-only ledger/routing/fast-mode keys plus `claude_quota.cloud_session_credits`), with Vietnamese translations and identical `{{tokens}}`. Compute the list by flattening both files.
- [x] run `bun install --frozen-lockfile`, then `bun test tests/vietnameseLocale.test.ts tests/providerModelOptions.test.ts tests/claudeResetGrants.test.ts tests/codexQuotaReset.test.ts` - must pass (these existing suites are the tests for this task; no new tests needed)
- [x] run `bun run verify` - must pass before task 2
- [x] ➕ upstream added a Korean locale (`ko.json`, `tests/koreanLocale.test.ts`, upstream `f03160e`) after this plan was written: added the same 37 missing keys to `ko.json`. Later tasks that say "all five locales" now mean six (en, ru, zh-CN, zh-TW, vi, ko).
- [x] ➕ fixed order-dependent `tests/authFileCooldowns.test.ts` failure exposed by the merge (upstream suites switch the shared i18n to `en`; the hint's apostrophe is HTML-escaped in markup): compare against escaped text

### Task 2: Load Claude reset grants into the quota store
- [x] write failing tests in `tests/claudeQuotaResetGrants.test.ts` using `spyOn(apiCallApi, 'request')` and routing by URL:
  - a valid `cedar_ember` block → `CLAUDE_CONFIG.fetchQuota` returns `resetGrants` (parsed grants), and `buildSuccessState` keeps them
  - grants HTTP error, rejected request, or malformed block → status still `success`, windows intact, `resetGrants: null`, `resetGrantsError` set
  - a failing usage request still throws (unchanged)
- [x] write a guard test: `CLAUDE_USAGE_URL` contains no `?`, and the grants request is a separate call to `ANTHROPIC_API_ORIGIN + ANTHROPIC_RESET_GRANT_STATUS_PATH`
- [x] add `resetGrants?: AnthropicResetGrant[] | null` and `resetGrantsError?: string` to `ClaudeQuotaState` (`src/types/quota.ts`) and to `ClaudeQuotaData` (where it is declared for `claude/data.ts`)
- [x] in `fetchClaudeQuota` (`src/features/quota/providers/claude/data.ts`), add `readClaudeResetGrants(authIndex)` as the third parallel leg of the existing `Promise.allSettled`. Map a rejection to `resetGrants: null` + `resetGrantsError: t('claude_reset.read_error')`. Map `CLAUDE_CONFIG.buildSuccessState` to include both fields; leave the loading/error builders unchanged.
- [x] run `bun test tests/claudeQuotaResetGrants.test.ts tests/claudeResetGrants.test.ts` and `bun run type-check` - must pass before task 3

### Task 3: Reset inventory model and Codex credit titles
- [x] write failing tests in `tests/codexQuota.test.ts` (or the suite that covers `normalizeCodexResetCreditsPayload`): the normalizer keeps a trimmed `title` when present and omits it when absent; the existing filters (`reset_type`, `status`, `expires_at`) are unchanged
- [x] write failing tests in `tests/resetInventory.test.ts` with an explicit `nowMs`:
  - Codex: one item per `available` credit; expired, unparseable and non-available credits dropped; sorted ascending; `label` from `title`
  - Claude: items only for `resetsLeft > 0`; past `endsAt` dropped; `endsAt: null` kept and sorted last; `left`/`total`/`clears`/`label` mapped; paused or not-started grants still listed
  - tie-break by `id`; empty `id` falls back to an index-based id
  - `resetGrants === null` or `rateLimitResetCreditsError` → `{ items: [], error }`
  - non-success quota → `null`; other providers → `null`
- [x] add optional `title?: string` to `CodexResetCredit` in `src/utils/quota/resetCredits.ts` and to the duplicate in `src/types/quota.ts`, and keep it in `normalizeCredit`
- [x] create `src/features/quota/resetInventory.ts` exporting `ResetInventoryItem`, `ResetInventory` and `buildResetInventory(provider, quota, nowMs)`. Make it React-free, use `parseIsoToMs`, and follow the style of `resetSchedule.ts`. Do NOT refactor `CodexQuotaBody`, the Timeline or `resetSchedule` onto it.
- [x] run `bun test tests/resetInventory.test.ts tests/codexQuota.test.ts tests/quotaBodyRendering.test.ts` - must pass before task 4

### Task 4: Claude claim — modal-free execute() and proxy cooldown parity
- [ ] write failing tests in `tests/claudeClaimCooldown.test.ts` for a new helper `clearClaudeCooldownAfterClaim` (`src/features/quota/providers/claude/claimCooldown.ts`), using `spyOn(authFilesApi, 'resetCooldown')`:
  - called once with the auth index only for answers `reset`/`already_used`; never for other codes or unresolved outcomes
  - skipped when the connection revision changed (guard like `guardConfigConnection` in `codex/data.ts`)
  - returns a failure result when `resetCooldown` throws, returns a non-`ok` status, or returns a mismatched `auth_index`
- [ ] implement the helper
- [ ] refactor `useClaudeResetGrants` (`src/features/quota/providers/claude/ClaudeResetGrants.tsx`):
  - move the `onConfirm` body into an `execute()` function and return it, together with `confirmMessage` (the fresh `claude_reset.confirm_text` or the retry `claude_reset.retry_confirm` text, already interpolated)
  - keep `confirm()` calling `showConfirmation({` with the same `pending ? 'claude_reset.retry_confirm'` expression, now delegating to `execute()`
  - after a successful answer, call the helper; on failure show the new key `quota_management.resets.cooldown_failed` ("Reset used, but the proxy cooldown was not cleared — clear it manually in Auth Files") in all five locales
- [ ] extend the source-contract tests in `tests/claudeResetGrants.test.ts`: the hook returns `execute` and `confirmMessage`, the existing guards still hold, and the `QuotaCard` guards are unchanged
- [ ] run `bun test tests/claudeClaimCooldown.test.ts tests/claudeResetGrants.test.ts` and `bun run verify` - must pass before task 5

### Task 5: Codex — reusable reset execution without the modal
- [ ] write failing tests in `tests/quotaResetExecution.test.ts` for a new plain helper `executeQuotaReset(deps)` (`src/features/quota/hooks/quotaReset.ts`), using injected `resetQuotaFn`, `setQuota`, `notify`, and the cache-generation functions:
  - success commits `adapter.buildSuccessState(data)` under the cache key and notifies `codex_quota.reset_success`
  - a failure notifies `codex_quota.reset_failed` and commits no state
  - a stale cache generation commits nothing and shows no notification
  - the resetting key is set during the call and cleared in `finally`
- [ ] implement the helper. In `useQuotaActions` (`src/features/quota/hooks/useQuotaActions.ts`), keep `resetQuota` (with `showConfirmation`) calling the helper from `onConfirm`. Add and return a modal-free `performReset(file, adapter)` that applies the same guards (`disableControls`, `file.disabled`, loading, already resetting) and then calls the helper.
- [ ] add a source-contract test that `QuotaPage.tsx` still passes `resetQuota` to `QuotaCard` (`onReset`), so Cards keep the modal
- [ ] run `bun test tests/quotaResetExecution.test.ts tests/codexQuotaReset.test.ts` and `bun run verify` - must pass before task 6

### Task 6: Ledger chip and resets drawer (display)
- [ ] write failing SSR tests in `tests/quotaLedgerResets.test.ts`, rendering `QuotaLedger` with the new `now` prop and a stub `quotaFor`, plus far-future fixtures:
  - chip text "2 resets · next expires 10/23" and "1 reset · expires 10/22"
  - amber modifier class when the soonest expiry is ≤ 3 days away, none otherwise
  - no chip without resets or for other providers
  - muted error line "Couldn't load resets"
  - masking via `maskQuotaText` when `showEmails` is false
  - the `role="group"` count is unchanged versus the existing `tests/quotaLedger.test.ts` expectations
- [ ] write failing SSR tests for the exported drawer component:
  - Codex: header "Resets 2", hint "Unused resets are lost when they expire", one non-interactive line per reset with label, "soonest" tag on the first, "expires MM/DD, HH:mm · in N days" (via `buildResetDisplay`), footer note "OpenAI chooses which reset is redeemed" and a "Use a reset…" button
  - Claude: the grant label plus "1 of 1 left · clears 5-hour + 7-day"
- [ ] add an optional `now?: number` prop to `QuotaLedger` (default `useNow()`) and pass it down to rows
- [ ] create `src/features/quota/components/QuotaLedgerResets.tsx` (chip + drawer, using `buildResetInventory`, `buildResetDisplay`, `formatInstantShort` and `maskQuotaText`) and `QuotaLedgerResets.module.scss`. Use theme tokens only (`--amber-10`/`--amber-text` for the warning tone). The drawer uses `grid-column: 1 / -1`; make it work at the ≤700px breakpoint. Do not use `role="group"`.
- [ ] integrate it into `LedgerRow` (`QuotaLedger.tsx`):
  - the chip goes in `.identity` under the plan label as `<button aria-expanded aria-controls>` with a title listing all dates
  - the drawer is the last grid child, with a local `expanded` state per row
  - while expanded during a refresh the drawer shows a "Loading…" line instead of closing
  - add the `quota_management.resets.*` display keys in all five locales
- [ ] run `bun test tests/quotaLedgerResets.test.ts tests/quotaLedger.test.ts` and `bun run verify` - must pass before task 7

### Task 7: Inline "Use a reset" action in the drawer
- [ ] write failing SSR tests for the exported confirmation block and drawer states:
  - Codex consequence text "OpenAI redeems one of your 2 resets; your Codex rate limits are cleared and the proxy cooldown for this account is cleared" plus "This can't be undone · 1 reset will remain"
  - Claude fresh text "Spends 1 reset from <label> (expires 10/22); clears 5-hour and 7-day limits" and the retry variant from `confirmMessage`
  - busy state "Using reset…" with both buttons disabled
  - Claude blocked state with an inline reason from `claude_reset.*` (unknown outcome → "Retry the same claim")
  - Codex with zero resets → no action
- [ ] wire `QuotaPage.tsx` → `QuotaLedger`:
  - pass `performReset` (Codex) and `resettingQuotaName`
  - pass the existing `refreshQuota` callback for the Claude hook's `onRefresh`
  - disable the row's refresh button while that row's reset is in flight
- [ ] Codex drawer: "Use a reset…" opens the inline confirm step; "Use 1 reset" calls `performReset(file, CODEX adapter)`
- [ ] Claude drawer:
  - mount `useClaudeResetGrants` only while the drawer is open (`enabled` when the quota is `success`)
  - render `blocked`/`busy`/`message`/`buttonLabel`/`confirmMessage`
  - "Use 1 reset" calls `execute()`
- [ ] keyboard and focus: Cancel gets default focus when the confirm step opens, Esc cancels it, and focus returns to "Use a reset…". Add the confirm-step keys to all five locales.
- [ ] run `bun test tests/quotaLedgerResets.test.ts tests/claudeResetGrants.test.ts tests/quotaResetExecution.test.ts` and `bun run verify` - must pass before task 8

### Task 8: Quota reserve — data normalization and Ledger display
- [ ] write failing tests in `tests/quotaReserve.test.ts`:
  - credential normalization (`src/services/api/transformers.ts` / `AuthFileItem`) maps `quota_reserve` → `quotaReserve: { percent, mode }`, `quota_reserve_active` → `quotaReserveActive`, and `quota_reserve_until` → `quotaReserveUntil`
  - invalid or missing values become `undefined`
  - unknown `mode` → `undefined`
- [ ] write failing SSR tests (extend `tests/quotaLedgerResets.test.ts` or add `tests/quotaLedgerReserve.test.ts`, with the `now` prop and a stub entry whose `file` carries the fields):
  - no badge without a reserve
  - muted badge "Reserve 25% · soft" when configured but inactive
  - amber badge "Held until 10/14 · hard" when active, with the soft/hard tooltip text ("Proxy won't start new sessions on this account until …; existing sessions continue" / "…only when no other account is available")
  - a meter tick at `left: <percent>%` on each window when a reserve is set, absent otherwise
  - masking unaffected
  - the `role="group"` count unchanged
- [ ] implement the normalization and add the fields to `AuthFileItem`
- [ ] render the badge in `LedgerRow` `.identity` next to the resets chip, plus the tick in `WindowCell`/`Meter` (`QuotaLedger.tsx`), with styles in `QuotaLedger.module.scss` using theme tokens. Add the `quota_management.reserve.*` keys in all five locales.
- [ ] run `bun test tests/quotaReserve.test.ts tests/quotaLedger*.test.ts` and `bun run verify` - must pass before task 9

### Task 9: Quota reserve — Auth Files editor
- [ ] write failing tests for the editor's patch building in `useAuthFilesPrefixProxyEditor.ts` (extract a pure `buildQuotaReservePatch(original, editor)` if needed, tested in `tests/authFilesQuotaReserve.test.ts`):
  - enabling → `quota_reserve: { percent, mode }`
  - disabling an existing reserve → `quota_reserve: null`
  - unchanged → no key
  - percent outside 1-99 or non-integer → validation error, no request
  - non-codex/claude credentials → field hidden and never sent
- [ ] add editor state (`quotaReserveEnabled`, `quotaReservePercent`, `quotaReserveMode`) initialized from `file.quotaReserve`, and include the patch in the existing `PATCH /v8/management/credentials/fields` save path (`src/services/api/authFiles.ts`)
- [ ] render the controls in `AuthFileDetailsSheet.tsx` next to the priority field, only for codex/claude: toggle "Reserve quota for external services", number input (1-99 %), a soft/hard select with hint text explaining new-sessions-only behavior. Use the existing form components. Show a backend 400 as the existing error notification. Add the `auth_files.reserve.*` keys in all five locales.
- [ ] write an SSR or source-contract test that the controls render for codex/claude and are absent for other providers
- [ ] run `bun test tests/authFilesQuotaReserve.test.ts` and `bun run verify` - must pass before task 10

### Task 10: Verify acceptance criteria
- [ ] verify every Overview requirement:
  - fork contains `upstream/main`
  - Cards show Claude grant expiry
  - Ledger chip + drawer for Codex and Claude rows with resets
  - inline two-step use via the existing flows
  - Claude success clears the proxy cooldown
  - reserve badge, meter tick and Auth Files editor work against fixtures, and the UI is hidden when the backend omits the fields
- [ ] verify the edge cases: expired/unparseable entries hidden, `endsAt: null` sorted last, grants read failure leaves windows intact, masking with emails hidden, the ≤700px layout keeps the chip and drawer usable (inspect the SCSS rules)
- [ ] verify that no guard regressed: `claudeResetGrants` source guards, `CLAUDE_USAGE_URL` query-free, Ledger `role="group"` counts, 5-locale parity (`vietnameseLocale` + `claude_reset` parity tests)
- [ ] run `bun run verify` (tests + lint + build) - must pass; fix lint errors and any new warnings in changed files
- [ ] confirm every new module (`resetInventory.ts`, `claimCooldown.ts`, `quotaReset.ts`, `QuotaLedgerResets.tsx`, reserve normalization and patch builder) has tests that cover its success and error branches

### Task 11: [Final] Update documentation
- [ ] update `README.md` (and `README_CN.md` if it has the same row) in the Quotas feature row to mention subscription resets with expiry and inline use, and the per-credential quota reserve (Auth Files editor, Ledger badge)
- [ ] update `AGENTS.md` only if a new pattern needs documenting (for example, "Ledger renders resets through `resetInventory.ts` and its own SCSS module; do not bind `QuotaBody` classes there"). If `AGENTS.md` changes, sync the local `CLAUDE.md` when present.

## Technical Details
- **Types**
  - `ClaudeQuotaState`/`ClaudeQuotaData`: `resetGrants?: AnthropicResetGrant[] | null` (`null` = read failed, `[]` = none) and `resetGrantsError?: string`
  - `CodexResetCredit`: `title?: string`
- **Model**

  ```ts
  export interface ResetInventoryItem {
    id: string;                 // credit/grant id; index fallback when empty
    expiresAtMs: number | null; // null = upstream gave no expiry (Claude only)
    label?: string;             // Codex credit title / Claude grant label
    left?: number;              // Claude: resetsLeft
    total?: number;             // Claude: resetsTotal
    clears?: AnthropicResetWindow[]; // Claude windows cleared
  }
  export interface ResetInventory { items: ResetInventoryItem[]; error?: string }
  export function buildResetInventory(
    provider: QuotaProviderType, quota: unknown, nowMs: number
  ): ResetInventory | null;
  ```

- **Claude fetch flow**: `Promise.allSettled([usage, profile, readClaudeResetGrants(authIndex)])`. Usage failure throws (unchanged). Profile failure gives `planType: null` (unchanged). Grants failure gives `resetGrants: null` + `resetGrantsError`. The batch loader commits the Claude group once all three settle (the grants timeout is 12s; accepted).
- **Claude action flow (Ledger)**:
  1. Open the drawer; the hook mounts and reads fresh status.
  2. "Use a reset…" opens the inline confirm with `confirmMessage`.
  3. "Use 1 reset" calls `execute()`, which runs `resetGrantOperations.run`.
  4. On `reset`/`already_used`, `clearClaudeCooldownAfterClaim` runs, then the notification shows.
  5. `onRefresh()` calls `refreshQuota`, which updates the store, so the chip and drawer update.

  The journal, retry window and guards stay untouched.
- **Codex action flow (Ledger)**: "Use a reset…" opens the inline confirm; "Use 1 reset" calls `performReset(file, adapter)`. That runs `executeQuotaReset`, which calls `CODEX_CONFIG.resetQuota` (consume → `resetCooldown` → re-fetch), commits the success state and notifies.
- **Chip copy**:
  - `"{{count}} resets · next expires {{date}}"` / `"1 reset · expires {{date}}"`; date = `MM/DD` local
  - amber when `items[0].expiresAtMs - now <= 3 days`
  - the title attribute lists every expiry
- **New i18n namespace** `quota_management.resets.*` (en/ru/zh-CN/zh-TW/vi):
  - chip (one/many)
  - drawer title and hint, `soonest`, `expires_line`, `no_expiry`, `codex_choice_note`
  - `use`, `confirm_codex`, `confirm_claude`, `cant_undo_remaining`, `confirm_button`, `cancel`, `using`
  - `load_error`, `loading`, `cooldown_failed`
- **Quota reserve contract** (CLIProxyAPI `20261008-quota-reserve`):
  - GET entry adds `quota_reserve?: { percent: 1..99, mode: 'soft'|'hard' }`, `quota_reserve_active?: boolean` and `quota_reserve_until?: string`
  - PATCH `{ auth_index, fields: { quota_reserve: {…} | null } }`
  - the badge shows the backend verdict only
  - tick position = `percent`% from the left of the remaining-quota meter
- **Reference mockup**: `/tmp/cpamc-mockups/concept-c.html` plus `screens/concept-c-*.png`. These are temporary and may be gone; this plan's description is authoritative.

## Post-Completion
*Items requiring manual intervention or external systems - no checkboxes, informational only*

**Manual verification**
- Run `bun run dev` and connect to the local backend `http://127.0.0.1:8317` (custom connection URL).
- **Ledger**: chips on all four live accounts (Codex "2 resets · next expires 10/22–23", Claude "1 reset · expires 10/22"). Check expand/collapse, several drawers open at once, keyboard (Tab/Enter/Esc), the ≤700px layout, the "Show emails" toggle, and that a refresh keeps the drawer open.
- **Inline confirm**: open it for one Codex and one Claude account, read the consequence text, then press **Cancel**. Do NOT confirm: live resets are scarce and spending one is the user's call.
- **Cards**: Claude grant expiry list (upstream) shows once per card. The Codex list is unchanged.
- **Quota reserve** (needs the backend from CLIProxyAPI `20261008-quota-reserve` deployed):
  - set a reserve in Auth Files, check the Ledger badge and tick, and clear it
  - raise the percent above the current remaining and confirm "Held until …"
  - spend at most 1-2 short requests

**Integration / deployment**
- Review and merge via `loopai-merge`. Pushing the fork's `main` to GitHub is a separate, explicit step.
- Deploy on request: `bun run build`, then back up `~/Library/Application Support/CLIProxyAPI/static/management.html` and copy `dist/index.html` over it (`management.disable-auto-update-panel: true` is already set).
- Watch upstream PRs #456 and #422 for overlap at the next sync.
