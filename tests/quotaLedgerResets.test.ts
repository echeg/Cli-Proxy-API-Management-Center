import { beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18n from '@/i18n';
import type { ClaudeQuotaState, CodexQuotaState } from '@/types';
import type { AnthropicResetGrant } from '@/services/api/claudeResetGrants';
import { QuotaLedger } from '@/features/quota/components/QuotaLedger';
import {
  QuotaLedgerResetsChip,
  QuotaLedgerResetsConfirm,
  QuotaLedgerResetsDrawer,
} from '@/features/quota/components/QuotaLedgerResets';
import {
  claudeResetAction,
  codexResetAction,
  type ClaudeResetHandle,
  type ResetAction,
} from '@/features/quota/resetActions';
import type { QuotaFileEntry } from '@/features/quota/logic';
import type { QuotaCardState } from '@/features/quota/providers';
import { buildResetInventory } from '@/features/quota/resetInventory';
import { buildResetDisplay } from '@/utils/quota';

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

// Far future so nothing depends on the real clock; `bun test` runs in UTC.
const now = Date.UTC(2100, 9, 8, 12);
const DAY = 24 * 60 * 60 * 1000;

const codexQuota = (
  credits: Array<{ id: string; expiresAt: string; title?: string }>,
  extra: Partial<CodexQuotaState> = {}
): CodexQuotaState => ({
  status: 'success',
  windows: [
    {
      id: 'weekly',
      label: 'Weekly limit',
      usedPercent: 10,
      resetLabel: '-',
      resetAtMs: now + 2 * DAY,
    },
  ],
  rateLimitResetCredits: credits.map((credit) => ({ status: 'available', ...credit })),
  ...extra,
});

const grant = (overrides: Partial<AnthropicResetGrant> = {}): AnthropicResetGrant => ({
  id: 'grant-launch',
  label: 'Claude Opus 5.5 launch: one usage-limit reset for Pro and Max',
  resetsTotal: 1,
  resetsLeft: 1,
  startsAt: null,
  endsAt: '2100-10-22T16:00:00Z',
  clears: ['five_hour', 'seven_day'],
  paused: false,
  usableNow: true,
  useRequiresLimit: false,
  percentUsed: {},
  ...overrides,
});

const claudeQuota = (
  grants: AnthropicResetGrant[] | null,
  extra: Partial<ClaudeQuotaState> = {}
): ClaudeQuotaState => ({
  status: 'success',
  planType: 'plan_max',
  windows: [
    {
      id: 'seven-day',
      label: '7-day limit',
      usedPercent: 20,
      resetLabel: '-',
      resetAtMs: now + 3 * DAY,
      periodHours: 168,
    },
  ],
  resetGrants: grants,
  ...extra,
});

const TWO_CODEX = [
  { id: 'credit-b', expiresAt: '2100-10-29T09:00:00Z', title: 'Full reset' },
  { id: 'credit-a', expiresAt: '2100-10-23T09:30:00Z', title: 'Full reset' },
];

const renderLedger = (
  rows: Array<{ type: 'codex' | 'claude' | 'kimi'; name: string; quota: unknown }>,
  options: { showEmails?: boolean; resettingKey?: string | null } = {}
) => {
  const entries: QuotaFileEntry[] = rows.map((row) => ({
    type: row.type,
    file: { name: row.name, type: row.type },
  })) as QuotaFileEntry[];
  return renderToStaticMarkup(
    createElement(QuotaLedger, {
      entries,
      summaryEntries: entries,
      quotaFor: (entry: QuotaFileEntry) =>
        rows[entries.indexOf(entry)].quota as QuotaCardState | undefined,
      resolvedTheme: 'light',
      showEmails: options.showEmails ?? true,
      canRefresh: true,
      onRefresh: () => {},
      onReset: () => {},
      resettingKey: options.resettingKey ?? null,
      now,
    })
  );
};

const chipOf = (markup: string): string | null => {
  const match = markup.match(/<button[^>]*data-resets-chip[^>]*>[\s\S]*?<\/button>/);
  return match ? match[0] : null;
};

describe('Ledger resets chip', () => {
  test('counts Codex resets and names the soonest expiry', () => {
    const chip = chipOf(
      renderLedger([{ type: 'codex', name: 'codex-a.json', quota: codexQuota(TWO_CODEX) }])
    );
    expect(chip).not.toBeNull();
    expect(chip).toContain('2 resets · next expires 10/23');
    expect(chip).toContain('aria-expanded="false"');
    expect(chip).toContain('aria-controls="');
    // The title lists every expiry, soonest first.
    const title = chip!.match(/title="([^"]*)"/)?.[1] ?? '';
    expect(title.indexOf('10/23')).toBeGreaterThan(-1);
    expect(title.indexOf('10/23')).toBeLessThan(title.indexOf('10/29'));
  });

  test('uses the singular form for one Claude grant', () => {
    const chip = chipOf(
      renderLedger([{ type: 'claude', name: 'claude-a.json', quota: claudeQuota([grant()]) }])
    );
    expect(chip).toContain('1 reset · expires 10/22');
  });

  test('turns amber only when the soonest reset expires within three days', () => {
    const soon = renderLedger([
      {
        type: 'codex',
        name: 'codex-a.json',
        quota: codexQuota([{ id: 'c', expiresAt: new Date(now + 3 * DAY).toISOString() }]),
      },
    ]);
    expect(chipOf(soon)).toContain('data-tone="warn"');
    const later = renderLedger([
      {
        type: 'codex',
        name: 'codex-a.json',
        quota: codexQuota([{ id: 'c', expiresAt: new Date(now + 3 * DAY + 60_000).toISOString() }]),
      },
    ]);
    expect(chipOf(later)).not.toBeNull();
    expect(chipOf(later)).not.toContain('data-tone="warn"');
  });

  test('renders no chip without resets or for other providers', () => {
    expect(
      chipOf(renderLedger([{ type: 'codex', name: 'codex-a.json', quota: codexQuota([]) }]))
    ).toBeNull();
    expect(
      chipOf(renderLedger([{ type: 'claude', name: 'claude-a.json', quota: claudeQuota([]) }]))
    ).toBeNull();
    expect(
      chipOf(
        renderLedger([
          {
            type: 'kimi',
            name: 'kimi-a.json',
            quota: { status: 'success', rows: [], rateLimitResetCredits: TWO_CODEX },
          },
        ])
      )
    ).toBeNull();
    expect(
      chipOf(renderLedger([{ type: 'codex', name: 'codex-a.json', quota: { status: 'loading' } }]))
    ).toBeNull();
  });

  test('shows a muted line when the resets could not be read', () => {
    const markup = renderLedger([
      {
        type: 'claude',
        name: 'claude-a.json',
        quota: claudeQuota(null, { resetGrantsError: 'grants failed for alice@example.com' }),
      },
    ]);
    expect(chipOf(markup)).toBeNull();
    expect(markup).toContain('Couldn&#x27;t load resets');
    expect(markup).toContain('grants failed for alice@example.com');
  });

  test('masks reset error details when emails are hidden', () => {
    const markup = renderLedger(
      [
        {
          type: 'codex',
          name: 'codex-alice@example.com.json',
          quota: codexQuota([], {
            rateLimitResetCreditsError: 'credits failed for alice@example.com',
          }),
        },
      ],
      { showEmails: false }
    );
    expect(markup).toContain('Couldn&#x27;t load resets');
    expect(markup).not.toContain('alice@example.com');
    expect(markup).toContain('a•••@e•••.com');
  });

  test('keeps the toggle of an open drawer through a refresh', () => {
    const chip = (expanded: boolean) =>
      renderToStaticMarkup(
        createElement(QuotaLedgerResetsChip, {
          inventory: null,
          expanded,
          loading: true,
          controls: 'drawer-1',
          showEmails: true,
          now,
          onToggle: () => {},
        })
      );
    expect(chip(false)).toBe('');
    expect(chip(true)).toContain('aria-expanded="true"');
    expect(chip(true)).toContain('aria-controls="drawer-1"');
    expect(chip(true)).toContain('Loading…');
  });

  test('adds no role="group" beyond the summary windows', () => {
    const markup = renderLedger([
      { type: 'codex', name: 'codex-a.json', quota: codexQuota(TWO_CODEX) },
      { type: 'claude', name: 'claude-a.json', quota: claudeQuota([grant()]) },
    ]);
    // One summary window per provider, as without resets.
    expect(markup.match(/role="group"/g)).toHaveLength(2);
  });
});

