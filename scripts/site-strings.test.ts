import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { templateKeys } from './build-site';
import { SITE_STRINGS } from './site-strings';

test('every landing page string has a Georgian and Russian translation, and none are left over', () => {
  const keys = [...templateKeys(readFileSync(new URL('../site/index.html', import.meta.url), 'utf8'))].sort();
  expect(keys.length).toBeGreaterThan(40);
  expect(Object.keys(SITE_STRINGS.ka).sort()).toEqual(keys);
  expect(Object.keys(SITE_STRINGS.ru).sort()).toEqual(keys);
});
