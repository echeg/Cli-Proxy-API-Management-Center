import { beforeAll, describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18n from '@/i18n';
import type { AuthFileItem } from '@/types';
import { ReserveBadge, ReserveMeter } from '@/features/quota/components/QuotaReserveVisuals';

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

const file = (patch: Partial<AuthFileItem> = {}) =>
  ({ name: 'claude-a.json', type: 'claude', ...patch }) as AuthFileItem;

const badge = (props: Record<string, unknown>) =>
  renderToStaticMarkup(createElement(ReserveBadge, props as never));

describe('shared reserve visuals', () => {
  test('renders nothing without a reserve', () => {
    expect(badge({ file: file() })).toBe('');
  });

  test('an idle reserve is a muted badge naming percent and mode', () => {
    const markup = badge({ file: file({ quotaReserve: { percent: 25, mode: 'soft' } }) });
    expect(markup).toContain('data-reserve-badge');
    expect(markup).not.toContain('data-tone="warn"');
    expect(markup).toContain('25%');
    expect(markup).toContain(i18n.t('quota_management.reserve.mode_soft'));
  });

  test('an active hard reserve reads as held until its reset', () => {
    const markup = badge({
      file: file({
        quotaReserve: { percent: 40, mode: 'hard' },
        quotaReserveActive: true,
        quotaReserveUntil: '2036-10-14T06:01:00Z',
      }),
    });
    expect(markup).toContain('data-tone="warn"');
    expect(markup).toContain(i18n.t('quota_management.reserve.mode_hard'));
  });

  test('an active reserve without an expiry still reads as held', () => {
    const markup = badge({
      file: file({ quotaReserve: { percent: 40, mode: 'soft' }, quotaReserveActive: true }),
    });
    expect(markup).toContain(
      i18n.t('quota_management.reserve.badge_held_open', {
        mode: i18n.t('quota_management.reserve.mode_soft'),
      })
    );
  });

  test('becomes a button when it opens an editor', () => {
    const markup = badge({
      file: file({ quotaReserve: { percent: 25, mode: 'soft' } }),
      onClick: () => {},
    });
    expect(markup).toMatch(/^<button[^>]*type="button"[^>]*data-reserve-badge/);
    expect(badge({ file: file({ quotaReserve: { percent: 25, mode: 'soft' } }) })).toMatch(
      /^<span/
    );
  });

  test('meter ticks the reserve only on windows the verdict reads', () => {
    const meter = (provider: string, windowId: string, reserve?: number) =>
      renderToStaticMarkup(
        createElement(ReserveMeter, { remaining: 64, provider, windowId, reserve } as never)
      );
    expect(meter('claude', 'seven-day', 40)).toContain('left:40%');
    expect(meter('claude', 'seven-day-fable', 40)).not.toContain('data-reserve-tick');
    expect(meter('codex', 'weekly', 30)).toContain('data-reserve-tick');
    expect(meter('claude', 'seven-day')).not.toContain('data-reserve-tick');
    expect(meter('claude', 'seven-day', 40)).toContain('width:64%');
  });
});
