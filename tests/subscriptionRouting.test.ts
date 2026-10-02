import { beforeAll, describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18n from '@/i18n';
import {
  readSubscriptionRouting,
  readSubscriptionActivity,
  subscriptionRoutingPatch,
} from '@/services/api/subscriptionRouting';
import { normalizeConfigResponse } from '@/services/api/transformers';
import { goDurationSeconds } from '@/features/config/visualConfigAdditions';
import { parseRoutingStrategy } from '@/hooks/useVisualConfig';
import { SubscriptionAccounts } from '@/features/quota/components/SubscriptionAccounts';
import { latestSubscriptionActivity } from '@/features/quota/routingModel';

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

describe('subscription routing settings', () => {
  test('reads v8 routing and preserves affinity settings', () => {
    const config = normalizeConfigResponse({
      routing: {
        strategy: 'earliest-reset',
        'session-affinity': true,
        'session-affinity-ttl': '24h',
        'preferred-accounts': { codex: 'account-1' },
      },
    });
    expect(readSubscriptionRouting(config)).toEqual({
      strategy: 'earliest-reset',
      sessionAffinity: true,
      sessionAffinityTTL: '24h',
      preferredAccounts: { codex: 'account-1' },
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
  test('changes and clears only edited provider preferences', () => {
    const before = readSubscriptionRouting({
      routingPreferredAccounts: { codex: 'one', claude: 'two' },
    });
    expect(
      subscriptionRoutingPatch(before, {
        ...before,
        preferredAccounts: { codex: '', claude: 'two' },
      })
    ).toEqual({ 'preferred-accounts': { codex: null } });
    expect(
      subscriptionRoutingPatch(before, {
        ...before,
        preferredAccounts: { codex: 'three', claude: 'two' },
      })
    ).toEqual({ 'preferred-accounts': { codex: 'three' } });
  });
  test('activity uses real selections and ignores invalid or removed accounts', () => {
    const accounts = readSubscriptionActivity({
      accounts: [
        { auth_index: 'one', provider: 'codex', last_selected_at: '2026-10-02T12:30:00Z' },
        { auth_index: 'two', provider: 'codex', last_selected_at: '2026-10-02T12:31:00Z' },
        { auth_index: 'removed', provider: 'codex', last_selected_at: '2026-10-02T12:33:00Z' },
        { auth_index: 'invalid', provider: 'codex', last_selected_at: 'no-date' },
        { auth_index: 'unselected', provider: 'codex', status: 'active' },
      ],
    });
    const files = [
      { name: 'a', authIndex: 'one' },
      { name: 'b', authIndex: 'two' },
    ];
    expect(accounts).toHaveLength(3);
    expect(latestSubscriptionActivity(accounts, 'codex', files)?.authIndex).toBe('two');
    expect(latestSubscriptionActivity(accounts, 'claude', files)).toBeUndefined();
    expect(() => readSubscriptionActivity(null)).toThrow('Invalid routing activity response');
    expect(() => readSubscriptionActivity({})).toThrow('Invalid routing activity response');
    expect(readSubscriptionActivity({ accounts: [] })).toEqual([]);
  });
  test('manual selection respects hidden emails and exposes missing preferred credentials', () => {
    const props = {
      files: [
        {
          name: 'codex-private@example.com.json',
          email: 'private@example.com',
          provider: 'codex',
          authIndex: 'one',
        },
      ],
      preferredAccounts: { codex: 'one', claude: 'removed' },
      disabled: false,
      disconnected: false,
      onChange: () => {},
    };
    const masked = renderToStaticMarkup(
      createElement(SubscriptionAccounts, { ...props, showEmails: false })
    );
    expect(masked).not.toContain('private@example.com');
    expect(masked).toContain(i18n.t('quota_management.routing.missing_account'));
    expect(masked).toContain(i18n.t('quota_management.routing.last_selected'));
    expect(
      renderToStaticMarkup(createElement(SubscriptionAccounts, { ...props, showEmails: true }))
    ).toContain('private@example.com');
  });
});
