import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import {
  buildAuthFileFieldsPatch,
  buildPrefixProxyUpdatedText,
  type PrefixProxyEditorState,
} from '@/features/authFiles/hooks/useAuthFilesPrefixProxyEditor';
import {
  buildQuotaReservePatch,
  quotaReserveError,
  readQuotaReserveDraft,
  type QuotaReserveDraft,
} from '@/features/authFiles/quotaReserve';
import { AuthFileQuotaReserveField } from '@/features/authFiles/components/AuthFileQuotaReserveField';
import en from '@/i18n/locales/en.json';
import ko from '@/i18n/locales/ko.json';
import ru from '@/i18n/locales/ru.json';
import vi from '@/i18n/locales/vi.json';
import zhCN from '@/i18n/locales/zh-CN.json';
import zhTW from '@/i18n/locales/zh-TW.json';

const draft = (fields: Partial<QuotaReserveDraft> = {}): QuotaReserveDraft => ({
  enabled: true,
  percent: '25',
  mode: 'soft',
  touched: true,
  ...fields,
});

/** A touched draft read the way the editor reads it, then edited. */
const edit = (
  original: Record<string, unknown>,
  fields: Partial<QuotaReserveDraft> = {},
  fallback?: { percent: number; mode: 'soft' | 'hard' }
): QuotaReserveDraft => ({
  ...readQuotaReserveDraft('codex', original, fallback)!,
  touched: true,
  ...fields,
});

const makeEditor = (
  json: Record<string, unknown>,
  providerKey: string,
  quotaReserve?: QuotaReserveDraft
): PrefixProxyEditorState => ({
  fileName: 'credential.json',
  fileInfoText: '',
  loading: false,
  saving: false,
  error: null,
  originalText: JSON.stringify(json),
  rawText: JSON.stringify(json),
  invalidContentPreview: '',
  json,
  providerKey,
  prefix: '',
  proxyUrl: '',
  priority: '',
  weight: '',
  weightError: null,
  disableCooling: false,
  disableCoolingTouched: false,
  websockets: false,
  websocketsTouched: false,
  usingApi: false,
  usingApiTouched: false,
  note: '',
  noteTouched: false,
  excludedModelsText: '',
  excludedModelsTouched: false,
  headersText: '',
  headersTouched: false,
  headersError: null,
  quotaReserve,
});

const resolveError = (key: string) => key;

describe('quota reserve draft', () => {
  test('gives a draft to codex and claude only', () => {
    const json = { quota_reserve: { percent: 25 } };
    expect(readQuotaReserveDraft('codex', json)).toBeDefined();
    expect(readQuotaReserveDraft('claude', json)).toBeDefined();
    expect(readQuotaReserveDraft('gemini', json)).toBeUndefined();
    expect(readQuotaReserveDraft('', json)).toBeUndefined();
  });

  test('reads the reserve from the credential JSON', () => {
    expect(
      readQuotaReserveDraft('codex', { quota_reserve: { percent: 25, mode: 'hard' } })
    ).toEqual({
      enabled: true,
      percent: '25',
      mode: 'hard',
      touched: false,
      initial: { percent: 25, mode: 'hard' },
    });
    // The backend defaults a missing mode to soft.
    expect(readQuotaReserveDraft('claude', { quota_reserve: { percent: '30' } })).toEqual({
      enabled: true,
      percent: '30',
      mode: 'soft',
      touched: false,
      initial: { percent: 30, mode: 'soft' },
    });
  });

  test('falls back to the listed reserve and to a disabled default', () => {
    expect(readQuotaReserveDraft('codex', {}, { percent: 40, mode: 'hard' })).toEqual({
      enabled: true,
      percent: '40',
      mode: 'hard',
      touched: false,
      initial: { percent: 40, mode: 'hard' },
    });
    expect(readQuotaReserveDraft('codex', { quota_reserve: { percent: 150 } })).toEqual({
      enabled: false,
      percent: '',
      mode: 'soft',
      touched: false,
    });
  });
});

describe('quota reserve patch', () => {
  test('enabling writes the reserve object', () => {
    expect(buildQuotaReservePatch({}, draft({ mode: 'hard' }))).toEqual({
      quota_reserve: { percent: 25, mode: 'hard' },
    });
    expect(buildQuotaReservePatch({}, draft({ percent: ' 7 ' }))).toEqual({
      quota_reserve: { percent: 7, mode: 'soft' },
    });
  });

  test('changing an existing reserve writes the new object', () => {
    const original = { quota_reserve: { percent: 25, mode: 'soft' } };
    expect(buildQuotaReservePatch(original, edit(original, { percent: '30' }))).toEqual({
      quota_reserve: { percent: 30, mode: 'soft' },
    });
  });

  test('disabling an existing reserve writes null', () => {
    const original = { quota_reserve: { percent: 25, mode: 'soft' } };
    expect(buildQuotaReservePatch(original, edit(original, { enabled: false }))).toEqual({
      quota_reserve: null,
    });
    // An invalid stored value reads as disabled but is still removed on save.
    const invalid = { quota_reserve: { percent: 150 } };
    expect(buildQuotaReservePatch(invalid, edit(invalid, { enabled: false }))).toEqual({
      quota_reserve: null,
    });
  });

  test('a reserve read from the listed entry can be turned off', () => {
    const listed = { percent: 40, mode: 'hard' as const };
    expect(buildQuotaReservePatch({}, edit({}, { enabled: false }, listed))).toEqual({
      quota_reserve: null,
    });
    expect(buildQuotaReservePatch({}, edit({}, {}, listed))).toEqual({});
  });

  test('unchanged, untouched or never-set reserves send no key', () => {
    const original = { quota_reserve: { percent: 25, mode: 'soft' } };
    expect(buildQuotaReservePatch(original, edit(original))).toEqual({});
    expect(
      buildQuotaReservePatch(original, edit(original, { percent: '99', touched: false }))
    ).toEqual({});
    expect(buildQuotaReservePatch({}, draft({ enabled: false }))).toEqual({});
    expect(buildQuotaReservePatch({}, undefined)).toEqual({});
  });

  test('a missing stored mode equals an explicit soft mode', () => {
    const original = { quota_reserve: { percent: 25 } };
    expect(buildQuotaReservePatch(original, edit(original, { mode: 'soft' }))).toEqual({});
  });

  test('rejects a percent outside 1-99 or a non-integer and sends nothing', () => {
    for (const percent of ['0', '100', '1.5', 'abc', '', '-3']) {
      expect(quotaReserveError(draft({ percent }))).toBe('auth_files.reserve.percent_invalid');
      expect(buildQuotaReservePatch({}, draft({ percent }))).toEqual({});
    }
    expect(quotaReserveError(draft({ percent: '1' }))).toBeNull();
    expect(quotaReserveError(draft({ percent: '99' }))).toBeNull();
    expect(quotaReserveError(draft({ enabled: false, percent: 'abc' }))).toBeNull();
    expect(quotaReserveError(draft({ touched: false, percent: 'abc' }))).toBeNull();
    expect(quotaReserveError(undefined)).toBeNull();
  });
});

