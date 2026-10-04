import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { apiClient } from '@/services/api/client';
import { configApi } from '@/services/api/config';
import { useConfigStore } from '@/stores';
import styles from './CodexFastMode.module.scss';

/** Applies codex.fast-mode immediately; the server hot-reloads it for new requests. */
export function CodexFastMode({ disabled }: { disabled: boolean }) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(false);
  const fetchConfig = useConfigStore((state) => state.fetchConfig);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (disabled) return;
    let active = true;
    const revision = apiClient.getConnectionRevision();
    setError('');
    void fetchConfig()
      .then((config) => {
        if (active && revision === apiClient.getConnectionRevision()) {
          setEnabled(config.codexFastMode ?? false);
        }
      })
      .catch((err: unknown) => {
        if (active && revision === apiClient.getConnectionRevision()) {
          setError(err instanceof Error ? err.message : t('common.unknown_error'));
        }
      });
    return () => {
      active = false;
    };
  }, [disabled, fetchConfig, t]);

  const toggle = async (next: boolean) => {
    if (disabled || saving || enabled === null) return;
    const revision = apiClient.getConnectionRevision();
    const isCurrent = () => mounted.current && revision === apiClient.getConnectionRevision();
    setSaving(true);
    setError('');
    try {
      await configApi.updateCodexFastMode(next);
      if (!isCurrent()) return;
      setEnabled(next);
      const config = await fetchConfig(true);
      if (isCurrent()) setEnabled(config.codexFastMode ?? false);
    } catch (err: unknown) {
      if (isCurrent()) setError(err instanceof Error ? err.message : t('common.unknown_error'));
    } finally {
      if (isCurrent()) setSaving(false);
    }
  };

  return (
    <section className={styles.panel} aria-label={t('quota_management.codex_fast.title')}>
      <div className={styles.row}>
        <ToggleSwitch
          checked={enabled ?? false}
          disabled={disabled || saving || enabled === null}
          onChange={(next) => void toggle(next)}
          label={<strong>{t('quota_management.codex_fast.title')}</strong>}
        />
        <span className={enabled ? styles.on : styles.off}>
          {enabled === null
            ? t('common.loading')
            : t(enabled ? 'quota_management.codex_fast.on' : 'quota_management.codex_fast.off')}
        </span>
      </div>
      <p>{t('quota_management.codex_fast.description')}</p>
      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}
    </section>
  );
}
