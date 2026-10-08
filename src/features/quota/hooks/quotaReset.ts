/** Modal-free manual reset execution shared by the Cards confirmation and inline Ledger flows. */

import type { TFunction } from 'i18next';
import type { AuthFileItem, NotificationType } from '@/types';
import { getQuotaCacheKey } from '@/utils/quota/identity';
import type { QuotaAdapter, QuotaMapUpdater } from '../providers';

export interface QuotaResetDeps<G> {
  file: AuthFileItem;
  adapter: Pick<QuotaAdapter, 'buildSuccessState'>;
  resetQuotaFn: (file: AuthFileItem, t: TFunction) => Promise<unknown>;
  setQuota: QuotaMapUpdater;
  setResetting: (updater: (current: string | null) => string | null) => void;
  notify: (message: string, type: NotificationType) => void;
  t: TFunction;
  displayName: (name: string) => string;
  captureGeneration: (name: string) => G;
  commitIfCurrent: (generation: G, commit: () => void) => boolean;
}

/** Resolves true only when the success state was committed for the current cache generation. */
export async function executeQuotaReset<G>(deps: QuotaResetDeps<G>): Promise<boolean> {
  const { file, adapter, setQuota, notify, t, displayName } = deps;
  const cacheKey = getQuotaCacheKey(file);
  const cacheGeneration = deps.captureGeneration(file.name);
  deps.setResetting(() => cacheKey);
  try {
    const data = await deps.resetQuotaFn(file, t);
    return deps.commitIfCurrent(cacheGeneration, () => {
      setQuota((prev) => ({
        ...prev,
        [cacheKey]: adapter.buildSuccessState(data),
      }));
      notify(t('codex_quota.reset_success', { name: displayName(file.name) }), 'success');
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : t('common.unknown_error');
    deps.commitIfCurrent(cacheGeneration, () => {
      notify(
        t('codex_quota.reset_failed', {
          name: displayName(file.name),
          message: displayName(message),
        }),
        'error'
      );
    });
    return false;
  } finally {
    deps.setResetting((current) => (current === cacheKey ? null : current));
  }
}