describe('quota reserve in the credential fields patch', () => {
  test('joins the existing PATCH payload', () => {
    expect(buildAuthFileFieldsPatch(makeEditor({}, 'codex', draft()), resolveError)).toEqual({
      quota_reserve: { percent: 25, mode: 'soft' },
    });
    expect(
      buildAuthFileFieldsPatch(
        makeEditor({ quota_reserve: { percent: 25 } }, 'claude', draft({ enabled: false })),
        resolveError
      )
    ).toEqual({ quota_reserve: null });
  });

  test('writes the reserve into the updated credential JSON and removes it when disabled', () => {
    const json = { type: 'codex', quota_reserve: { percent: 25, mode: 'soft' } };
    const changed = buildPrefixProxyUpdatedText(
      makeEditor(json, 'codex', edit(json, { percent: '40', mode: 'hard' })),
      resolveError
    );
    expect(JSON.parse(changed)).toEqual({
      type: 'codex',
      quota_reserve: { percent: 40, mode: 'hard' },
    });
    const removed = buildPrefixProxyUpdatedText(
      makeEditor(json, 'codex', edit(json, { enabled: false })),
      resolveError
    );
    expect(JSON.parse(removed)).toEqual({ type: 'codex' });
  });

  test('blocks the request on an invalid percent', () => {
    expect(() =>
      buildAuthFileFieldsPatch(makeEditor({}, 'codex', draft({ percent: '100' })), resolveError)
    ).toThrow('auth_files.reserve.percent_invalid');
  });

  test('never sends the field for other providers', () => {
    const json = { quota_reserve: { percent: 25 } };
    expect(
      buildAuthFileFieldsPatch(
        makeEditor(json, 'gemini', readQuotaReserveDraft('gemini', json)),
        resolveError
      )
    ).toEqual({});
  });
});

const i18n = createInstance();
await i18n.init({ lng: 'en', resources: { en: { translation: en } } });

const renderField = (value: QuotaReserveDraft | undefined) =>
  renderToStaticMarkup(
    createElement(
      I18nextProvider,
      { i18n },
      createElement(AuthFileQuotaReserveField, {
        draft: value,
        disabled: false,
        onChange: () => {},
      })
    )
  );

describe('quota reserve editor controls', () => {
  test('render for codex and claude', () => {
    for (const providerKey of ['codex', 'claude']) {
      const html = renderField({
        ...readQuotaReserveDraft(providerKey, {}, { percent: 25, mode: 'soft' })!,
        touched: true,
      });
      expect(html).toContain('Reserve quota for external services');
      expect(html).toContain('value="25"');
      expect(html).toContain('min="1"');
      expect(html).toContain('max="99"');
      expect(html).toContain('new sessions');
    }
  });

  test('are absent for other providers', () => {
    expect(renderField(readQuotaReserveDraft('gemini', {}))).toBe('');
    expect(renderField(readQuotaReserveDraft('', {}))).toBe('');
  });

  test('hide the percent and mode inputs while disabled', () => {
    const html = renderField(draft({ enabled: false, touched: false }));
    expect(html).toContain('Reserve quota for external services');
    expect(html).not.toContain('max="99"');
  });

  test('show the validation error', () => {
    const html = renderField(draft({ percent: '100' }));
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain(en.auth_files.reserve.percent_invalid);
  });

  test('the details sheet mounts the field next to the priority input', () => {
    const source = readFileSync(
      new URL('../src/features/authFiles/components/AuthFileDetailsSheet.tsx', import.meta.url),
      'utf8'
    );
    const priority = source.indexOf("t('auth_files.priority_label')");
    const reserve = source.indexOf('<AuthFileQuotaReserveField');
    expect(priority).toBeGreaterThan(-1);
    expect(reserve).toBeGreaterThan(priority);
    expect(source).toContain('draft={editor.quotaReserve}');
    expect(source).toContain('quotaReserveError(editor?.quotaReserve)');
  });
});

describe('quota reserve locale parity', () => {
  test('every locale defines the same auth_files.reserve keys', () => {
    const keys = Object.keys(en.auth_files.reserve).sort();
    expect(keys.length).toBeGreaterThan(0);
    for (const locale of [ko, ru, vi, zhCN, zhTW]) {
      expect(Object.keys(locale.auth_files.reserve).sort()).toEqual(keys);
    }
  });
});
