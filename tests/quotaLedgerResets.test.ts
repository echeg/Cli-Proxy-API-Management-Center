import { beforeAll, describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18n from '@/i18n';
import type { ClaudeQuotaState, CodexQuotaState } from '@/types';
import type { AnthropicResetGrant } from '@/services/api/claudeResetGrants';
import { QuotaLedger } from '@/features/quota/components/QuotaLedger';
import {
  QuotaLedgerResetsChip,
  QuotaLedgerResetsDrawer,
} from '@/features/quota/components/QuotaLedgerResets';
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
  options: { showEmails?: boolean } = {}
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
