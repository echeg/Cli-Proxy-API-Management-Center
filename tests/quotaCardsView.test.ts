import { describe, expect, test } from 'bun:test';
import { readFileSync, existsSync } from 'node:fs';
import { DEFAULT_QUOTA_VIEW_MODE, QUOTA_VIEW_MODES } from '@/features/quota/constants';

const page = readFileSync('src/features/quota/QuotaPage.tsx', 'utf8');
const styles = readFileSync('src/features/quota/QuotaPage.module.scss', 'utf8');

describe('compact Cards view', () => {
  test('Cards is the default view when no choice is stored', () => {
    expect(DEFAULT_QUOTA_VIEW_MODE).toBe('cards');
    expect(QUOTA_VIEW_MODES).toContain(DEFAULT_QUOTA_VIEW_MODE);
    expect(page).toContain('readQuotaUiState()?.viewMode ?? DEFAULT_QUOTA_VIEW_MODE');
  });

  test('Cards renders the totals strip and the compact card grid', () => {
    expect(page).toContain('<QuotaTotalsStrip');
    expect(page).toContain('<QuotaCompactCardItem');
    expect(page).toContain('onReset={() => performReset(entry.file, QUOTA_ADAPTERS[entry.type])}');
    expect(page).toContain('onReserveSaved={reloadReserveVerdicts}');
  });

  test('the old card and the Cards-mode timeline are gone', () => {
    expect(page).not.toContain('<QuotaCard\n');
    expect(page).not.toContain("from './components/QuotaCard'");
    expect(page).not.toMatch(/viewMode === 'cards' && \(\s*<QuotaTimeline/);
    expect(existsSync('src/features/quota/components/QuotaCard.tsx')).toBe(false);
  });

  test('the grid fits four cards on a wide screen and sizes cards to content', () => {
    const grid = styles.slice(styles.indexOf('.grid {'));
    expect(grid).toContain('repeat(auto-fill, minmax(340px, 1fr))');
    expect(grid).toContain('align-items: start');
  });
});
