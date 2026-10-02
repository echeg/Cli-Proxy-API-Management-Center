import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { apiClient } from '@/services/api/client';
import {
  readSubscriptionRouting,
  subscriptionRoutingApi,
  subscriptionRoutingPatch,
} from '@/services/api/subscriptionRouting';
import type { SubscriptionRoutingSettings } from '@/services/api/subscriptionRouting';
import { useConfigStore } from '@/stores';
import { goDurationSeconds } from '@/features/config/visualConfigAdditions';
import styles from './SubscriptionRouting.module.scss';

export function SubscriptionRouting({ disabled }: { disabled: boolean }) {
  const { t } = useTranslation();
  const strategyId = useId();
  const [values, setValues] = useState<SubscriptionRoutingSettings | null>(null);
  const [baseline, setBaseline] = useState<SubscriptionRoutingSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [loadRevision, setLoadRevision] = useState(0);
  const mounted = useRef(false);
  const savingRef = useRef(false);
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
    setLoading(true);
    setError('');
    void fetchConfig()
      .then((config) => {
        if (!active || revision !== apiClient.getConnectionRevision()) return;
        const next = readSubscriptionRouting(config);
        setValues(next);
        setBaseline(next);
      })
      .catch((err: unknown) => {
        if (active && revision === apiClient.getConnectionRevision()) {
          setError(err instanceof Error ? err.message : t('common.unknown_error'));
        }
      })
      .finally(() => {
        if (active && revision === apiClient.getConnectionRevision()) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [disabled, fetchConfig, loadRevision, t]);

  const change = (patch: Partial<SubscriptionRoutingSettings>) => {
    setValues((current) => (current ? { ...current, ...patch } : current));
    setSaved(false);
  };
  const dirty =
    values && baseline && Object.keys(subscriptionRoutingPatch(baseline, values)).length > 0;
  const ttlSeconds = values ? goDurationSeconds(values.sessionAffinityTTL.trim()) : undefined;
  const invalidTTL = values !== null && (ttlSeconds === undefined || ttlSeconds <= 0);
  const blocked = disabled || loading || saving || !values;
  const save = async () => {
    if (blocked || invalidTTL || !values || !baseline || !dirty || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError('');
    setSaved(false);
    const revision = apiClient.getConnectionRevision();
    const isCurrent = () => mounted.current && revision === apiClient.getConnectionRevision();
    try {
      await subscriptionRoutingApi.update(baseline, values);
      if (!isCurrent()) return;
      useConfigStore.getState().clearCache('routing/strategy');
      const config = await fetchConfig(true);
      if (!isCurrent()) return;
      const next = readSubscriptionRouting(config);
      setValues(next);
      setBaseline(next);
      setSaved(true);
    } catch (err: unknown) {
      if (isCurrent()) setError(err instanceof Error ? err.message : t('common.unknown_error'));
    } finally {
      savingRef.current = false;
      if (isCurrent()) setSaving(false);
    }
  };

  const strategies = ['round-robin', 'weighted-round-robin', 'fill-first', 'earliest-reset'];
  const options = strategies.map((strategy) => ({
    value: strategy,
    label: t(`config_management.visual.sections.network.strategy_${strategy.replace(/-/g, '_')}`),
  }));
  if (values && !strategies.includes(values.strategy))
    options.push({ value: values.strategy, label: values.strategy });

  return (
    <details className={styles.panel}>
      <summary>
        <strong>{t('quota_management.routing.title')}</strong>
        <span>
          {values
            ? options.find((option) => option.value === values.strategy)?.label
            : t('common.loading')}
        </span>
      </summary>
      <div className={styles.content}>
        <p>{t('quota_management.routing.description')}</p>
        <div className={styles.fields}>
          <div className={styles.strategy}>
            <label id={strategyId}>
              {t('config_management.visual.sections.network.routing_strategy')}
            </label>
            <Select
              value={values?.strategy ?? 'round-robin'}
              options={options}
              ariaLabelledBy={strategyId}
              disabled={blocked}
              onChange={(strategy) => change({ strategy })}
            />
          </div>
          <div className={styles.affinity}>
            <ToggleSwitch
              checked={values?.sessionAffinity ?? false}
              disabled={blocked}
              onChange={(sessionAffinity) => change({ sessionAffinity })}
              label={t('config_management.visual.sections.network.session_affinity')}
            />
          </div>
          <Input
            label={t('config_management.visual.sections.network.session_affinity_ttl')}
            placeholder="1h"
            value={values?.sessionAffinityTTL ?? ''}
            disabled={blocked}
            error={invalidTTL ? t('quota_management.routing.invalid_ttl') : undefined}
            onChange={(event) => change({ sessionAffinityTTL: event.target.value })}
          />
          <Button
            type="button"
            disabled={blocked || !dirty || invalidTTL}
            loading={saving}
            onClick={() => void save()}
          >
            {t('common.save')}
          </Button>
        </div>
        <p>{t('quota_management.routing.affinity_hint')}</p>
        {error && (
          <div className={styles.error} role="alert">
            {error}{' '}
            {!values && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setLoadRevision((current) => current + 1)}
              >
                {t('common.refresh')}
              </Button>
            )}
          </div>
        )}
        {saved && (
          <div className={styles.saved} role="status">
            {t('quota_management.routing.saved')}
          </div>
        )}
      </div>
    </details>
  );
}
