import { apiClient } from '@/services/api/client';
import { authFilesApi } from '@/services/api/authFiles';
import type { AnthropicResetSettledCode } from '@/services/api/claudeResetGrants';

export type ClaudeClaimCooldownResult = 'cleared' | 'skipped' | 'failed';

/** Clears the proxy cooldown after a settled claim, matching Codex reset parity.
 * `skipped` means nothing to report: the claim did not spend, or the connection changed.
 */
export async function clearClaudeCooldownAfterClaim(
  authIndex: string,
  answer: { code: AnthropicResetSettledCode; unresolved: boolean },
  revision: number
): Promise<ClaudeClaimCooldownResult> {
  if (answer.unresolved || (answer.code !== 'reset' && answer.code !== 'already_used')) {
    return 'skipped';
  }
  // Never clear or report against a replacement connection.
  if (revision !== apiClient.getConnectionRevision()) return 'skipped';
  try {
    const result = await authFilesApi.resetCooldown(authIndex);
    if (revision !== apiClient.getConnectionRevision()) return 'skipped';
    return result.status === 'ok' && result.auth_index === authIndex ? 'cleared' : 'failed';
  } catch {
    return revision === apiClient.getConnectionRevision() ? 'failed' : 'skipped';
  }
}
