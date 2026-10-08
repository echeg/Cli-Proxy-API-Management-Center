/** Credential refresh and manual reset actions with session-scoped cache guards. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  captureQuotaCacheGeneration,
  commitIfQuotaCacheCurrent,
  useNotificationStore,
} from '@/stores';
import type { AuthFileItem } from '@/types';
import { getStatusFromError } from '@/utils/quota';
import { getQuotaCacheKey } from '@/utils/quota/identity';
import { enrichQuotaInBackground } from '../quotaEnrichment';
import { executeQuotaReset } from './quotaReset';
import { getQuotaMap, getQuotaSetter, type QuotaAdapter, type QuotaCardState } from '../providers';

const getQuotaState = (adapter: QuotaAdapter, file: AuthFileItem): QuotaCardState | undefined =>
  getQuotaMap(adapter)[getQuotaCacheKey(file)];

const unchangedName = (name: string) => name;

export function useQuotaActions(
  disableControls: boolean,
  displayNameFor: (name: string) => string = unchangedName
) {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const showConfirmation = useNotificationStore((state) => state.showConfirmation);
  const [resettingQuotaName, setResettingQuotaName] = useState<string | null>(null);
  const displayNameRef = useRef(displayNameFor);
  useEffect(() => {
    // Pending responses must use the current privacy choice when they finish.
    displayNameRef.current = displayNameFor;
  }, [displayNameFor]);

  const refreshQuota = useCallback(
    async (file: AuthFileItem, adapter: QuotaAdapter) => {
      if (disableControls || file.disabled) return;
      const cacheKey = getQuotaCacheKey(file);
      if (resettingQuotaName === cacheKey) return;
      if (getQuotaState(adapter, file)?.status === 'loading') return;
      const cacheGeneration = captureQuotaCacheGeneration(file.name);
      const setQuota = getQuotaSetter(adapter);

      setQuota((prev) => ({
        ...prev,
        [cacheKey]: adapter.buildLoadingState(),
      }));

      try {
        const data = await adapter.fetchQuota(file, t);
        commitIfQuotaCacheCurrent(cacheGeneration, () => {
          const successState = adapter.buildSuccessState(data);
          setQuota((prev) => ({
            ...prev,
            [cacheKey]: successState,
          }));
          void enrichQuotaInBackground(adapter, file, data, successState, t);
          showNotification(
            t('auth_files.quota_refresh_success', { name: displayNameRef.current(file.name) }),
            'success'
          );
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : t('common.unknown_error');
        const status = getStatusFromError(err);
        commitIfQuotaCacheCurrent(cacheGeneration, () => {
          setQuota((prev) => ({
            ...prev,
            [cacheKey]: adapter.buildErrorState(message, status),
          }));
          showNotification(
            t('auth_files.quota_refresh_failed', {
              name: displayNameRef.current(file.name),
              message: displayNameRef.current(message),
            }),
            'error'
          );
        });
      }
    },
    [disableControls, resettingQuotaName, showNotification, t]
  );

  // Shared guards: returns the reset call only when this credential may spend a reset now.
  const resetFnFor = useCallback(
    (file: AuthFileItem, adapter: QuotaAdapter) => {
      const resetQuotaFn = adapter.resetQuota;
      if (!resetQuotaFn) return null;
      if (disableControls || file.disabled) return null;
      if (getQuotaState(adapter, file)?.status === 'loading') return null;
      if (resettingQuotaName === getQuotaCacheKey(file)) return null;
      return resetQuotaFn;
    },
    [disableControls, resettingQuotaName]
  );

  const runReset = useCallback(
    (
      file: AuthFileItem,
      adapter: QuotaAdapter,
      resetQuotaFn: NonNullable<QuotaAdapter['resetQuota']>
    ) =>
      executeQuotaReset({
        file,
        adapter,
        resetQuotaFn,
        setQuota: getQuotaSetter(adapter),
        setResetting: setResettingQuotaName,
        notify: showNotification,
        t,
        displayName: (name) => displayNameRef.current(name),
        captureGeneration: captureQuotaCacheGeneration,
        commitIfCurrent: commitIfQuotaCacheCurrent,
      }),
    [showNotification, t]
  );

  const resetQuota = useCallback(
    (file: AuthFileItem, adapter: QuotaAdapter) => {
      const resetQuotaFn = resetFnFor(file, adapter);
      if (!resetQuotaFn) return;

      showConfirmation({
        title: t('codex_quota.reset_confirm_title'),
        message: t('codex_quota.reset_confirm_message', {
          name: displayNameRef.current(file.name),
        }),
        confirmText: t('codex_quota.reset_confirm_button'),
        variant: 'primary',
        onConfirm: async () => {
          await runReset(file, adapter, resetQuotaFn);
        },
      });
    },
    [resetFnFor, runReset, showConfirmation, t]
  );

  /** Inline (Ledger) variant: the caller already collected confirmation. */
  const performReset = useCallback(
    async (file: AuthFileItem, adapter: QuotaAdapter): Promise<boolean> => {
      const resetQuotaFn = resetFnFor(file, adapter);
      if (!resetQuotaFn) return false;
      return runReset(file, adapter, resetQuotaFn);
    },
    [resetFnFor, runReset]
  );

  return { resettingQuotaName, refreshQuota, resetQuota, performReset };
}
