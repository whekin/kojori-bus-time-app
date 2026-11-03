import { expect, test } from 'bun:test';
import { configureIOSBuild } from './configure-ios-build';

function config() {
  return { expo: { version: '2026.10.27', ios: { buildNumber: '2026102701' }, updates: { enabled: true, url: 'https://example.com' } } };
}

test('release IPA preserves stamped metadata and disables OTA updates', () => {
  const result = configureIOSBuild(config(), 'v2026.10.27', 'v2026.10.27', '100', '2');
  expect(result.expo.ios.buildNumber).toBe('2026102701');
  expect(result.expo.updates).toEqual({ enabled: false, url: 'https://example.com' });
});

test('rejects release publication from a branch or mismatched app version', () => {
  expect(() => configureIOSBuild(config(), 'v2026.10.27', 'main', '100', '1')).toThrow();
  expect(() => configureIOSBuild(config(), 'v2026.10.26', 'v2026.10.26', '100', '1')).toThrow();
  expect(() => configureIOSBuild(config(), 'bad-tag', 'bad-tag', '100', '1')).toThrow();
});

test('preview builds have distinct build numbers and embedded JS', () => {
  const result = configureIOSBuild(config(), '', 'main', '100', '2');
  expect(result.expo.ios.buildNumber).toBe('1.100.2');
  expect(result.expo.updates.enabled).toBe(false);
});
