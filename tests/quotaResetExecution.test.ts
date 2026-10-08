import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import type { TFunction } from 'i18next';
import { executeQuotaReset, type QuotaResetDeps } from '@/features/quota/hooks/quotaReset';
import type { QuotaCardState } from '@/features/quota/providers';
import type { AuthFileItem, NotificationType } from '@/types';

const t = ((key: string, options?: Record<string, unknown>) =>
  options ? `${key}:${JSON.stringify(options)}` : key) as TFunction;
const file = { name: 'codex-a.json', type: 'codex', auth_index: 'a' } as AuthFileItem;

function setup(overrides: Partial<QuotaResetDeps<number>> = {}) {
  let quotas: Record<string, QuotaCardState> = {};
  let resetting: string | null = null;
  const resettingDuringCall: Array<string | null> = [];
  const notifications: Array<{ message: string; type: NotificationType }> = [];
  let generation = 1;
  const deps: QuotaResetDeps<number> = {
    file,
    adapter: {
      buildSuccessState: (data) => ({ status: 'success', data }) as unknown as QuotaCardState,
    },
    resetQuotaFn: async () => {
      resettingDuringCall.push(resetting);
      return { windows: 1 };
    },
    setQuota: (updater) => {
      quotas = updater(quotas);
    },
    setResetting: (updater) => {
      resetting = updater(resetting);
    },
    notify: (message, type) => notifications.push({ message, type }),
    t,
    displayName: (name) => `masked(${name})`,
    captureGeneration: () => generation,
    commitIfCurrent: (captured, commit) => {
      if (captured !== generation) return false;
      commit();
      return true;
    },
    ...overrides,
  };
  return {
    deps,
    notifications,
    resettingDuringCall,
    quotas: () => quotas,
    resetting: () => resetting,
    bumpGeneration: () => {
      generation += 1;
    },
  };
}

describe('executeQuotaReset', () => {
  test('commits the success state under the cache key and notifies success', async () => {
    const ctx = setup();
    await expect(executeQuotaReset(ctx.deps)).resolves.toBe(true);
    expect(ctx.quotas()).toEqual({
      'codex-a.json': { status: 'success', data: { windows: 1 } } as unknown as QuotaCardState,
    });
    expect(ctx.notifications).toEqual([
      {
        message: 'codex_quota.reset_success:{"name":"masked(codex-a.json)"}',
        type: 'success',
      },
    ]);
  });

  test('notifies failure and commits no state', async () => {
    const ctx = setup({
      resetQuotaFn: async () => {
        throw new Error('codex_quota.reset_not_confirmed');
      },
    });
    await expect(executeQuotaReset(ctx.deps)).resolves.toBe(false);
    expect(ctx.quotas()).toEqual({});
    expect(ctx.notifications).toEqual([
      {
        message:
          'codex_quota.reset_failed:{"name":"masked(codex-a.json)",' +
          '"message":"masked(codex_quota.reset_not_confirmed)"}',
        type: 'error',
      },
    ]);
  });

  test('falls back to the unknown error text for non-Error rejections', async () => {
    const ctx = setup({
      resetQuotaFn: () => Promise.reject('boom'),
    });
    await executeQuotaReset(ctx.deps);
    expect(ctx.notifications[0].message).toContain('"message":"masked(common.unknown_error)"');
  });

  test('stale cache generation commits nothing and stays silent', async () => {
    const ctx = setup();
    ctx.deps.resetQuotaFn = async () => {
      ctx.bumpGeneration();
      return { windows: 1 };
    };
    await expect(executeQuotaReset(ctx.deps)).resolves.toBe(false);
    expect(ctx.quotas()).toEqual({});
    expect(ctx.notifications).toEqual([]);
  });

  test('stale cache generation on failure stays silent', async () => {
    const ctx = setup();
    ctx.deps.resetQuotaFn = async () => {
      ctx.bumpGeneration();
      throw new Error('offline');
    };
    await executeQuotaReset(ctx.deps);
    expect(ctx.notifications).toEqual([]);
  });

  test('sets the resetting key during the call and clears it in finally', async () => {
    const ok = setup();
    await executeQuotaReset(ok.deps);
    expect(ok.resettingDuringCall).toEqual(['codex-a.json']);
    expect(ok.resetting()).toBeNull();

    const failed = setup();
    failed.deps.resetQuotaFn = async () => {
      failed.resettingDuringCall.push(failed.resetting());
      throw new Error('offline');
    };
    await executeQuotaReset(failed.deps);
    expect(failed.resettingDuringCall).toEqual(['codex-a.json']);
    expect(failed.resetting()).toBeNull();
  });

  test('does not clear a resetting key that another credential took over', async () => {
    const ctx = setup();
    ctx.deps.resetQuotaFn = async () => {
      ctx.deps.setResetting(() => 'codex-b.json');
      return {};
    };
    await executeQuotaReset(ctx.deps);
    expect(ctx.resetting()).toBe('codex-b.json');
  });
});

describe('quota reset wiring contracts', () => {
  const page = readFileSync('src/features/quota/QuotaPage.tsx', 'utf8');
  const actions = readFileSync('src/features/quota/hooks/useQuotaActions.ts', 'utf8');

  test('Cards keep the modal reset flow', () => {
    expect(page).toContain('onReset={() => resetQuota(entry.file, QUOTA_ADAPTERS[entry.type])}');
    expect(actions).toContain('showConfirmation({');
    expect(actions).toContain('await runReset(file, adapter, resetQuotaFn);');
  });

  test('the hook exposes a modal-free performReset through the shared helper', () => {
    expect(actions).toContain('executeQuotaReset({');
    expect(actions).toMatch(/return \{[^}]*performReset[^}]*\}/);
  });
});