describe('Ledger resets drawer', () => {
  const renderDrawer = (
    provider: 'codex' | 'claude',
    quota: unknown,
    options: { showEmails?: boolean; loading?: boolean } = {}
  ) =>
    renderToStaticMarkup(
      createElement(QuotaLedgerResetsDrawer, {
        id: 'drawer-1',
        provider,
        inventory: buildResetInventory(provider, quota, now),
        loading: options.loading ?? false,
        showEmails: options.showEmails ?? true,
        now,
      })
    );

  test('lists every Codex reset with its expiry and the soonest tag', () => {
    const markup = renderDrawer('codex', codexQuota(TWO_CODEX));
    expect(markup).toContain('id="drawer-1"');
    expect(markup).not.toContain('role="group"');
    expect(markup).toMatch(/Resets<\/[a-z]+>\s*<span[^>]*>2<\/span>/);
    expect(markup).toContain('Unused resets are lost when they expire');
    expect(markup.match(/<li/g)).toHaveLength(2);
    expect(markup.match(/Full reset/g)).toHaveLength(2);
    expect(markup.match(/soonest/g)).toHaveLength(1);
    expect(markup.indexOf('soonest')).toBeLessThan(markup.indexOf('10/29'));
    const first = buildResetDisplay(null, Date.parse('2100-10-23T09:30:00Z'), now, 'en')!;
    expect(markup).toContain(`expires ${first.absolute} · ${first.relative}`);
    expect(first.relative).toBe('in 14 days');
    expect(markup).toContain('OpenAI chooses which reset is redeemed');
    expect(markup).toMatch(/<button[^>]*>(<span>)?Use a reset…/);
    // Reset lines are information, not controls.
    expect(markup.match(/<button/g)).toHaveLength(1);
  });

  test('describes a Claude grant with its count and cleared windows', () => {
    const markup = renderDrawer('claude', claudeQuota([grant()]));
    expect(markup).toContain('Claude Opus 5.5 launch: one usage-limit reset for Pro and Max');
    expect(markup).toContain('1 of 1 left · clears 5-hour + 7-day');
    expect(markup).not.toContain('OpenAI chooses');
    expect(markup).toMatch(/Resets<\/[a-z]+>\s*<span[^>]*>1<\/span>/);
  });

  test('puts an open-ended Claude grant last and says it has no expiry', () => {
    const markup = renderDrawer(
      'claude',
      claudeQuota([grant({ id: 'open', label: 'Open grant', endsAt: null }), grant()])
    );
    expect(markup.indexOf('Claude Opus 5.5 launch')).toBeLessThan(markup.indexOf('Open grant'));
    expect(markup).toContain('No expiry');
  });

  test('masks emails in reset labels when emails are hidden', () => {
    const markup = renderDrawer(
      'claude',
      claudeQuota([grant({ label: 'Grant for alice@example.com' })]),
      { showEmails: false }
    );
    expect(markup).not.toContain('alice@example.com');
    expect(markup).toContain('Grant for a•••@e•••.com');
  });

  test('shows a loading line during a refresh instead of closing', () => {
    const markup = renderDrawer('codex', { status: 'loading' }, { loading: true });
    expect(markup).toContain('id="drawer-1"');
    expect(markup).toContain('Loading…');
    expect(markup).not.toContain('Use a reset…');
  });

  test('reports a failed read inside the drawer', () => {
    const markup = renderDrawer(
      'codex',
      codexQuota([], { rateLimitResetCreditsError: 'credits failed' })
    );
    expect(markup).toContain('Couldn&#x27;t load resets');
    expect(markup).not.toContain('Use a reset…');
  });
});

