import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { clearClaudeCooldownAfterClaim } from '@/features/quota/providers/claude/claimCooldown';
import { apiClient, authFilesApi } from '@/services/api';
import {
  ANTHROPIC_RESET_RESULTS,
  type AnthropicResetSettledCode,
} from '@/services/api/claudeResetGrants';

const mocks: Array<{ mockRestore(): void }> = [];
afterEach(() => {
  for (const mock of mocks.splice(0)) mock.mockRestore();
});

function setup() {
  const clear = spyOn(authFilesApi, 'resetCooldown').mockResolvedValue({
    status: 'ok',
    auth_index: 'test-index',
    models: [],
  });
  mocks.push(clear);
  return clear;
}

const answer = (code: AnthropicResetSettledCode, unresolved = false) => ({ code, unresolved });
const revision = () => apiClient.getConnectionRevision();

describe('Claude claim proxy cooldown', () => {
  test.each(['reset', 'already_used'] as const)('clears once after a settled %s', async (code) => {
    const clear = setup();
    expect(await clearClaudeCooldownAfterClaim('test-index', answer(code), revision())).toBe(
      'cleared'
    );
    expect(clear).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledWith('test-index');
  });

  test('never clears for refusals or unresolved outcomes', async () => {
    const clear = setup();
    for (const code of ANTHROPIC_RESET_RESULTS) {
      if (code === 'reset' || code === 'already_used') continue;
      expect(await clearClaudeCooldownAfterClaim('test-index', answer(code), revision())).toBe(
        'skipped'
      );
    }
    for (const code of ['auth_error', 'rate_limited'] as const) {
      expect(await clearClaudeCooldownAfterClaim('test-index', answer(code), revision())).toBe(
        'skipped'
      );
    }
    for (const code of ['reset', 'already_used'] as const) {
      expect(
        await clearClaudeCooldownAfterClaim('test-index', answer(code, true), revision())
      ).toBe('skipped');
    }
    expect(clear).not.toHaveBeenCalled();
  });

  test('skips when the connection changed after the claim', async () => {
    const clear = setup();
    expect(await clearClaudeCooldownAfterClaim('test-index', answer('reset'), revision() - 1)).toBe(
      'skipped'
    );
    expect(clear).not.toHaveBeenCalled();
  });

  test('does not report a stale acknowledgement after the connection changes mid-request', async () => {
    const start = revision();
    const clear = setup();
    const current = spyOn(apiClient, 'getConnectionRevision')
      .mockReturnValueOnce(start)
      .mockReturnValue(start + 1);
    mocks.push(current);
    expect(await clearClaudeCooldownAfterClaim('test-index', answer('reset'), start)).toBe(
      'skipped'
    );
    expect(clear).toHaveBeenCalledTimes(1);
  });

  test('fails when the cooldown request throws', async () => {
    setup().mockRejectedValue(new Error('offline'));
    expect(await clearClaudeCooldownAfterClaim('test-index', answer('reset'), revision())).toBe(
      'failed'
    );
  });

  test('fails on a non-ok or mismatched acknowledgement', async () => {
    const clear = setup();
    clear.mockResolvedValueOnce({
      status: 'error' as 'ok',
      auth_index: 'test-index',
      models: [],
    });
    expect(await clearClaudeCooldownAfterClaim('test-index', answer('reset'), revision())).toBe(
      'failed'
    );
    clear.mockResolvedValueOnce({ status: 'ok', auth_index: 'other-index', models: [] });
    expect(
      await clearClaudeCooldownAfterClaim('test-index', answer('already_used'), revision())
    ).toBe('failed');
  });
});
