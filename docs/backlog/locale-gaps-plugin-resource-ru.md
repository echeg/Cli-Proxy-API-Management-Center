# ru and zh-TW locales miss plugin-resource and login keys

- found: 2026-10-08, plan: 20261008-quota-reset-expiry-ledger, phase: task
- severity: minor
- area: src/i18n/locales/ru.json

Flattening the locale files against `en.json` shows keys that exist in `en` but not in other locales. The same gaps are present in `upstream/main`, so this is inherited, not introduced by this branch:

- `ru.json`: `nav_groups.plugin_pages` and `plugin_resource.{page_count,load_failed,unavailable,not_found,not_found_desc,empty_src,empty_src_desc}`. They are used by `src/features/plugins/PluginResourcePage.tsx:62,98,103-104`. The fallback language is `zh-CN`, so Russian users see Chinese text on plugin resource pages.
- `zh-TW.json`: `auth_login.login_another_account` and `auth_login.view_auth_files` (these fall back to Simplified Chinese).
- `zh-CN`/`zh-TW` lack the `auth_files.cooldown_*_one` plural forms. That is expected (Chinese only uses `_other`), so there is nothing to fix there.

Suggested fix: add the missing ru and zh-TW translations. Consider a generic parity test, like `tests/vietnameseLocale.test.ts`, for ru/zh-TW that ignores `_one` plural suffixes for Chinese. Coordinate with upstream so the next sync does not conflict.