const t = i18n.t.bind(i18n);
const noop = () => {};

const claudeHandle = (overrides: Partial<ClaudeResetHandle> = {}): ClaudeResetHandle => ({
  blocked: false,
  busy: false,
  message: '',
  buttonLabel: 'use',
  confirmMessage: 'fresh confirmation from the hook',
  count: 1,
  selectedGrant: grant(),
  execute: async () => {},
  ...overrides,
});

const renderConfirm = (action: ResetAction, busy = action.busy) =>
  renderToStaticMarkup(
    createElement(QuotaLedgerResetsConfirm, {
      consequence: action.consequence,
      note: action.note,
      confirmLabel: action.confirmLabel,
      busy,
      onConfirm: noop,
      onCancel: noop,
    })
  );

describe('Ledger inline reset confirmation', () => {
  test('explains what a Codex reset does and how many remain', () => {
    const action = codexResetAction(t, 2, { blocked: false, busy: false, onConfirm: noop })!;
    expect(action.consequence).toBe(
      'OpenAI redeems one of your 2 resets; your Codex rate limits are cleared and the proxy ' +
        'cooldown for this account is cleared'
    );
    expect(action.note).toBe("This can't be undone · 1 reset will remain");
    expect(action.label).toBe('Use a reset…');
    const markup = renderConfirm(action);
    expect(markup).toContain('OpenAI redeems one of your 2 resets');
    expect(markup).toContain('This can&#x27;t be undone · 1 reset will remain');
    expect(markup).toMatch(/<button[^>]*>(<span>)?Cancel/);
    expect(markup).toMatch(/<button[^>]*>(<span>)?Use 1 reset/);
    expect(markup).not.toContain('disabled');
    expect(markup).not.toContain('role="group"');
  });

  test('words the last Codex reset and the remaining count', () => {
    const one = codexResetAction(t, 1, { blocked: false, busy: false, onConfirm: noop })!;
    expect(one.consequence).toContain('OpenAI redeems your last reset');
    expect(one.note).toBe("This can't be undone · no resets will remain");
    const three = codexResetAction(t, 3, { blocked: false, busy: false, onConfirm: noop })!;
    expect(three.note).toBe("This can't be undone · 2 resets will remain");
  });

  test('offers no Codex action without resets', () => {
    expect(codexResetAction(t, 0, { blocked: false, busy: false, onConfirm: noop })).toBeNull();
  });

  test('names the Claude grant, its expiry and the windows it clears', () => {
    const action = claudeResetAction(t, claudeHandle(), { showEmails: true });
    expect(action.consequence).toBe(
      'Spends 1 reset from Claude Opus 5.5 launch: one usage-limit reset for Pro and Max ' +
        '(expires 10/22); clears 5-hour and 7-day limits'
    );
    expect(action.note).toBe("This can't be undone · no resets will remain");
    expect(action.confirmLabel).toBe('Use 1 reset');
    expect(action.label).toBe('Use a reset…');
    expect(action.blocked).toBe(false);
  });

  test('masks the Claude grant label when emails are hidden', () => {
    const action = claudeResetAction(
      t,
      claudeHandle({
        count: 2,
        selectedGrant: grant({ label: 'Grant for alice@example.com', endsAt: null, clears: [] }),
      }),
      { showEmails: false }
    );
    expect(action.consequence).toBe(
      'Spends 1 reset from Grant for a•••@e•••.com; clears eligible usage limits'
    );
    expect(action.note).toBe("This can't be undone · 1 reset will remain");
  });

  test('joins any number of cleared Claude windows', () => {
    const consequence = (clears: AnthropicResetGrant['clears']) =>
      claudeResetAction(t, claudeHandle({ selectedGrant: grant({ clears }) }), {
        showEmails: true,
      }).consequence;
    expect(consequence(['five_hour'])).toEndWith('; clears 5-hour limits');
    expect(consequence(['five_hour', 'seven_day', 'seven_day_overage_included'])).toEndWith(
      '; clears 5-hour, 7-day and 7-day incl. overage limits'
    );
  });

  test('retries an unknown Claude outcome with the hook confirmation', () => {
    const action = claudeResetAction(
      t,
      claudeHandle({
        buttonLabel: 'retry',
        message: 'unknown',
        confirmMessage: 'retry confirmation from the hook',
        selectedGrant: undefined,
      }),
      { showEmails: true }
    );
    expect(action.consequence).toBe('retry confirmation from the hook');
    expect(action.note).toBeUndefined();
    expect(action.label).toBe('Retry the same claim');
    expect(action.confirmLabel).toBe('Retry the same claim');
    expect(action.reason).toBe(t('claude_reset.unknown'));
  });

  test('a blocked Claude action carries its reason', () => {
    const action = claudeResetAction(
      t,
      claudeHandle({ blocked: true, message: 'expired', buttonLabel: 'retry' }),
      { showEmails: true }
    );
    expect(action.blocked).toBe(true);
    expect(action.reason).toBe(t('claude_reset.expired'));
  });

  test('the Claude action spends through the hook execute()', async () => {
    let calls = 0;
    const action = claudeResetAction(
      t,
      claudeHandle({
        execute: async () => {
          calls += 1;
        },
      }),
      { showEmails: true }
    );
    await action.onConfirm();
    expect(calls).toBe(1);
  });

  test('a busy reset shows progress with both buttons disabled', () => {
    const action = codexResetAction(t, 2, { blocked: false, busy: true, onConfirm: noop })!;
    const markup = renderConfirm(action);
    expect(markup).toContain('Using reset…');
    expect(markup).not.toContain('Use 1 reset');
    expect(markup.match(/<button[^>]*disabled=""/g)).toHaveLength(2);
  });
});

