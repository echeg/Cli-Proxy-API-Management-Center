import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import {
  buildAuthFileFieldsPatch,
  type PrefixProxyEditorState,
} from '@/features/authFiles/hooks/useAuthFilesPrefixProxyEditor';
import {
  buildQuotaReservePatch,
  quotaReserveError,
  readQuotaReserveDraft,
  supportsQuotaReserve,
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
  test('supports codex and claude only', () => {
    expect(supportsQuotaReserve('codex')).toBe(true);
    expect(supportsQuotaReserve('claude')).toBe(true);
    expect(supportsQuotaReserve('gemini')).toBe(false);
    expect(supportsQuotaReserve('')).toBe(false);
  });

  test('reads the reserve from the credential JSON', () => {
    expect(readQuotaReserveDraft({ quota_reserve: { percent: 25, mode: 'hard' } })).toEqual({
      enabled: true,
      percent: '25',
      mode: 'hard',
      touched: false,
    });
    // The backend defaults a missing mode to soft.
    expect(readQuotaReserveDraft({ quota_reserve: { percent: '30' } })).toEqual({
      enabled: true,
      percent: '30',
      mode: 'soft',
      touched: false,
    });
  });

  test('falls back to the listed reserve and to a disabled default', () => {
    expect(readQuotaReserveDraft({}, { percent: 40, mode: 'hard' })).toEqual({
      enabled: true,
      percent: '40',
      mode: 'hard',
      touched: false,
    });
    expect(readQuotaReserveDraft({ quota_reserve: { percent: 150 } })).toEqual({
      enabled: false,
      percent: '',
      mode: 'soft',
      touched: false,
    });
  });
});

describe('quota reserve patch', () => {
  test('enabling writes the reserve object', () => {
    expect(buildQuotaReservePatch({}, draft({ mode: 'hard' }), 'codex')).toEqual({
      quota_reserve: { percent: 25, mode: 'hard' },
    });
    expect(buildQuotaReservePatch({}, draft({ percent: ' 7 ' }), 'claude')).toEqual({
      quota_reserve: { percent: 7, mode: 'soft' },
    });
  });

  test('changing an existing reserve writes the new object', () => {
    const original = { quota_reserve: { percent: 25, mode: 'soft' } };
    expect(buildQuotaReservePatch(original, draft({ percent: '30' }), 'codex')).toEqual({
      quota_reserve: { percent: 30, mode: 'soft' },
    });
  });

  test('disabling an existing reserve writes null', () => {
    const original = { quota_reserve: { percent: 25, mode: 'soft' } };
    expect(buildQuotaReservePatch(original, draft({ enabled: false }), 'codex')).toEqual({
      quota_reserve: null,
    });
  });

  test('unchanged, untouched or never-set reserves send no key', () => {
    const original = { quota_reserve: { percent: 25, mode: 'soft' } };
    expect(buildQuotaReservePatch(original, draft(), 'codex')).toEqual({});
    expect(
      buildQuotaReservePatch(original, draft({ percent: '99', touched: false }), 'codex')
    ).toEqual({});
    expect(buildQuotaReservePatch({}, draft({ enabled: false }), 'codex')).toEqual({});
    expect(buildQuotaReservePatch({}, undefined, 'codex')).toEqual({});
  });

  test('a missing stored mode equals an explicit soft mode', () => {
    expect(
      buildQuotaReservePatch({ quota_reserve: { percent: 25 } }, draft({ mode: 'soft' }), 'codex')
    ).toEqual({});
  });

  test('rejects a percent outside 1-99 or a non-integer and sends nothing', () => {
    for (const percent of ['0', '100', '1.5', 'abc', '', '-3']) {
      expect(quotaReserveError(draft({ percent }))).toBe('auth_files.reserve.percent_invalid');
      expect(buildQuotaReservePatch({}, draft({ percent }), 'codex')).toEqual({});
    }
    expect(quotaReserveError(draft({ percent: '1' }))).toBeNull();
    expect(quotaReserveError(draft({ percent: '99' }))).toBeNull();
    expect(quotaReserveError(draft({ enabled: false, percent: 'abc' }))).toBeNull();
    expect(quotaReserveError(draft({ touched: false, percent: 'abc' }))).toBeNull();
    expect(quotaReserveError(undefined)).toBeNull();
  });

  test('never sends the field for other providers', () => {
    expect(buildQuotaReservePatch({}, draft(), 'gemini')).toEqual({});
    expect(
      buildQuotaReservePatch(
        { quota_reserve: { percent: 25 } },
        draft({ enabled: false }),
        'aistudio'
      )
    ).toEqual({});
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

  test('blocks the request on an invalid percent', () => {
    expect(() =>
      buildAuthFileFieldsPatch(makeEditor({}, 'codex', draft({ percent: '100' })), resolveError)
    ).toThrow('auth_files.reserve.percent_invalid');
  });

  test('ignores the draft for other providers', () => {
    expect(
      buildAuthFileFieldsPatch(makeEditor({}, 'gemini', draft({ percent: '100' })), resolveError)
    ).toEqual({});
  });
});

const i18n = createInstance();
await i18n.init({ lng: 'en', resources: { en: { translation: en } } });

const renderField = (providerKey: string, value: QuotaReserveDraft = draft()) =>
  renderToStaticMarkup(
    createElement(
      I18nextProvider,
      { i18n },
      createElement(AuthFileQuotaReserveField, {
        providerKey,
        draft: value,
        disabled: false,
        onChange: () => {},
      })
    )
  );

describe('quota reserve editor controls', () => {
  test('render for codex and claude', () => {
    for (const providerKey of ['codex', 'claude']) {
      const html = renderField(providerKey);
      expect(html).toContain('Reserve quota for external services');
      expect(html).toContain('value="25"');
      expect(html).toContain('min="1"');
      expect(html).toContain('max="99"');
      expect(html).toContain('new sessions');
    }
  });

  test('are absent for other providers', () => {
    expect(renderField('gemini')).toBe('');
    expect(renderField('')).toBe('');
  });

  test('hide the percent and mode inputs while disabled', () => {
    const html = renderField('codex', draft({ enabled: false, touched: false }));
    expect(html).toContain('Reserve quota for external services');
    expect(html).not.toContain('max="99"');
  });

  test('show the validation error', () => {
    const html = renderField('codex', draft({ percent: '100' }));
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
    expect(source).toContain('providerKey={editor.providerKey}');
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
