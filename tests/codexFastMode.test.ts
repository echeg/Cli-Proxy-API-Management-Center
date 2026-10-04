import { afterEach, beforeAll, describe, expect, spyOn, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18n from '@/i18n';
import { apiClient } from '@/services/api/client';
import { configApi } from '@/services/api/config';
import { normalizeConfigResponse } from '@/services/api/transformers';
import { CodexFastMode } from '@/features/quota/components/CodexFastMode';

const spies: Array<{ mockRestore(): void }> = [];
afterEach(() => spies.splice(0).forEach((spy) => spy.mockRestore()));

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

describe('codex fast mode', () => {
  test('reads the OAuth-scoped v8 flag and defaults to off', () => {
    expect(
      normalizeConfigResponse({ oauth: { providers: { codex: { 'fast-mode': true } } } })
        .codexFastMode
    ).toBe(true);
    expect(normalizeConfigResponse({}).codexFastMode).toBe(false);
  });

  test('writes the boolean directly to the v8 config path', async () => {
    const put = spyOn(apiClient, 'put').mockResolvedValue({} as never);
    spies.push(put);
    await configApi.updateCodexFastMode(true);
    expect(put).toHaveBeenLastCalledWith('/config/oauth/providers/codex/fast-mode', true);
  });

  test('renders a labelled, initially disabled switch', () => {
    const markup = renderToStaticMarkup(createElement(CodexFastMode, { disabled: true }));
    expect(markup).toContain(i18n.t('quota_management.codex_fast.title'));
    expect(markup).toContain(i18n.t('quota_management.codex_fast.description'));
    expect(markup).toContain('disabled');
  });
});