describe('Ledger drawer reset action', () => {
  const renderWithAction = (
    provider: 'codex' | 'claude',
    quota: unknown,
    action: ResetAction | null
  ) =>
    renderToStaticMarkup(
      createElement(QuotaLedgerResetsDrawer, {
        id: 'drawer-1',
        provider,
        inventory: buildResetInventory(provider, quota, now),
        loading: false,
        showEmails: true,
        now,
        action,
      })
    );

  test('an available action enables "Use a reset…"', () => {
    const markup = renderWithAction(
      'codex',
      codexQuota(TWO_CODEX),
      codexResetAction(t, 2, { blocked: false, busy: false, onConfirm: noop })
    );
    const use = markup.match(/<button[^>]*data-resets-use[^>]*>/)?.[0];
    expect(use).toBeDefined();
    expect(use).not.toContain('disabled');
  });

  test('a blocked Claude action shows its reason inline and disables the button', () => {
    const markup = renderWithAction(
      'claude',
      claudeQuota([grant()]),
      claudeResetAction(t, claudeHandle({ blocked: true, message: 'read_error' }), {
        showEmails: true,
      })
    );
    expect(markup).toContain(t('claude_reset.read_error'));
    expect(markup.match(/<button[^>]*data-resets-use[^>]*>/)?.[0]).toContain('disabled');
  });

  test('an unknown Claude outcome offers the same-claim retry', () => {
    const markup = renderWithAction(
      'claude',
      claudeQuota([grant()]),
      claudeResetAction(t, claudeHandle({ buttonLabel: 'retry', message: 'unknown' }), {
        showEmails: true,
      })
    );
    expect(markup).toMatch(/<button[^>]*data-resets-use[^>]*>(<span>)?Retry the same claim/);
    expect(markup).not.toContain('Use a reset…');
  });

  test('a reset in flight shows the busy confirmation in the drawer', () => {
    const markup = renderWithAction(
      'codex',
      codexQuota(TWO_CODEX),
      codexResetAction(t, 2, { blocked: false, busy: true, onConfirm: noop })
    );
    expect(markup).toContain('Using reset…');
    expect(markup.match(/<button[^>]*disabled=""/g)).toHaveLength(2);
  });

  test('a Codex drawer without resets has no action', () => {
    const markup = renderWithAction(
      'codex',
      codexQuota([]),
      codexResetAction(t, 0, { blocked: false, busy: false, onConfirm: noop })
    );
    expect(markup).toContain('No resets left');
    expect(markup).not.toContain('data-resets-use');
  });
});

