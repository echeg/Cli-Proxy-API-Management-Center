import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import type { TFunction } from 'i18next';
import { CLAUDE_CONFIG } from '@/features/quota/providers/claude/data';
import { apiCallApi } from '@/services/api';
import {
  ANTHROPIC_API_ORIGIN,
  ANTHROPIC_RESET_GRANT_STATUS_PATH,
} from '@/services/api/claudeResetGrants';
import type { AuthFileItem } from '@/types';
import { CLAUDE_PROFILE_URL, CLAUDE_USAGE_URL } from '@/utils/quota';

const t = ((key: string) => key) as TFunction;
const file = { name: 'claude-test.json', auth_index: 'test-index', type: 'claude' } as AuthFileItem;
const GRANTS_URL = ANTHROPIC_API_ORIGIN + ANTHROPIC_RESET_GRANT_STATUS_PATH;
const fiveHourReset = '2026-10-08T15:00:00Z';

const response = (body: unknown, statusCode = 200) => ({
  statusCode,
  body,
  bodyText: JSON.stringify(body),
  header: {},
});

const usageBody = { five_hour: { utilization: 42, resets_at: fiveHourReset } };
const grantsBody = {
  cedar_ember: {
    eligible: true,
    at_limit: false,
    grants: [
      {
        id: 'opus_launch',
        label: 'Claude Opus 5.5 launch',
        resets_total: 1,
        resets_left: 1,
        ends_at: '2026-10-22T16:00:00Z',
        clears: ['five_hour', 'seven_day'],
        usable_now: true,
      },
    ],
  },
};

type Route = () => Promise<ReturnType<typeof response>>;
const mocks: Array<{ mockRestore(): void }> = [];
afterEach(() => {
  for (const mock of mocks.splice(0)) mock.mockRestore();
});

function setup(routes: { usage?: Route; profile?: Route; grants?: Route } = {}) {
  const urls: string[] = [];
  const request = spyOn(apiCallApi, 'request').mockImplementation(async (payload) => {
    urls.push(payload.url);
    if (payload.url === CLAUDE_USAGE_URL) {
      return (routes.usage ?? (async () => response(usageBody)))();
    }
    if (payload.url === CLAUDE_PROFILE_URL) {
      return (routes.profile ?? (async () => response({})))();
    }
    if (payload.url === GRANTS_URL) {
      return (routes.grants ?? (async () => response(grantsBody)))();
    }
    throw new Error(`unexpected url ${payload.url}`);
  });
  mocks.push(request);
  return { urls };
}

const load = async () => {
  const data = await CLAUDE_CONFIG.fetchQuota(file, t);
  return { data, state: CLAUDE_CONFIG.buildSuccessState(data) };
};

describe('Claude quota reset grants', () => {
  test('loads parsed grants and keeps them in the success state', async () => {
    setup();
    const { data, state } = await load();

    expect(data.resetGrants).toHaveLength(1);
    expect(data.resetGrants?.[0]).toMatchObject({
      id: 'opus_launch',
      label: 'Claude Opus 5.5 launch',
      resetsTotal: 1,
      resetsLeft: 1,
      endsAt: '2026-10-22T16:00:00Z',
      clears: ['five_hour', 'seven_day'],
    });
    expect(data.resetGrantsError).toBeUndefined();
    expect(state.status).toBe('success');
    expect(state.resetGrants).toEqual(data.resetGrants);
    expect(state.resetGrantsError).toBeUndefined();
    expect(state.windows.map((window) => window.id)).toEqual(['five-hour']);
  });

  test('keeps an empty grant list distinct from a failed read', async () => {
    setup({ grants: async () => response({ cedar_ember: { eligible: false, grants: [] } }) });
    const { state } = await load();
    expect(state.resetGrants).toEqual([]);
    expect(state.resetGrantsError).toBeUndefined();
  });

  const failures: Array<[string, Route]> = [
    ['an HTTP error', async () => response({ error: 'nope' }, 500)],
    [
      'a rejected request',
      async () => {
        throw new Error('network down');
      },
    ],
    ['a malformed block', async () => response({ cedar_ember: { eligible: 'yes' } })],
    ['a missing block', async () => response({})],
  ];

  test.each(failures)('treats %s as a non-fatal grants failure', async (_name, grants) => {
    setup({ grants });
    const { state } = await load();

    expect(state.status).toBe('success');
    expect(state.windows).toHaveLength(1);
    expect(state.windows[0]).toMatchObject({ id: 'five-hour', usedPercent: 42 });
    expect(state.resetGrants).toBeNull();
    expect(state.resetGrantsError).toBe('claude_reset.read_error');
  });

  test('a failing usage request still throws', async () => {
    setup({ usage: async () => response({ error: 'overloaded' }, 503) });
    await expect(CLAUDE_CONFIG.fetchQuota(file, t)).rejects.toThrow();
  });

  test('a rejected usage request still throws its reason', async () => {
    setup({
      usage: async () => {
        throw new Error('usage down');
      },
    });
    await expect(CLAUDE_CONFIG.fetchQuota(file, t)).rejects.toThrow('usage down');
  });

  test('loading and error states carry no grant fields', () => {
    expect(CLAUDE_CONFIG.buildLoadingState()).toEqual({ status: 'loading', windows: [] });
    expect(CLAUDE_CONFIG.buildErrorState('boom', 500)).toEqual({
      status: 'error',
      windows: [],
      error: 'boom',
      errorStatus: 500,
    });
  });
});

describe('Claude usage URL guard', () => {
  test('the primary usage URL carries no query string', () => {
    expect(CLAUDE_USAGE_URL).not.toContain('?');
  });

  test('grants are read by a separate request to the cedar_ember status path', async () => {
    const { urls } = setup();
    await load();

    expect(urls).toContain(CLAUDE_USAGE_URL);
    expect(urls).toContain(GRANTS_URL);
    expect(urls.filter((url) => url === CLAUDE_USAGE_URL)).toHaveLength(1);
    expect(urls.filter((url) => url === GRANTS_URL)).toHaveLength(1);
    expect(GRANTS_URL).not.toBe(CLAUDE_USAGE_URL);
  });
});
