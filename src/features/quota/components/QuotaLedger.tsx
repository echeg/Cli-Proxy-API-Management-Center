import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { IconRefreshCw } from '@/components/ui/icons';
import { useNow } from '@/hooks/useNow';
import type { AuthFileItem, ResolvedTheme } from '@/types';
import { buildResetDisplay, formatInstantShort, resolveQuotaErrorMessage } from '@/utils/quota';
import { getQuotaCacheKey, getQuotaDisplayName } from '@/utils/quota/identity';
import { getAuthFileIcon, getTypeLabel } from '@/features/authFiles/constants';
import { QUOTA_TAB_ORDER } from '../constants';
import {
  ledgerPlanLabel,
  ledgerWindows,
  maskQuotaName,
  maskQuotaText,
  primaryLedgerWindow,
  summarizeLedgerWindows,
} from '../ledgerModel';
import type { LedgerWindow } from '../ledgerModel';
import type { QuotaFileEntry } from '../logic';
import type { QuotaCardState } from '../providers';
import { codexResetAction, countResets, formatMonthDay } from '../resetActions';
import { buildResetInventory } from '../resetInventory';
import {
  ClaudeLedgerResetsDrawer,
  QuotaLedgerResetsChip,
  QuotaLedgerResetsDrawer,
} from './QuotaLedgerResets';
import styles from './QuotaLedger.module.scss';

type Props = {
  entries: QuotaFileEntry[];
  summaryEntries: QuotaFileEntry[];
  quotaFor: (entry: QuotaFileEntry) => QuotaCardState | undefined;
  resolvedTheme: ResolvedTheme;
  showEmails: boolean;
  canRefresh: boolean;
  onRefresh: (entry: QuotaFileEntry) => void;
  /** Spends a Codex reset without a modal; the drawer collects the confirmation. */
  onReset?: (entry: QuotaFileEntry) => Promise<unknown> | void;
  /** Cache keys of the credentials whose Codex reset is in flight. */
  resettingKeys?: ReadonlySet<string>;
  /** Pins the clock (SSR tests); defaults to the shared minute clock. */
  now?: number;
};

function Meter({ remaining, reserve }: { remaining: number | null; reserve?: number }) {
  const tone =
    remaining === null
      ? ''
      : remaining >= 70
        ? styles.high
        : remaining >= 30
          ? styles.medium
          : styles.low;
  const track = (
    <div className={styles.track} aria-hidden="true">
      <span className={tone} style={{ width: `${remaining ?? 0}%` }} />
    </div>
  );
  if (reserve === undefined) return track;
  // The fill ends left of the tick exactly when the window is below the reserve.
  return (
    <div className={styles.meter}>
      {track}
      <i
        className={styles.reserveTick}
        data-reserve-tick=""
        style={{ left: `${reserve}%` }}
        aria-hidden="true"
      />
    </div>
  );
}

/** Shows the backend's reserve verdict as-is; the Ledger never recomputes it. */
function ReserveBadge({ file }: { file: AuthFileItem }) {
  const { t } = useTranslation();
  const reserve = file.quotaReserve;
  if (!reserve) return null;
  const hard = reserve.mode === 'hard';
  const mode = t(
    hard ? 'quota_management.reserve.mode_hard' : 'quota_management.reserve.mode_soft'
  );
  let text: string;
  let title: string;
  if (!file.quotaReserveActive) {
    text = t('quota_management.reserve.badge', { percent: reserve.percent, mode });
    title = t(hard ? 'quota_management.reserve.idle_hard' : 'quota_management.reserve.idle_soft', {
      percent: reserve.percent,
    });
  } else if (file.quotaReserveUntil) {
    // The API layer keeps only a parseable `quota_reserve_until`.
    const untilMs = Date.parse(file.quotaReserveUntil);
    text = t('quota_management.reserve.badge_held', { date: formatMonthDay(untilMs), mode });
    title = t(hard ? 'quota_management.reserve.held_hard' : 'quota_management.reserve.held_soft', {
      date: formatInstantShort(untilMs),
    });
  } else {
    text = t('quota_management.reserve.badge_held_open', { mode });
    title = t(
      hard ? 'quota_management.reserve.held_hard_open' : 'quota_management.reserve.held_soft_open'
    );
  }
  return (
    <span
      className={styles.reserve}
      data-reserve-badge=""
      data-tone={file.quotaReserveActive ? 'warn' : undefined}
      title={title}
    >
      {text}
    </span>
  );
}

