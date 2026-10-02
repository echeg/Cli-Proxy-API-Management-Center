import type { SubscriptionActivity } from '@/services/api/subscriptionRouting';
import type { AuthFileItem } from '@/types';

export function latestSubscriptionActivity(
  accounts: SubscriptionActivity[],
  provider: string,
  files: AuthFileItem[]
) {
  const known = new Set(files.map((file) => String(file.authIndex ?? '')));
  return accounts
    .filter((account) => account.provider === provider && known.has(account.authIndex))
    .sort((a, b) => Date.parse(b.lastSelectedAt) - Date.parse(a.lastSelectedAt))[0];
}
