/**
 * The Ledger's view of a subscription's manual resets: a compact chip under
 * the plan label and a full-width drawer under the row.
 *
 * They are separate exports because they live in different grid cells of
 * `LedgerRow`; the row owns the expanded state and the inventory, and passes
 * both down. Everything here renders from `buildResetInventory`, never from
 * `QuotaBody` classes — those bind at module init and break SSR tests.
 */

import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Button } from '@/components/ui/Button';
import { buildResetDisplay, formatInstantShort } from '@/utils/quota';
import { DAY_MS } from '@/utils/time/durations';
import { maskQuotaText } from '../ledgerModel';
import type { QuotaProviderType } from '../providers/types';
import type { ResetInventory, ResetInventoryItem } from '../resetInventory';
import styles from './QuotaLedgerResets.module.scss';

/** The chip turns amber when the soonest reset lapses within this window. */
const EXPIRY_WARNING_MS = 3 * DAY_MS;

/** Resets a subscription holds: a Codex credit is one, a Claude grant counts its `left`. */
const countResets = (items: readonly ResetInventoryItem[]): number =>
  items.reduce((sum, item) => sum + (item.left ?? 1), 0);

/** `MM/DD`, browser-local — the chip's short form of `formatInstantShort`. */
const formatMonthDay = (ms: number): string =>
  new Date(ms).toLocaleDateString(undefined, { month: '2-digit', day: '2-digit' });

const itemLabel = (
  t: TFunction,
  item: ResetInventoryItem,
  index: number,
  showEmails: boolean
): string => {
  if (!item.label) return t('quota_management.resets.unnamed', { index: index + 1 });
  return showEmails ? item.label : maskQuotaText(item.label);
};

type ChipProps = {
  inventory: ResetInventory | null;
  expanded: boolean;
  loading: boolean;
  controls: string;
  showEmails: boolean;
  now: number;
  onToggle: () => void;
};

export function QuotaLedgerResetsChip({
  inventory,
  expanded,
  loading,
  controls,
  showEmails,
  now,
  onToggle,
}: ChipProps) {
  const { t } = useTranslation();
  const items = inventory?.items ?? [];
  const count = countResets(items);

  if (!expanded && inventory?.error !== undefined) {
    const detail = showEmails ? inventory.error : maskQuotaText(inventory.error);
    return (
      <span className={styles.error} title={detail || undefined}>
        {t('quota_management.resets.load_error')}
      </span>
    );
  }
  // An open drawer keeps its toggle through a refresh or a failed read, so it can be closed.
  if (!expanded && count === 0) return null;

  const soonest = items[0]?.expiresAtMs ?? null;
  let text: string;
  if (count > 0) {
    const many = count > 1;
    text =
      soonest === null
        ? t(
            many
              ? 'quota_management.resets.chip_many_open'
              : 'quota_management.resets.chip_one_open',
            {
              count,
            }
          )
        : t(many ? 'quota_management.resets.chip_many' : 'quota_management.resets.chip_one', {
            count,
            date: formatMonthDay(soonest),
          });
  } else if (loading) {
    text = t('quota_management.resets.loading');
  } else if (inventory?.error !== undefined || !inventory) {
    text = t('quota_management.resets.load_error');
  } else {
    text = t('quota_management.resets.empty');
  }
  const warn = soonest !== null && soonest - now <= EXPIRY_WARNING_MS;
  const title = items
    .map((item) =>
      item.expiresAtMs === null
        ? t('quota_management.resets.no_expiry')
        : formatInstantShort(item.expiresAtMs)
    )
    .join('\n');

  return (
    <button
      type="button"
      className={styles.chip}
      data-resets-chip=""
      data-tone={warn ? 'warn' : undefined}
      aria-expanded={expanded}
      aria-controls={controls}
      title={title || undefined}
      onClick={onToggle}
    >
      <span>{text}</span>
      <span className={styles.caret} aria-hidden="true">
        {expanded ? '▴' : '▾'}
      </span>
    </button>
  );
}

type DrawerProps = {
  id: string;
  provider: QuotaProviderType;
  inventory: ResetInventory | null;
  loading: boolean;
  showEmails: boolean;
  now: number;
  /** Starts the use-a-reset flow; the button is disabled until a flow is wired. */
  onUse?: () => void;
};

function ResetLine({
  item,
  index,
  showEmails,
  now,
}: {
  item: ResetInventoryItem;
  index: number;
  showEmails: boolean;
  now: number;
}) {
  const { t, i18n } = useTranslation();
  const display =
    item.expiresAtMs === null
      ? null
      : buildResetDisplay(null, item.expiresAtMs, now, i18n.resolvedLanguage);
  const windows = (item.clears ?? [])
    .map((window) => t(`quota_management.resets.windows.${window}`))
    .join(' + ');
  const claudeDetail =
    item.left === undefined
      ? null
      : t(
          windows
            ? 'quota_management.resets.claude_left'
            : 'quota_management.resets.claude_left_only',
          { left: item.left, total: item.total ?? item.left, windows }
        );

  return (
    <li className={styles.line}>
      <div className={styles.lineHeading}>
        <span className={styles.label}>{itemLabel(t, item, index, showEmails)}</span>
        {index === 0 && (
          <span className={styles.soonest}>{t('quota_management.resets.soonest')}</span>
        )}
      </div>
      {claudeDetail && <div className={styles.detail}>{claudeDetail}</div>}
      <div className={styles.expiry}>
        {display
          ? t('quota_management.resets.expires_line', {
              date: display.absolute,
              relative: display.relative,
            })
          : t('quota_management.resets.no_expiry')}
      </div>
    </li>
  );
}

export function QuotaLedgerResetsDrawer({
  id,
  provider,
  inventory,
  loading,
  showEmails,
  now,
  onUse,
}: DrawerProps) {
  const { t } = useTranslation();
  const items = inventory?.items ?? [];
  const title = t('quota_management.resets.title');

  let body;
  if (loading) {
    body = <p className={styles.status}>{t('quota_management.resets.loading')}</p>;
  } else if (!inventory || inventory.error !== undefined) {
    body = <p className={styles.status}>{t('quota_management.resets.load_error')}</p>;
  } else if (!items.length) {
    body = <p className={styles.status}>{t('quota_management.resets.empty')}</p>;
  } else {
    body = (
      <>
        <p className={styles.hint}>{t('quota_management.resets.hint')}</p>
        <ul className={styles.list}>
          {items.map((item, index) => (
            <ResetLine key={item.id} item={item} index={index} showEmails={showEmails} now={now} />
          ))}
        </ul>
        <div className={styles.footer}>
          {provider === 'codex' && (
            <span className={styles.note}>{t('quota_management.resets.codex_choice_note')}</span>
          )}
          <Button variant="secondary" size="sm" disabled={!onUse} onClick={onUse}>
            {t('quota_management.resets.use')}
          </Button>
        </div>
      </>
    );
  }

  return (
    <section id={id} className={styles.drawer} aria-label={title}>
      <div className={styles.header}>
        <strong>{title}</strong>{' '}
        {items.length > 0 && <span className={styles.count}>{countResets(items)}</span>}
      </div>
      {body}
    </section>
  );
}
