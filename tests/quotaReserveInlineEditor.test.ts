import { beforeAll, describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18n from '@/i18n';
import type { ClaudeQuotaState } from '@/types';
import type { QuotaFileEntry } from '@/features/quota/logic';
import { QuotaReserveInlineEditor } from '@/features/quota/components/QuotaReserveInlineEditor';
import { QuotaCompactCardItem } from '@/features/quota/components/QuotaCompactCardItem';

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

const editor = (props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(QuotaReserveInlineEditor, {
      draft: { enabled: true, percent: '25', mode: 'soft', touched: false },
      canRemove: false,
      saving: false,
      onChange: () => {},
      onSave: () => {},
      onCancel: () => {},
      onRemove: () => {},
      ...props,
    } as never)
  );

describe('inline reserve editor', () => {
  test('renders percent, mode with its hint, and Save/Cancel', () => {
    const markup = editor();
    expect(markup).toContain('data-reserve-editor');
    expect(markup).toContain('value="25"');
    expect(markup).toContain(i18n.t('auth_files.reserve.percent_label'));
    expect(markup).toContain(i18n.t('auth_files.reserve.mode_soft'));
    expect(markup).toContain(i18n.t('auth_files.reserve.mode_soft_hint'));
    expect(markup).toContain(i18n.t('common.save'));
    expect(markup).toContain(i18n.t('common.cancel'));
    expect(markup).not.toContain(i18n.t('quota_management.reserve_editor.remove'));
  });

  test('offers Remove only for a stored reserve and explains hard mode', () => {
    const markup = editor({
      canRemove: true,
      draft: { enabled: true, percent: '40', mode: 'hard', touched: false },
    });
    expect(markup).toContain(i18n.t('quota_management.reserve_editor.remove'));
    expect(markup).toContain(i18n.t('auth_files.reserve.mode_hard_hint').replace("'", '&#x27;'));
  });

  test('shows validation and save errors and blocks Save', () => {
    const invalid = editor({
      draft: { enabled: true, percent: '150', mode: 'soft', touched: true },
    });
    expect(invalid).toContain(i18n.t('auth_files.reserve.percent_invalid'));
    expect(invalid).toMatch(/<button[^>]*disabled[^>]*data-reserve-save/);
    expect(editor({ error: 'rejected' })).toContain('rejected');
  });
});

const now = Date.UTC(2036, 9, 8, 12);
const quota = {
  status: 'success',
  windows: [
    { id: 'seven-day', label: '7-day limit', usedPercent: 45, resetLabel: '-', periodHours: 168 },
  ],
  resetGrants: [],
} as ClaudeQuotaState;

const card = (entry: QuotaFileEntry, state: unknown = quota) =>
  renderToStaticMarkup(
    createElement(QuotaCompactCardItem, {
      entry,
      quota: state,
      resolvedTheme: 'dark',
      now,
      showEmails: false,
      canRefresh: true,
      codexResetting: false,
      onRefresh: () => {},
      onReset: async () => true,
      onReserveSaved: async () => {},
    } as never)
  );

describe('card reserve entry points', () => {
  test('a stored reserve is a clickable badge', () => {
    const markup = card({
      file: {
        name: 'claude-a.json',
        type: 'claude',
        quotaReserve: { percent: 40, mode: 'soft' },
      } as never,
      type: 'claude',
    });
    expect(markup).toMatch(/<button[^>]*data-reserve-badge/);
    expect(markup).toContain('aria-expanded="false"');
  });

  test('codex and claude without a reserve offer "Set reserve…"', () => {
    const markup = card({
      file: { name: 'claude-a.json', type: 'claude' } as never,
      type: 'claude',
    });
    expect(markup).toContain('data-set-reserve');
    expect(markup).toContain(i18n.t('quota_management.compact.set_reserve'));
  });

  test('other providers get no reserve entry point', () => {
    const markup = card(
      {
        file: { name: 'kimi-a.json', type: 'kimi' } as never,
        type: 'kimi' as never,
      },
      { status: 'success', rows: [] }
    );
    expect(markup).not.toContain('data-set-reserve');
    expect(markup).not.toContain('data-reserve-badge');
  });
});
