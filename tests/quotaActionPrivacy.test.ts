import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18n from '@/i18n';
import { useQuotaActions } from '@/features/quota/hooks/useQuotaActions';
import { QUOTA_ADAPTERS, type QuotaAdapter } from '@/features/quota/providers';
import { useNotificationStore, useQuotaStore } from '@/stores';
import type { AuthFileItem } from '@/types';

const file = { name: 'codex-alice@example.com.json', type: 'codex' } as AuthFileItem;
const hideEmail = (value: string) => value.replaceAll('alice@example.com', 'hidden-account');
const quota = { windows: [] };

function renderActions(afterProbe?: (file: AuthFileItem) => void) {
  let actions: ReturnType<typeof useQuotaActions> | undefined;
  function Harness() {
    actions = useQuotaActions(false, hideEmail, afterProbe);
    return null;
  }
  renderToStaticMarkup(createElement(Harness));
  if (!actions) throw new Error('Hook did not render');
  return actions;
}

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

function clearState() {
  useQuotaStore.getState().clearQuotaCache();
  useNotificationStore.setState({ notifications: [] });
  useNotificationStore.getState().hideConfirmation();
}

beforeEach(clearState);
afterEach(clearState);

describe('quota action privacy', () => {
  test.each([false, true])(
    'refresh feedback masks names without changing provider identity (failed=%s)',
    async (failed) => {
      let requestedFile: AuthFileItem | undefined;
      const adapter: QuotaAdapter = {
        ...QUOTA_ADAPTERS.codex,
        enrichQuota: undefined,
        fetchQuota: async (requestFile) => {
          requestedFile = requestFile;
          if (failed) throw new Error('Refresh failed for alice@example.com');
          return quota;
        },
      };
      await renderActions().refreshQuota(file, adapter);

      expect(requestedFile).toBe(file);
      expect(useQuotaStore.getState().codexQuota[file.name].status).toBe(
        failed ? 'error' : 'success'
      );
      const feedback = useNotificationStore.getState().notifications.at(-1)?.message;
      expect(feedback).toContain('hidden-account');
      expect(feedback).not.toContain('alice@example.com');
    }
  );

  test.each([false, true])(
    'manual reset confirmation and completion preserve privacy (failed=%s)',
    async (failed) => {
      let requestedFile: AuthFileItem | undefined;
      const adapter: QuotaAdapter = {
        ...QUOTA_ADAPTERS.codex,
        enrichQuota: undefined,
        resetQuota: async (requestFile) => {
          requestedFile = requestFile;
          if (failed) throw new Error('Reset failed for alice@example.com');
          return quota;
        },
      };
      renderActions().resetQuota(file, adapter);
      const confirmation = useNotificationStore.getState().confirmation.options;
      expect(confirmation).not.toBeNull();
      expect(confirmation?.message).toContain('hidden-account');
      expect(confirmation?.message).not.toContain('alice@example.com');
      await confirmation?.onConfirm();

      expect(requestedFile).toBe(file);
      const feedback = useNotificationStore.getState().notifications.at(-1)?.message;
      expect(feedback).toContain('hidden-account');
      expect(feedback).not.toContain('alice@example.com');
    }
  );
});

describe('quota action follow-up', () => {
  test.each([false, true])(
    'Cards refresh and modal reset notify the page once they settle (failed=%s)',
    async (failed) => {
      const probed: AuthFileItem[] = [];
      let fetches = 0;
      const adapter: QuotaAdapter = {
        ...QUOTA_ADAPTERS.codex,
        enrichQuota: undefined,
        fetchQuota: async () => {
          fetches += 1;
          if (failed) throw new Error('Refresh failed');
          return quota;
        },
        resetQuota: async () => {
          if (failed) throw new Error('Reset failed');
          return quota;
        },
      };
      const actions = renderActions((probedFile) => probed.push(probedFile));

      await actions.refreshQuota(file, adapter);
      expect(probed).toEqual([file]);

      actions.resetQuota(file, adapter);
      expect(probed).toHaveLength(1);
      await useNotificationStore.getState().confirmation.options?.onConfirm();
      // A failed reset re-reads quota and reports one probe once that reload settles.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(probed).toEqual([file, file]);
      expect(fetches).toBe(failed ? 2 : 1);
    }
  );
});
