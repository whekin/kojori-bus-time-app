// @ts-nocheck
import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { translations } from './translations';

function sourceFiles(dir: string, acc: string[] = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      sourceFiles(path, acc);
    } else if (/\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path)) {
      acc.push(path);
    }
  }
  return acc;
}

describe('translation keys', () => {
  // Keys outlive the screens that introduced them: a redesign drops the last
  // `t('...')` and the strings quietly stay in all three languages. Definitions
  // are written unquoted, so only real lookups count as a use.
  it('are all referenced from somewhere in src', () => {
    const source = sourceFiles('src')
      .map(path => readFileSync(path, 'utf8'))
      .join('\n');

    const unused = Object.keys(translations.en).filter(
      key => !source.includes(`'${key}'`) && !source.includes(`"${key}"`),
    );

    expect(unused).toEqual([]);
  });

  it('are defined in every language', () => {
    const english = Object.keys(translations.en);
    for (const language of Object.keys(translations)) {
      const missing = english.filter(key => !(key in translations[language]));
      expect({ language, missing }).toEqual({ language, missing: [] });
    }
  });
});