describe('Ledger reset wiring', () => {
  test('a row whose reset is in flight cannot be refreshed', () => {
    const refreshButton = (markup: string) =>
      markup.match(/<button[^>]*aria-label="Refresh quota for codex-a.json"[^>]*>/)?.[0] ?? '';
    const rows = [{ type: 'codex' as const, name: 'codex-a.json', quota: codexQuota(TWO_CODEX) }];
    expect(refreshButton(renderLedger(rows))).not.toContain('disabled');
    expect(refreshButton(renderLedger(rows, { resettingKey: 'codex-a.json' }))).toContain(
      'disabled'
    );
  });

  test('the Quota page passes the inline reset flow to the Ledger', () => {
    const page = readFileSync('src/features/quota/QuotaPage.tsx', 'utf8');
    const ledger = page.slice(
      page.indexOf('<QuotaLedger'),
      page.indexOf('/>', page.indexOf('<QuotaLedger'))
    );
    expect(ledger).toContain('performReset(entry.file, QUOTA_ADAPTERS[entry.type])');
    expect(ledger).toContain('resettingKey={resettingQuotaName}');
    expect(ledger).toContain('refreshQuota(entry.file, QUOTA_ADAPTERS[entry.type])');
  });

  test('the confirm step focuses Cancel, cancels on Esc and returns focus to the button', () => {
    const resets = readFileSync('src/features/quota/components/QuotaLedgerResets.tsx', 'utf8');
    expect(resets).toContain("querySelector<HTMLButtonElement>('[data-resets-cancel]')?.focus()");
    expect(resets).toContain("event.key !== 'Escape' || busy");
    expect(resets).toContain("querySelector<HTMLButtonElement>('[data-resets-use]')?.focus()");
  });

  test('the Claude hook is mounted only by the open drawer', () => {
    const ledger = readFileSync('src/features/quota/components/QuotaLedger.tsx', 'utf8');
    const resets = readFileSync('src/features/quota/components/QuotaLedgerResets.tsx', 'utf8');
    expect(ledger).not.toContain('useClaudeResetGrants(');
    expect(resets.match(/= useClaudeResetGrants\(/g)).toHaveLength(1);
    expect(ledger).toMatch(/resetsOpen &&[\s\S]*ClaudeLedgerResetsDrawer/);
  });
});
