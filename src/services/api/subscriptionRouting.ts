import type { Config } from '@/types';
import { apiClient } from './client';

export interface SubscriptionRoutingSettings {
  strategy: string;
  sessionAffinity: boolean;
  sessionAffinityTTL: string;
}

export function readSubscriptionRouting(config: Config): SubscriptionRoutingSettings {
  return {
    strategy: config.routingStrategy || 'round-robin',
    sessionAffinity: config.routingSessionAffinity ?? false,
    sessionAffinityTTL: config.routingSessionAffinityTTL || '1h',
  };
}

/** Patch only edited fields so independent config edits are preserved. */
export function subscriptionRoutingPatch(
  before: SubscriptionRoutingSettings,
  after: SubscriptionRoutingSettings
): Record<string, unknown> {
  const routing: Record<string, unknown> = {};
  if (before.strategy !== after.strategy) routing.strategy = after.strategy;
  if (before.sessionAffinity !== after.sessionAffinity)
    routing['session-affinity'] = after.sessionAffinity;
  if (before.sessionAffinityTTL !== after.sessionAffinityTTL.trim()) {
    routing['session-affinity-ttl'] = after.sessionAffinityTTL.trim();
  }
  return routing;
}

export const subscriptionRoutingApi = {
  update: (before: SubscriptionRoutingSettings, after: SubscriptionRoutingSettings) =>
    apiClient.patch('/config', { routing: subscriptionRoutingPatch(before, after) }),
};
