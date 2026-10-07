import { useTranslation } from 'react-i18next';
import { IconRefreshCw } from '@/components/ui/icons';
import { useCountUp } from '@/hooks/motion';
import styles from './QuotaHeader.module.scss';

export type QuotaHeaderProps = {
  totalCount: number;
  loadedCount: number;
  attentionCount: number;
  refreshing: boolean;
  lastRefreshAt?: number | null;
  disableControls: boolean;
  onRefreshAll: () => void;
  showEmails?: boolean;
  onToggleEmails?: () => void;
};

/**
 * Quota heading, credential counts, privacy toggle, and refresh action.
 * The page shell coordinates the data-reveal entrance sequence.
 */
export function QuotaHeader(props: QuotaHeaderProps) {
  const {
    totalCount,
    loadedCount,
    attentionCount,
    refreshing,
    lastRefreshAt,
    disableControls,
    onRefreshAll,
    showEmails,
    onToggleEmails,
  } = props;
  const { t, i18n } = useTranslation();
  // Animate the loaded count as batches finish.
  const displayLoadedCount = useCountUp(loadedCount);
  const lastRefreshDate = lastRefreshAt == null ? null : new Date(lastRefreshAt);
  const validLastRefresh =
    lastRefreshDate && Number.isFinite(lastRefreshDate.getTime()) ? lastRefreshDate : null;
  const locale = i18n.resolvedLanguage ?? i18n.language;

  return (
    <header className={styles.header}>
      <div className={styles.copy}>
        <h1 className={styles.title} data-reveal>
          {t('quota_management.title')}
        </h1>
        <p className={styles.meta} data-reveal>
          <span className={styles.metaTotal}>
            {t('quota_management.meta_credentials', { count: totalCount })}
          </span>
          <span className={styles.metaDot} aria-hidden="true">
            ·
          </span>
          <span className={loadedCount > 0 ? styles.metaLoaded : styles.metaMuted}>
            {t('quota_management.meta_loaded', { count: displayLoadedCount })}
          </span>
          {attentionCount > 0 && (
            <>
              <span className={styles.metaDot} aria-hidden="true">
                ·
              </span>
              <span className={styles.metaAttention}>
                {t('quota_management.meta_attention', { count: attentionCount })}
              </span>
            </>
          )}
        </p>
      </div>
      <div className={styles.actions} data-reveal>
        {onToggleEmails && (
          <button
            type="button"
            className={styles.privacyAction}
            onClick={onToggleEmails}
            aria-pressed={showEmails}
          >
            {t(
              showEmails
                ? 'quota_management.ledger.hide_emails'
                : 'quota_management.ledger.show_emails'
            )}
          </button>
        )}
        <button
          type="button"
          className={styles.primaryAction}
          onClick={onRefreshAll}
          disabled={disableControls || refreshing}
          aria-busy={refreshing}
        >
          <IconRefreshCw size={14} className={refreshing ? styles.spinning : undefined} />
          <span className={styles.actionCopy}>
            <span>{t('quota_management.refresh_all_credentials')}</span>
            {validLastRefresh && (
              <time
                className={styles.lastRefresh}
                dateTime={validLastRefresh.toISOString()}
                title={validLastRefresh.toLocaleString(locale, {
                  dateStyle: 'full',
                  timeStyle: 'long',
                })}
              >
                {t('quota_management.last_refresh', {
                  time: validLastRefresh.toLocaleString(locale, {
                    dateStyle: 'short',
                    timeStyle: 'medium',
                  }),
                })}
              </time>
            )}
          </span>
        </button>
      </div>
    </header>
  );
}