function Reset({ atMs, now }: { atMs: number | null; now: number }) {
  const { t, i18n } = useTranslation();
  const display = buildResetDisplay(null, atMs, now, i18n.resolvedLanguage);
  return (
    <div className={styles.reset}>
      {display ? (
        <>
          {display.relative && <span>{display.relative} · </span>}
          {display.absolute}
        </>
      ) : (
        t('quota_management.ledger.reset_unknown')
      )}
    </div>
  );
}

function WindowCell({
  window,
  reserve,
  now,
}: {
  window: LedgerWindow;
  reserve?: number;
  now: number;
}) {
  return (
    <div className={styles.window}>
      <div className={styles.windowHeading}>
        <span>{window.label}</span>
        <strong>{window.remaining === null ? '--' : `${Math.round(window.remaining)}%`}</strong>
      </div>
      <Meter remaining={window.remaining} reserve={reserve} />
      <Reset atMs={window.resetAtMs} now={now} />
    </div>
  );
}

function SummaryWindow({
  aggregate,
  entries,
  now,
}: {
  aggregate: ReturnType<typeof summarizeLedgerWindows>;
  entries: QuotaFileEntry[];
  now: number;
}) {
  const { t } = useTranslation();
  const label = aggregate.primary?.label ?? t('quota_management.ledger.remaining');
  return (
    <div className={styles.summaryWindow} role="group" aria-label={label}>
      <div className={styles.summaryLabel}>{label}</div>
      <div className={styles.total}>
        <strong>
          {aggregate.remaining === null ? '--' : `${Math.round(aggregate.remaining)}%`}
        </strong>
        <span>{t('quota_management.ledger.capacity', { value: aggregate.capacity })}</span>
      </div>
      <div className={styles.segments}>
        {aggregate.windows.map((window, index) => (
          <Meter
            key={getQuotaCacheKey(entries[index].file)}
            remaining={window?.remaining ?? null}
          />
        ))}
      </div>
      <Reset atMs={aggregate.resetAtMs} now={now} />
      {aggregate.knownCount < entries.length && (
        <div className={styles.coverage}>
          {t('quota_management.ledger.observed', {
            count: aggregate.knownCount,
            total: entries.length,
          })}
        </div>
      )}
    </div>
  );
}

