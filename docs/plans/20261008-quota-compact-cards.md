# Compact Quota page: settings toolbar, totals strip, Auth-Files-style cards

## Overview
- With today's 4 accounts, the Quota page (`#/quota`) does not fit one screen (1800×1064 CSS px). The "Subscription switching" block and the "Codex Fast mode" block alone take about 600 px. Cards mode also renders a `QuotaTimeline` under the grid.
- Implement the approved mockup "Compact A". It has three parts:
  - a one-line **settings toolbar** that replaces both blocks in every view;
  - a slim **totals strip** with per-provider window totals plus a "Resets held" tile;
  - a **4-column grid of compact account cards** in the Auth Files visual language.
- The new cards replace the old Cards view, and **Cards becomes the default view**. Ledger and Timeline stay as alternatives.
- Each compact card shows:
  - provider pill, masked name and enabled dot;
  - plan, renewal, credit and reserve chips;
  - quota window rows with mono times and reserve threshold ticks;
  - a "Resets expire" box listing every unexpired reset, soonest first, with the soonest accented;
  - a footer with **inline** "Use a reset…" (the same two-step confirmation as the Ledger drawer) and refresh.
- The quota reserve can now be edited **on the Quota page**: a clickable reserve chip, or "Set reserve…" when none is set, opens an inline editor in the card. The existing editor in Auth Files stays. Both write the same `PATCH /v8/management/credentials/fields`.
- No backend changes.

## Decisions
- **Context**: the reference mockup is `/tmp/cpamc-mockups/compact-a.html` with the screenshot `screens/compact-a.png`. Both may be gone; this plan's description is authoritative. Discovery of the merged tree (`main` @ `f1a116a`) established the facts below.
- **Chosen approach** (approved by the user):
  1. Cards view = new compact card grid, made the default view (`QuotaPage.tsx:76-78` default `'ledger'` → `'cards'`).
     - Remove the `QuotaTimeline` rendered under Cards (`QuotaPage.tsx:538-545`).
     - Retire the old `QuotaCard.tsx` from the page.
     - Ledger and Timeline views are otherwise unchanged.
  2. The settings toolbar replaces `SubscriptionRouting` and `CodexFastMode` (`QuotaPage.tsx:359-365`) in all views, with the same behavior:
     - routing keeps an explicit Save (`PATCH /config {routing:…}`);
     - Fast mode keeps saving immediately (`PUT /config/oauth/providers/codex/fast-mode`);
     - last-selected activity keeps polling `GET /routing/activity` every 10 s;
     - long hints move into `title` tooltips.
  3. The totals strip is rendered in Cards view only; Ledger keeps its own summaries and Timeline is unchanged. It reuses `ledgerWindows`, `primaryLedgerWindow` and `summarizeLedgerWindows` (`ledgerModel.ts`). The "Resets held" tile reuses `buildResetInventory` + `countResets` + `formatMonthDay`.
  4. The compact card is built from fork-owned pure models (`ledgerWindows`, `ledgerPlanLabel`, `buildResetInventory`, `resetActions.ts`) with its own SSR-safe SCSS module (no `bindQuotaClasses`). It imitates `AuthFileQuota.module.scss`: 11.5px mono metas, `.quotaSection`-like box, pill and chip styles from `AuthFileCard.module.scss`. Its tests pass `now`.
  5. Reset action = **inline** two-step confirm, reusing `QuotaLedgerResets.tsx` pieces:
     - Codex uses `performReset`;
     - Claude uses the existing `useClaudeResetGrants` hook, mounted only after "Use a reset…" is pressed, so collapsed cards make no grant reads;
     - unresolved Claude claims stay reachable.
  6. Inline reserve editor on the card, plus the existing Auth Files editor:
     - reuse `authFiles/quotaReserve.ts` (`readQuotaReserveDraft`, `quotaReserveError`, `buildQuotaReservePatch`);
     - save via `authFilesApi.patchFields(file.name, patch)`, then `reloadReserveVerdicts()`, with a connection-revision guard;
     - turning a stored reserve off always sends `quota_reserve: null`.
