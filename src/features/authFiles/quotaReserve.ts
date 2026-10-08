import { parseAuthFileQuotaReserve, type AuthFileFieldsPatch } from '@/services/api/authFiles';
import type { AuthFileQuotaReserve, AuthFileQuotaReserveMode } from '@/types/authFile';

/** Editor draft for the per-credential quota reserve (`quota_reserve` in the auth JSON). */
export type QuotaReserveDraft = {
  enabled: boolean;
  percent: string;
  mode: AuthFileQuotaReserveMode;
  touched: boolean;
};

export type QuotaReserveError = 'auth_files.reserve.percent_invalid';

const PERCENT_PATTERN = /^\d+$/;

/** The backend rejects a reserve on any other provider with a 400. */
export const supportsQuotaReserve = (providerKey: string): boolean =>
  providerKey === 'codex' || providerKey === 'claude';

const parsePercent = (text: string): number | null => {
  const trimmed = text.trim();
  if (!PERCENT_PATTERN.test(trimmed)) return null;
  const percent = Number(trimmed);
  return percent >= 1 && percent <= 99 ? percent : null;
};

/** The auth JSON is the source of truth; the listed entry covers a JSON without the field. */
export function readQuotaReserveDraft(
  json: Record<string, unknown>,
  fallback?: AuthFileQuotaReserve
): QuotaReserveDraft {
  const reserve =
    json.quota_reserve === undefined ? fallback : parseAuthFileQuotaReserve(json.quota_reserve);
  return reserve
    ? { enabled: true, percent: String(reserve.percent), mode: reserve.mode, touched: false }
    : { enabled: false, percent: '', mode: 'soft', touched: false };
}

export function quotaReserveError(draft?: QuotaReserveDraft): QuotaReserveError | null {
  if (!draft?.touched || !draft.enabled) return null;
  return parsePercent(draft.percent) === null ? 'auth_files.reserve.percent_invalid' : null;
}

export function buildQuotaReservePatch(
  original: Record<string, unknown>,
  draft: QuotaReserveDraft | undefined,
  providerKey: string
): Pick<AuthFileFieldsPatch, 'quota_reserve'> {
  if (!draft?.touched || !supportsQuotaReserve(providerKey)) return {};
  const current = parseAuthFileQuotaReserve(original.quota_reserve);
  if (!draft.enabled) {
    return original.quota_reserve === undefined ? {} : { quota_reserve: null };
  }
  const percent = parsePercent(draft.percent);
  if (percent === null) return {};
  if (current && current.percent === percent && current.mode === draft.mode) return {};
  return { quota_reserve: { percent, mode: draft.mode } };
}
