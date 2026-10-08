import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import type { AuthFileQuotaReserveMode } from '@/types/authFile';
import { quotaReserveError, supportsQuotaReserve, type QuotaReserveDraft } from '../quotaReserve';

/** Per-credential quota reserve editor; renders nothing for providers other than codex/claude. */
export function AuthFileQuotaReserveField({
  providerKey,
  draft,
  disabled,
  onChange,
}: {
  providerKey: string;
  draft?: QuotaReserveDraft;
  disabled: boolean;
  onChange: (value: Partial<QuotaReserveDraft>) => void;
}) {
  const { t } = useTranslation();
  const modeLabelId = useId();
  if (!draft || !supportsQuotaReserve(providerKey)) return null;
  const error = quotaReserveError(draft);

  return (
    <>
      <div className="form-group">
        <label>{t('auth_files.reserve.label')}</label>
        <ToggleSwitch
          checked={draft.enabled}
          onChange={(enabled) => onChange({ enabled })}
          disabled={disabled}
          ariaLabel={t('auth_files.reserve.label')}
        />
        <div className="hint">{t('auth_files.reserve.hint')}</div>
      </div>
      {draft.enabled && (
        <>
          <Input
            label={t('auth_files.reserve.percent_label')}
            type="number"
            min={1}
            max={99}
            step={1}
            value={draft.percent}
            placeholder="25"
            error={error ? t(error) : undefined}
            disabled={disabled}
            onChange={(event) => onChange({ percent: event.target.value })}
          />
          <div className="form-group">
            <label id={modeLabelId}>{t('auth_files.reserve.mode_label')}</label>
            <Select
              ariaLabelledBy={modeLabelId}
              value={draft.mode}
              options={[
                { value: 'soft', label: t('auth_files.reserve.mode_soft') },
                { value: 'hard', label: t('auth_files.reserve.mode_hard') },
              ]}
              disabled={disabled}
              onChange={(mode) => onChange({ mode: mode as AuthFileQuotaReserveMode })}
            />
            <div className="hint">
              {t(
                draft.mode === 'hard'
                  ? 'auth_files.reserve.mode_hard_hint'
                  : 'auth_files.reserve.mode_soft_hint'
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