- **Rejected alternatives**:
  - A new fourth "Compact" view next to the old Cards (two similar views, more code).
  - Replacing Cards but keeping Ledger as the default.
  - Modal confirmation in cards. The user chose inline for one mechanic across the page.
  - Reusing `adapter.Body` (`CodexQuotaBody`/`ClaudeQuotaBody`) with the Auth Files compact class map. It would need changes in upstream-owned body/meter files for reserve ticks, it lists expired Codex credits (backlog `codex-expired-reset-credits-listed.md`), and it couples cards to the 32-key class contract that throws under SSR.
  - Reusing `AuthFileQuotaSection` as-is (own refresh/reset logic, no masking, no `afterProbe`, no `resettingKeys`).
  - Keeping reserve editing only in Auth Files. The user wants it where quotas are viewed.
  - Removing the Auth Files editor (the user keeps both).
  - Showing the totals strip in all views (would duplicate Ledger's summaries and churn `tests/quotaLedger.test.ts`).
  - A popover-based editor or confirm. No popover primitive exists in `src/components/ui`.
- **Verified facts**:
  - **View mode**: `QUOTA_VIEW_MODES = ['ledger','cards','timeline']` (`constants.ts:24`), persisted in sessionStorage `quotaPage.uiState` via `uiState.ts:17,28-62`. A stored choice wins over the default.
  - **Page data**:
    - `getQuota(entry)` comes from `quotaByType` (`QuotaPage.tsx:154-181`).
    - `useQuotaActions(disableControls, formatDisplayText, afterQuotaProbe)` returns `{resettingKeys, refreshQuota, resetQuota, performReset}` (`useQuotaActions.ts`; `performReset` returns `Promise<boolean>`).
    - `reloadReserveVerdicts` is at `QuotaPage.tsx:133-150`, `afterQuotaProbe` at `:269-274`.
  - **Routing and Fast mode components**:
    - `SubscriptionRouting.tsx` holds state and fetch/save inline (`:32-102`).
    - `SubscriptionAccounts.tsx` polls activity (`:39-64`) and masks names with `maskQuotaName`.
    - `CodexFastMode.tsx` saves on toggle (`:46-63`).
    - `Select` supports `size="sm"`.
    - There is no popover primitive.
  - **Claude grants** are already in the store: `ClaudeQuotaState.resetGrants`/`resetGrantsError`. `buildResetInventory` filters out expired and spent entries and returns `{items:[], error}` when the reads failed.
  - **`QuotaLedgerResets.tsx`** exports `QuotaLedgerResetsChip`, `QuotaLedgerResetsConfirm`, `QuotaLedgerResetsDrawer` and `ClaudeLedgerResetsDrawer`; `ResetActionFooter` is not exported. `resetActions.ts` has `codexResetAction`/`claudeResetAction`.
  - **Reserve UI** lives in `QuotaLedger.tsx`, not exported: `ReserveBadge` at `:87-125`, the meter with `data-reserve-tick` at `:57-84`. `reserveCoversWindow` is in `ledgerModel.ts:128-135`.
  - **Bun SSR**: `.module.scss` imports are strings, so class names are `undefined` and `bindQuotaClasses` at module init throws. Express states with `data-*` attributes. `useNow()` is frozen under SSR.
  - **Source guards that must be updated deliberately** (not deleted silently):
    - `tests/quotaResetExecution.test.ts:213-235` requires `onReset={() => resetQuota(entry.file, QUOTA_ADAPTERS[entry.type])}` in `QuotaPage.tsx`.
    - `tests/claudeResetGrants.test.ts:376-401` requires three strings in `QuotaCard.tsx`.
    - `tests/quotaLedgerResets.test.ts:643-695` requires:
      - the `<QuotaLedger` wiring;
      - `if (file.quotaReserve) void reloadReserveVerdicts();`;
      - `useQuotaActions(disableControls, formatDisplayText, afterQuotaProbe)`;
      - the Refresh-All reload regex;
      - `initialLoading` and no `{loading ? (`;
      - exactly one `= useClaudeResetGrants(` in `QuotaLedgerResets.tsx`.
    - `tests/quotaToolbar.test.ts` requires the search/sort `.toolbar` markup after `<ProviderTabs`, plus SCSS details.
    - `tests/providerTabsOverflow.test.ts:26-29` covers `.tabsRow`/`.sort` SCSS.
    - `tests/authFilesQuotaReserve.test.ts:289-310` covers Auth Files editor placement and locale parity.
  - **Locales**: en, ru, zh-CN, zh-TW, vi, ko (all six, per AGENTS.md; vi/ko parity tests). New keys go only in fork namespaces (`quota_management.*`).

## Context (from discovery)
- Files/components involved:
  - page: `src/features/quota/QuotaPage.tsx`, `QuotaPage.module.scss`, `constants.ts`, `uiState.ts`
  - toolbar: `components/SubscriptionRouting.tsx`, `components/SubscriptionAccounts.tsx`, `components/CodexFastMode.tsx` (+ SCSS), `services/api/subscriptionRouting.ts`, `services/api/config.ts`; new `components/QuotaSettingsToolbar.tsx` + `.module.scss`, new hooks `hooks/useSubscriptionRouting.ts`, `hooks/useCodexFastMode.ts`
  - totals: `ledgerModel.ts`, `resetInventory.ts`, `resetActions.ts`; new `quotaTotalsModel.ts`, `components/QuotaTotalsStrip.tsx` + `.module.scss`
  - card: new `compactCardModel.ts`, `components/QuotaCompactCard.tsx` + `.module.scss`, and shared reserve pieces moved out of `components/QuotaLedger.tsx` into a new `components/QuotaReserveVisuals.tsx`
  - reset action: `components/QuotaLedgerResets.tsx` (export the footer and Claude action mount)
  - reserve editor: `features/authFiles/quotaReserve.ts`, `services/api/authFiles.ts` (`patchFields`); new `quotaReserveSave.ts`, `components/QuotaReserveInlineEditor.tsx`
  - retire `components/QuotaCard.tsx` and `QuotaCard.module.scss` from the page; delete them if unused
  - i18n: `src/i18n/locales/{en,ru,zh-CN,zh-TW,vi,ko}.json`
- Related patterns found:
  - pure models + SSR tests with `renderToStaticMarkup`, a stub `quotaFor` and an explicit `now` (`tests/quotaLedger*.test.ts`)
  - API spies (`tests/codexQuotaReset.test.ts`)
  - `data-*` state attributes (`data-resets-chip`, `data-tone`, `data-reserve-badge`, `data-reserve-tick`)
  - provider pill colors from `getTypeColor(providerKey, resolvedTheme)` (`authFiles/constants.ts:160-163`)
- Dependencies identified: the cards depend on the shared reserve visuals and the exported reset pieces. The inline editor depends on `quotaReserveSave.ts`. The page integration depends on all of them.

## Development Approach
- **Testing approach**: TDD. Write failing tests first in each task, then the implementation.
- Complete each task fully before moving to the next.
- Make small, focused changes. Follow AGENTS.md:
  - Bun only, `@/` imports, theme tokens only;
  - all user-facing text in i18n across all six locales;
  - preserve keyboard, focus and reduced-motion handling;
  - single-file build, hash routing.
- **CRITICAL: every task MUST include new/updated tests** for code changes in that task.
  - tests are not optional - they are a required part of the checklist
  - write unit tests for new functions/methods
  - write unit tests for modified functions/methods
  - add new test cases for new code paths
  - update existing test cases if behavior changes
  - tests cover both success and error scenarios
- **CRITICAL: all tests must pass before starting next task** - no exceptions
- **CRITICAL: update this plan file when scope changes during implementation**
- When a source guard listed in Decisions must change, update it in the same task. Keep its intent: equivalent wiring, single hook mount, reload-after-probe. Explain the change in the commit.
- Never spend a live reset during development or verification.

## Testing Strategy
- **Unit tests**: `bun:test` under `tests/`: pure models, SSR rendering with injected `now` and stub data, and source-contract checks. Run focused tests while iterating and `bun run verify` at the end of each task.
- **E2E tests**: none in this project. One-screen fit and interactions are checked manually in Post-Completion.

## Progress Tracking
- Mark completed items with `[x]` immediately when done
- Add newly discovered tasks with ➕ prefix
- Document issues/blockers with ⚠️ prefix
- Update plan if implementation deviates from original scope
- Keep plan in sync with actual work done

## What Goes Where
- **Implementation Steps** (`[ ]` checkboxes): code, tests, docs in this repo
- **Post-Completion** (no checkboxes): browser fit check at 1800×1064, deploy, push

## Decision Log
- 2026-10-08 planning: **accepted** - this reverses "No reserve UI in Cards" and "no editing from the Ledger" from `docs/plans/completed/20261008-quota-reset-expiry-ledger.md`. Reserve editing moves onto the Quota page (in cards), and the Auth Files editor is kept.
- 2026-10-08 planning: **accepted** - Cards becomes the default view, replacing the old Cards implementation. The Cards-mode `QuotaTimeline` is removed.
- 2026-10-08 planning: **accepted** - cards use inline reset confirmation (consistent with the Ledger), so the modal-only guard for Cards in `tests/quotaResetExecution.test.ts` is rewritten.

## Implementation Steps

### Task 1: Extract routing and Fast mode state into hooks
- [x] write failing tests in `tests/quotaSettingsHooks.test.ts` for pure helpers extracted alongside the hooks:
  - the routing load → values/baseline mapping (via the existing `readSubscriptionRouting`)
  - the dirty/patch computation (via the existing `subscriptionRoutingPatch`)
  - TTL validation (`goDurationSeconds`)
  - Fast mode toggle request payload and error mapping (spy on `configApi.updateCodexFastMode`)
- [x] create `src/features/quota/hooks/useSubscriptionRouting.ts` (load guarded by connection revision, values, dirty, `save()` → `subscriptionRoutingApi.update` + `clearCache('routing/strategy')` + `fetchConfig(true)`, error/saved state) and `hooks/useCodexFastMode.ts` (read `config.codexFastMode`, immediate save, error), moving the logic out of `SubscriptionRouting.tsx` / `CodexFastMode.tsx` without behavior change
- [x] make `SubscriptionRouting.tsx` and `CodexFastMode.tsx` use the hooks, so the existing `tests/subscriptionRouting.test.ts` and `tests/codexFastMode.test.ts` keep passing unchanged
- [x] run `bun test tests/quotaSettingsHooks.test.ts tests/subscriptionRouting.test.ts tests/codexFastMode.test.ts` and `bun run verify` - must pass before task 2

### Task 2: One-line settings toolbar
- [x] write failing SSR tests in `tests/quotaSettingsToolbar.test.ts` for `QuotaSettingsToolbar`, rendered with injected hook state through props:
  - strategy select
  - affinity toggle + TTL input
  - Codex and Claude preferred-account selects with masked names and a "last selected" short text (`maskQuotaName` when `showEmails` is false)
  - Fast mode toggle
  - Save disabled when not dirty
  - an invalid TTL error shown inline
  - long hints present as `title` attributes
  - a disabled state when controls are unavailable
- [x] implement `src/features/quota/components/QuotaSettingsToolbar.tsx` + `.module.scss`:
  - a single row that wraps gracefully below about 1400px
  - theme tokens; `Select size="sm"`, `ToggleSwitch`, `Input`
  - a container component wires `useSubscriptionRouting`, `useCodexFastMode` and the existing activity polling (reuse `SubscriptionAccounts` logic or extract its polling into `useSubscriptionActivity`)
- [x] in `QuotaPage.tsx`, replace `<SubscriptionRouting>` + `<CodexFastMode>` with the toolbar in all views, keeping the `key={sessionGeneration}` session reset and the "files only when matching the session" rule
- [x] add the `quota_management.toolbar.*` keys in all six locales; reuse the existing `quota_management.routing.*` / `codex_fast.*` / `config_management.visual.sections.network.*` keys where the text is identical
- [x] run `bun test tests/quotaSettingsToolbar.test.ts tests/subscriptionRouting.test.ts tests/codexFastMode.test.ts tests/vietnameseLocale.test.ts tests/koreanLocale.test.ts` and `bun run verify` - must pass before task 3
- [x] ➕ added a shared `components/ProviderPill.tsx` (Auth Files badge colors via `getTypeColor`) for the toolbar and cards; `SubscriptionRouting.tsx`/`CodexFastMode.tsx` are no longer rendered by the page but stay as hook-backed components with their existing tests (revisit in Task 9)

### Task 3: Totals strip with "Resets held"
- [x] write failing tests in `tests/quotaTotalsModel.test.ts` for `buildQuotaTotals(entries, quotaFor, t, nowMs)`:
  - per provider, primary window totals via `ledgerWindows` + `summarizeLedgerWindows`; Claude yields both 7-day and 7-day Fable, Codex yields weekly
  - `remaining` is null when any row is unknown
  - capacity = rows×100
  - the resets tile sums `countResets(buildResetInventory(...).items)` across codex/claude entries, splits counts per provider, and reports the soonest `expiresAtMs`
  - providers without entries are omitted
  - errors are not counted
- [x] write failing SSR tests in `tests/quotaTotalsStrip.test.ts`:
  - tiles render name, count, total "152% of 200%", segmented bars and the reset line
  - the resets tile shows "8", "2 Claude · 6 Codex" and "next expires 10/22, 19:00 · in 14 days", using `now`
  - no `role="group"`
- [x] implement `src/features/quota/quotaTotalsModel.ts` and `components/QuotaTotalsStrip.tsx` + `.module.scss` (slim tiles, about 90px tall), rendered in Cards view only, above the grid
- [x] add the `quota_management.totals.*` keys in all six locales
- [x] run `bun test tests/quotaTotalsModel.test.ts tests/quotaTotalsStrip.test.ts` and `bun run verify` - must pass before task 4

### Task 4: Shared reserve visuals
- [x] write failing SSR tests in `tests/quotaReserveVisuals.test.ts` (move or duplicate the relevant assertions from `tests/quotaLedgerReserve.test.ts`):
  - `ReserveBadge` states (none / idle soft / held hard with until / held open)
  - `ReserveMeter` renders `data-reserve-tick` at `left: <percent>%` only when the reserve covers that window (`reserveCoversWindow`)
- [x] move `ReserveBadge` and the reserve-aware meter out of `QuotaLedger.tsx` into `components/QuotaReserveVisuals.tsx` (exported). Give `ReserveBadge` an optional `onClick` that renders it as a `<button>`. Make `QuotaLedger.tsx` import them with identical output.
- [x] confirm `tests/quotaLedgerReserve.test.ts` and `tests/quotaLedger.test.ts` still pass with identical markup
- [x] run `bun test tests/quotaReserveVisuals.test.ts tests/quotaLedgerReserve.test.ts tests/quotaLedger.test.ts` and `bun run verify` - must pass before task 5
- [x] ➕ moved the meter/badge rules into `QuotaReserveVisuals.module.scss` and changed Ledger's `.segments .track` to `.segments > *`, since the shared meter's hashed class no longer matches the Ledger module's `.track`; added a button variant of `ReserveBadge` (`onClick`, `aria-expanded`) for the card editor

### Task 5: Compact card model and card display
- [x] write failing tests in `tests/compactCardModel.test.ts` for `buildCompactCardModel(entry, quota, t, nowMs)`:
  - provider, masked/unmasked name
  - plan label (`ledgerPlanLabel`)
  - Codex renewal (`subscriptionActiveUntil` → date + relative) and credit balance/unlimited chips
  - window rows from `ledgerWindows` with remaining%, tone (high/mid/low), reset absolute + relative
  - the reset inventory items (expired dropped, soonest first)
  - states loading / error (masked text) / idle
- [x] write failing SSR tests in `tests/quotaCompactCard.test.ts` with `now` and stub data for one Codex and one Claude card:
  - pill, name, chips including the reserve badge, window rows with mono metas and reserve ticks
  - "Resets expire" box listing every reset with "expires MM/DD, HH:mm · in N days" and `data-soonest` on the first; the GMT label for Codex; Claude rows show the grant label + "1/1"
  - no resets → no box
  - read error → a muted line
  - footer: "Use a reset…" only when resets exist, plus refresh
  - no `role="group"`
- [x] implement `src/features/quota/compactCardModel.ts` and `components/QuotaCompactCard.tsx` + `QuotaCompactCard.module.scss`. Imitate the Auth Files card language: 14px radius card, provider pill via `getTypeColor`, 11.5px mono metas, quota box, 4px bars. Use theme tokens only; no `bindQuotaClasses`; `data-*` states.
- [x] add the `quota_management.compact.*` display keys in all six locales
- [x] run `bun test tests/compactCardModel.test.ts tests/quotaCompactCard.test.ts` and `bun run verify` - must pass before task 6
- [x] ➕ the footer "Use a reset…" action is a `resetAction` slot filled in Task 6; the card also takes `onReserveClick`/`reserveEditor`/`reservePreview` slots for Task 7

### Task 6: Inline "Use a reset" in the card
- [ ] write failing SSR tests:
  - Codex card: after the initial "Use a reset…" the action is built with `codexResetAction` (busy/blocked props), and the confirm step text is reused from the Ledger
  - Claude card: the action mount component (from `QuotaLedgerResets.tsx`) is rendered only when the card's action is open
  - the unresolved-claim state shows "Reset outcome unknown" and keeps the action reachable (`resetGrantOperations.hasUnresolved(claudeResetOperationKey(...))`)
  - while resetting, refresh is disabled and the card has `aria-busy`
- [ ] in `QuotaLedgerResets.tsx`, export `ResetActionFooter`, and extract the open-only Claude mount into an exported component used by both `ClaudeLedgerResetsDrawer` and the card. Keep exactly one `= useClaudeResetGrants(` in the file, as the existing guard requires.
- [ ] wire the card footer:
  - Codex → `performReset(entry.file, QUOTA_ADAPTERS.codex)`
  - Claude → the shared mount, `onRefresh` → `refreshQuota`, `onBusyChange` lifted to the card
  - focus returns to "Use a reset…" after cancel or finish; Esc cancels
- [ ] run `bun test tests/quotaCompactCard.test.ts tests/quotaLedgerResets.test.ts tests/claudeResetGrants.test.ts` and `bun run verify` - must pass before task 7

### Task 7: Inline reserve editor in the card
- [ ] write failing tests in `tests/quotaReserveSave.test.ts` for `saveQuotaReserve({ file, draft, revision }, deps)`. Spy on `authFilesApi.patchFields` and inject `reloadReserveVerdicts` and a revision check.
  - enabling sends `{quota_reserve:{percent,mode}}`
  - disabling a stored reserve sends `{quota_reserve:null}`, even when the stored value was invalid
  - an unchanged draft sends nothing
  - invalid percent → validation error, no request
  - a connection-revision change after the await → no reload
  - a 400 → an error result with the message
  - success → `reloadReserveVerdicts` called once, the quota cache is not cleared
- [ ] write failing SSR tests in `tests/quotaReserveInlineEditor.test.ts`:
  - the editor renders percent input, soft/hard select with the hint, Save/Cancel, and Remove when a reserve exists
  - validation message
  - the card shows a clickable reserve badge, or "Set reserve…" for codex/claude without a reserve, and nothing for other providers
  - the meter ticks preview the draft percent while editing
- [ ] implement `src/features/quota/quotaReserveSave.ts` (reuse `readQuotaReserveDraft`, `quotaReserveError`, `buildQuotaReservePatch`) and `components/QuotaReserveInlineEditor.tsx` (compact, SSR-safe). Integrate it into `QuotaCompactCard` with a local `editing` state. Esc and Cancel close it, and focus returns to the chip.
- [ ] add the `quota_management.reserve.editor.*` keys in all six locales. Leave the Auth Files editor (`AuthFileQuotaReserveField`) and its tests untouched.
- [ ] run `bun test tests/quotaReserveSave.test.ts tests/quotaReserveInlineEditor.test.ts tests/authFilesQuotaReserve.test.ts` and `bun run verify` - must pass before task 8

### Task 8: Page integration — Cards becomes the compact grid and the default view
- [ ] write failing tests:
  - `tests/quotaUiState.test.ts` (or the existing suite): default view `'cards'` when nothing is stored, and a stored view is still respected
  - a source/SSR test that Cards mode renders `QuotaTotalsStrip` + the `QuotaCompactCard` grid and no `QuotaTimeline`
- [ ] in `QuotaPage.tsx`:
  - set the default view to `'cards'`
  - render the compact grid in Cards mode with `quotaFor`, `showEmails`, `resettingKeys`, `performReset`, `refreshQuota`, `reloadReserveVerdicts`, `now` and the session guards; keep pagination
  - remove the Cards-mode `QuotaTimeline`
  - grid CSS `repeat(auto-fill, minmax(380px, 1fr))` with `align-items: start` (4 columns at 1800px with the sidebar collapsed)
- [ ] retire `QuotaCard.tsx` (and `QuotaCard.module.scss` if unused). Rewrite the guards that referenced it, keeping their intent:
  - `tests/claudeResetGrants.test.ts` QuotaCard strings → the equivalent card wiring (blocked state and confirm through the shared mount)
  - `tests/quotaResetExecution.test.ts` modal `onReset` guard → the card uses `performReset`; the hook still keeps `showConfirmation({` for any remaining modal caller
  - keep every other `tests/quotaLedgerResets.test.ts` page guard valid (`afterQuotaProbe`, Refresh-All reload, `initialLoading`)
- [ ] keep the search/sort toolbar markup and SCSS required by `tests/quotaToolbar.test.ts` and `tests/providerTabsOverflow.test.ts`
- [ ] run `bun test` (full) and `bun run verify` - must pass before task 9

### Task 9: Verify acceptance criteria
- [ ] verify every Overview requirement:
  - toolbar replaces both blocks in all views with unchanged save semantics
  - totals strip with resets tile
  - compact cards with chips, windows, ticks, resets box, inline use, refresh
  - inline reserve editor; Auth Files editor still works
  - Cards is the default
  - Ledger and Timeline unaffected
- [ ] verify the edge cases:
  - masking with emails hidden
  - quota loading/error states
  - Claude grant read failure
  - unresolved Claude claim
  - provider without reset support
  - reserve on an unsupported provider hidden
  - a stored invalid reserve can be removed
  - the toolbar wraps on narrow widths and is usable at ≤700px
- [ ] run `bun run verify` - tests + lint + build must pass. Fix lint errors and any new warnings in changed files.
- [ ] confirm every new module has tests that cover its success and error branches: the hooks' pure helpers, the toolbar, `quotaTotalsModel`, the strip, `compactCardModel`, the card, `quotaReserveSave` and the inline editor

### Task 10: [Final] Update documentation
- [ ] update `README.md` and `README_CN.md` (Quotas rows at about :76-77): a compact default Cards view, the settings toolbar, and reserve editing on the Quota page as well as in Auth Files
- [ ] update `AGENTS.md` only if a new pattern needs documenting (for example "Quota cards are built from pure models with their own SCSS; do not bind QuotaBody classes there"). Sync the local `CLAUDE.md` if present.

## Technical Details
- **Layout budget at 1800×1064**:

  | part | height |
  |---|---|
  | header | ≈ 40 |
  | toolbar | ≈ 50 |
  | tabs + search/sort | ≈ 44 |
  | totals strip | ≈ 90 |
  | card row | ≈ 250–290 |

  Today's 4 accounts take about 580px, with gaps of 12–14px.
- **Compact card model**: `{ provider, name, enabled, plan?, chips: Chip[], windows: { id, label, remaining|null, tone, resetAbs, resetRel, reserveTick?: number }[], resets: ResetInventoryItem[], resetsError?, state: 'idle'|'loading'|'success'|'error', error? }`. Chips: plan; Codex renewal and credits; reserve (badge component).
- **Inline reserve save**: `buildQuotaReservePatch(original, draft)`, where `original` is derived from `file.quotaReserve`. When the draft is disabled and the file had a reserve, force `{quota_reserve: null}`. Then `authFilesApi.patchFields(file.name, patch)`, then (if the revision is unchanged) `reloadReserveVerdicts()`.
- **Claude action**: mount `useClaudeResetGrants` (through the shared component in `QuotaLedgerResets.tsx`) only while the card's action is open. Gather unresolved claims via `resetGrantOperations.hasUnresolved`.
- **i18n namespaces** (all six locales):
  - `quota_management.toolbar.*`
  - `quota_management.totals.*`
  - `quota_management.compact.*`
  - `quota_management.reserve.editor.*`

## Post-Completion
*Items requiring manual intervention or external systems - no checkboxes, informational only*

**Manual verification**
- Run `bun run dev` against `http://127.0.0.1:8317`, or deploy. At 1800×1064 with the sidebar collapsed, the Cards view with today's 4 accounts must fit one screen without scrolling.
- Toolbar: change the strategy and TTL, then Save. Fast mode toggles immediately. Last selected updates within about 10 s.
- Cards:
  - the resets box shows all resets
  - open "Use a reset…" up to the confirm step, then press **Cancel**; never spend a live reset
- Reserve:
  - set a reserve via the card editor and check the badge and ticks
  - edit it in Auth Files and see the change reflected
  - remove it from the card
- Check Ledger and Timeline still look as before.

**Deployment**
- `bun run build`, back up `~/Library/Application Support/CLIProxyAPI/static/management.html`, copy `dist/index.html`. Push the fork's `main` on request.
