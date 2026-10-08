import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import type { ResolvedTheme } from '@/types';
import { normalizeAuthIndex } from '@/utils/quota';
import { buildCompactCardModel } from '../compactCardModel';
import type { QuotaFileEntry } from '../logic';
import type { QuotaCardState } from '../providers';
import {
  claudeResetOperationKey,
  resetGrantOperations,
} from '../providers/claude/resetGrantOperations';
import { codexResetAction, countResets } from '../resetActions';
import { QuotaCompactCard } from './QuotaCompactCard';
import { ClaudeResetActionMount, ResetActionFooter } from './QuotaLedgerResets';
import styles from './QuotaCompactCardItem.module.scss';

interface Props {
  entry: QuotaFileEntry;
  quota: QuotaCardState | undefined;
  resolvedTheme: ResolvedTheme;
  now: number;
  showEmails: boolean;
  canRefresh: boolean;
  /** A Codex reset for this credential is in flight. */
  codexResetting: boolean;
  onRefresh: () => void;
  /** Spends a Codex reset without a modal; the card collects the confirmation. */
  onReset: () => Promise<unknown> | void;
}

/** A compact card wired to the shared refresh and use-a-reset flows. */
export function QuotaCompactCardItem({
  entry,
  quota,
  resolvedTheme,
  now,
  showEmails,
  canRefresh,
  codexResetting,
  onRefresh,
  onReset,
}: Props) {
  const { t, i18n } = useTranslation();
  const [claudeArmed, setClaudeArmed] = useState(false);
  const [claudeResetting, setClaudeResetting] = useState(false);
  const startRef = useRef<HTMLDivElement>(null);
  const wasArmed = useRef(false);
  const model = buildCompactCardModel({
    entry,
    quota,
    t,
    nowMs: now,
    showEmails,
    locale: i18n.resolvedLanguage,
  });
  const count = countResets(model.resets?.items ?? []);
  const loading = model.state === 'loading';
  const resetting = codexResetting || claudeResetting;
  const blocked = !canRefresh || loading || Boolean(entry.file.disabled);
  // The journal outlives any open flow; re-read it on every render (claims refresh quota).
  const unresolved =
    entry.type === 'claude' &&
    resetGrantOperations.hasUnresolved(
      claudeResetOperationKey(
        entry.file.name,
        normalizeAuthIndex(entry.file.auth_index ?? entry.file.authIndex)
      )
    );

  // Return focus to the card's own "Use a reset…" once the Claude flow unmounts.
  useEffect(() => {
    if (claudeArmed) wasArmed.current = true;
    else if (wasArmed.current) {
      wasArmed.current = false;
      startRef.current?.querySelector<HTMLButtonElement>('[data-resets-use]')?.focus();
    }
  }, [claudeArmed]);
  const disarm = useCallback(() => setClaudeArmed(false), []);

  let resetAction = null;
  if (entry.type === 'codex' && count > 0) {
    resetAction = (
      <ResetActionFooter
        provider="codex"
        action={codexResetAction(t, count, {
          blocked: blocked || resetting,
          busy: codexResetting,
          onConfirm: onReset,
        })}
      />
    );
  } else if (entry.type === 'claude' && (count > 0 || unresolved)) {
    resetAction =
      claudeArmed || claudeResetting ? (
        <ClaudeResetActionMount
          file={entry.file}
          refreshToken={quota}
          enabled={quota?.status === 'success'}
          disabled={blocked}
          displayName={model.name}
          showEmails={showEmails}
          onRefresh={onRefresh}
          onBusyChange={setClaudeResetting}
        >
          {(action) => (
            <ResetActionFooter
              provider="claude"
              action={action}
              initialConfirming
              onClose={disarm}
            />
          )}
        </ClaudeResetActionMount>
      ) : (
        <div ref={startRef} className={styles.claudeStart}>
          {unresolved && (
            <span className={styles.unresolved}>
              {t('quota_management.resets.chip_unresolved')}
            </span>
          )}
          <Button
            variant="secondary"
            size="sm"
            data-resets-use=""
            disabled={blocked}
            onClick={() => setClaudeArmed(true)}
          >
            {unresolved ? t('claude_reset.retry') : t('quota_management.resets.use')}
          </Button>
        </div>
      );
  }

  return (
    <QuotaCompactCard
      entry={entry}
      model={model}
      resolvedTheme={resolvedTheme}
      now={now}
      canRefresh={canRefresh && !entry.file.disabled}
      onRefresh={onRefresh}
      busy={resetting}
      resetAction={resetAction}
    />
  );
}
