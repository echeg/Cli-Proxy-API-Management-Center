import { beforeAll, describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18n from '@/i18n';
import { QuotaTotalsStrip } from '@/features/quota/components/QuotaTotalsStrip';
import type { QuotaTotals } from '@/features/quota/quotaTotalsModel';

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

// Far-future instants keep relative labels stable regardless of the frozen SSR clock.
const now = Date.UTC(2036, 9, 8, 12);
const day = 86_400_000;

const totals: QuotaTotals = {
  tiles: [
    {
      provider: 'claude',
      windowId: 'seven-day',
      label: '7-day limit',
      credentialCount: 2,
      remaining: 152,
      capacity: 200,
      segments: [97, 55],
      resetAtMs: now + 5 * day,
    },
    {
      provider: 'codex',
      windowId: 'weekly',
      label: 'Weekly limit',
      credentialCount: 2,
      remaining: null,
      capacity: 200,
      segments: [70, null],
      resetAtMs: null,
    },
  ],
  resets: { total: 8, byProvider: { claude: 2, codex: 6 }, soonestMs: now + 14 * day },
};

const render = (value: QuotaTotals = totals) =>
  renderToStaticMarkup(createElement(QuotaTotalsStrip, { totals: value, now }));

describe('quota totals strip', () => {
  test('renders one tile per provider window with totals and segments', () => {
    const markup = render();
    expect(markup).toContain('data-quota-totals');
    expect(markup).toContain('7-day limit');
    expect(markup).toContain('152%');
    expect(markup).toContain(i18n.t('quota_management.totals.of_capacity', { capacity: 200 }));
    expect(markup.match(/data-total-segment/g)).toHaveLength(4);
    expect(markup).toContain('in 5 days');
    expect(markup).not.toContain('role="group"');
  });

  test('shows unknown totals as a dash, never as zero', () => {
    const markup = render();
    expect(markup).toContain('data-total-unknown');
    expect(markup).not.toContain('>0%<');
  });

  test('summarises held resets with the soonest expiry', () => {
    const markup = render();
    expect(markup).toContain(i18n.t('quota_management.totals.resets_title'));
    expect(markup).toContain('>8<');
    expect(markup).toContain(
      i18n.t('quota_management.totals.resets_split', { claude: 2, codex: 6 })
    );
    expect(markup).toContain('in 14 days');
  });

  test('omits the resets tile when nothing is held and renders nothing without data', () => {
    expect(render({ ...totals, resets: null })).not.toContain(
      i18n.t('quota_management.totals.resets_title')
    );
    expect(render({ tiles: [], resets: null })).toBe('');
  });
});
