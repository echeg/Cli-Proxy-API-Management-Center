import { describe, expect, test } from 'bun:test';
import {
  readSubscriptionRouting,
  subscriptionRoutingPatch,
} from '@/services/api/subscriptionRouting';
import { normalizeConfigResponse } from '@/services/api/transformers';
import { goDurationSeconds } from '@/features/config/visualConfigAdditions';
import { parseRoutingStrategy } from '@/hooks/useVisualConfig';

describe('subscription routing settings', () => {
  test('reads v8 routing and preserves affinity settings', () => {
    const config = normalizeConfigResponse({
      routing: {
        strategy: 'earliest-reset',
        'session-affinity': true,
        'session-affinity-ttl': '24h',
      },
    });
    expect(readSubscriptionRouting(config)).toEqual({
      strategy: 'earliest-reset',
      sessionAffinity: true,
      sessionAffinityTTL: '24h',
    });
    expect(parseRoutingStrategy('earliest-reset')).toBe('earliest-reset');
  });
  test('patches only changed fields, preserving concurrent edits to other settings', () => {
    const before = readSubscriptionRouting({ routingStrategy: 'round-robin' });
    expect(subscriptionRoutingPatch(before, { ...before, strategy: 'earliest-reset' })).toEqual({
      strategy: 'earliest-reset',
    });
    expect(
      subscriptionRoutingPatch(before, {
        ...before,
        sessionAffinity: true,
        sessionAffinityTTL: ' 24h ',
      })
    ).toEqual({ 'session-affinity': true, 'session-affinity-ttl': '24h' });
    expect(subscriptionRoutingPatch(before, before)).toEqual({});
  });
  test('TTL validation follows positive Go durations including composites', () => {
    expect(goDurationSeconds('1h30m')).toBe(5400);
    expect(goDurationSeconds('24h')).toBe(86400);
    expect(goDurationSeconds('one hour')).toBeUndefined();
    expect(goDurationSeconds('1d')).toBeUndefined();
    expect(goDurationSeconds('999999999999999999999h')).toBeUndefined();
    expect(goDurationSeconds('0s')).toBe(0);
    expect(goDurationSeconds('-1h')).toBeLessThan(0);
  });
});