function LedgerRow({
  entry,
  quota,
  showEmails,
  canRefresh,
  onRefresh,
  onReset,
  codexResetting,
  now,
}: {
  entry: QuotaFileEntry;
  quota?: QuotaCardState;
  showEmails: boolean;
  canRefresh: boolean;
  onRefresh: () => void;
  onReset?: () => Promise<unknown> | void;
  codexResetting: boolean;
  now: number;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [resetsOpen, setResetsOpen] = useState(false);
  const [claudeResetting, setClaudeResetting] = useState(false);
  const resetsId = useId();
  const resets = buildResetInventory(entry.type, quota, now);
  const windows = ledgerWindows(entry.type, quota, t);
  const primary = primaryLedgerWindow(windows);
  const ordered = primary ? [primary, ...windows.filter((window) => window !== primary)] : windows;
  const name = getQuotaDisplayName(entry.file);
  const label = showEmails ? name : maskQuotaName(name);
  const loading = quota?.status === 'loading';
  const resetting = codexResetting || claudeResetting;
  const actionsBlocked = !canRefresh || loading || Boolean(entry.file.disabled);
  const plan = ledgerPlanLabel(entry.type, quota, t);
  const errorMessage = resolveQuotaErrorMessage(
    t,
    quota?.errorStatus,
    quota?.error || t('common.unknown_error')
  );

  return (
    <article className={styles.row} aria-busy={loading}>
      <div className={styles.identity}>
        <span className={styles.name} title={label}>
          {label}
        </span>
        <span className={styles.plan}>{plan || getTypeLabel(t, entry.type)}</span>
        <div className={styles.tags}>
          <QuotaLedgerResetsChip
            inventory={resets}
            expanded={resetsOpen}
            loading={loading}
            controls={resetsId}
            showEmails={showEmails}
            now={now}
            // The drawer that started a reset stays open until it settles.
            onToggle={() => setResetsOpen(resetting || !resetsOpen)}
          />
          <ReserveBadge file={entry.file} />
        </div>
      </div>
      <div className={styles.windows}>
        {ordered.length ? (
          (expanded ? ordered : ordered.slice(0, 3)).map((window) => (
            <WindowCell
              key={window.id}
              window={window}
              reserve={entry.file.quotaReserve?.percent}
              now={now}
            />
          ))
        ) : (
          <div className={styles.state}>
            {quota?.status === 'error' ? (
              <span role="alert">{showEmails ? errorMessage : maskQuotaText(errorMessage)}</span>
            ) : loading ? (
              t('common.loading')
            ) : (
              t('quota_management.ledger.load_hint')
            )}
          </div>
        )}
        {ordered.length > 3 && (
          <button
            type="button"
            className={styles.more}
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
          >
            {t(expanded ? 'quota_management.ledger.less' : 'quota_management.ledger.more', {
              count: ordered.length - 3,
            })}
          </button>
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        disabled={actionsBlocked || resetting}
        onClick={onRefresh}
        aria-label={t('quota_management.ledger.refresh_credential', { name: label })}
      >
        <IconRefreshCw size={15} />
      </Button>
      {resetsOpen &&
        (entry.type === 'claude' ? (
          <ClaudeLedgerResetsDrawer
            id={resetsId}
            inventory={resets}
            loading={loading}
            showEmails={showEmails}
            now={now}
            file={entry.file}
            refreshToken={quota}
            enabled={quota?.status === 'success'}
            disabled={actionsBlocked}
            displayName={label}
            onRefresh={onRefresh}
            onBusyChange={setClaudeResetting}
          />
        ) : (
          <QuotaLedgerResetsDrawer
            id={resetsId}
            provider={entry.type}
            inventory={resets}
            loading={loading}
            showEmails={showEmails}
            now={now}
            action={
              entry.type === 'codex' && onReset
                ? codexResetAction(t, countResets(resets?.items ?? []), {
                    blocked: actionsBlocked || resetting,
                    busy: codexResetting,
                    onConfirm: onReset,
                  })
                : undefined
            }
          />
        ))}
    </article>
  );
}

export function QuotaLedger({
  entries,
  summaryEntries,
  quotaFor,
  resolvedTheme,
  showEmails,
  canRefresh,
  onRefresh,
  onReset,
  resettingKeys,
  now: nowProp,
}: Props) {
  const { t } = useTranslation();
  const clock = useNow();
  const now = nowProp ?? clock;
  const groups = useMemo(
    () =>
      QUOTA_TAB_ORDER.map((provider) => ({
        provider,
        entries: entries.filter((entry) => entry.type === provider),
        summary: summaryEntries.filter((entry) => entry.type === provider),
      })).filter((group) => group.summary.length > 0),
    [entries, summaryEntries]
  );

  return (
    <div className={styles.ledger}>
      <div className={styles.summaries}>
        {groups.map(({ provider, summary }) => {
          const windowRows = summary.map((entry) => ledgerWindows(provider, quotaFor(entry), t));
          const aggregate = summarizeLedgerWindows(windowRows, now);
          const weeklyAggregates =
            provider === 'claude'
              ? ['seven-day', 'seven-day-fable']
                  .map((id) =>
                    summarizeLedgerWindows(
                      windowRows.map((windows) => windows.filter((window) => window.id === id)),
                      now
                    )
                  )
                  .filter((window) => window.primary)
              : [];
          const aggregates = weeklyAggregates.length ? weeklyAggregates : [aggregate];
          const icon = getAuthFileIcon(provider, resolvedTheme);
          return (
            <section
              className={styles.summary}
              key={provider}
              aria-label={getTypeLabel(t, provider)}
            >
              <div className={styles.summaryHeader}>
                <strong>
                  {icon && <img src={icon} alt="" />}
                  {getTypeLabel(t, provider)}
                </strong>
                <span>{t('quota_management.meta_credentials', { count: summary.length })}</span>
              </div>
              {aggregates.map((window) => (
                <SummaryWindow
                  key={window.primary?.id ?? 'remaining'}
                  aggregate={window}
                  entries={summary}
                  now={now}
                />
              ))}
            </section>
          );
        })}
      </div>
      {groups
        .filter((group) => group.entries.length > 0)
        .map(({ provider, entries: rows }) => (
          <section className={styles.group} key={provider}>
            <h2>
              {getTypeLabel(t, provider)} <span>{rows.length}</span>
            </h2>
            {rows.map((entry) => (
              <LedgerRow
                key={getQuotaCacheKey(entry.file)}
                entry={entry}
                quota={quotaFor(entry)}
                now={now}
                showEmails={showEmails}
                canRefresh={canRefresh}
                onRefresh={() => onRefresh(entry)}
                onReset={onReset ? () => onReset(entry) : undefined}
                codexResetting={resettingKeys?.has(getQuotaCacheKey(entry.file)) ?? false}
              />
            ))}
          </section>
        ))}
      <p className={styles.note}>{t('quota_management.ledger.note')}</p>
    </div>
  );
}
