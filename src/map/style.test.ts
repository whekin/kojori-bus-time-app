// @ts-nocheck
import { describe, expect, test } from 'bun:test';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';

import { buildMapStyle, localizedNameExpression, mapStyleFor } from './style';

describe('buildMapStyle', () => {
  for (const mode of ['light', 'dark'] as const) {
    for (const minimal of [false, true]) {
      test(`${mode}${minimal ? ' minimal' : ''} passes the style spec`, () => {
        const errors = validateStyleMin(buildMapStyle({ mode, language: 'ka', minimal }));
        expect(errors.map(error => error.message)).toEqual([]);
      });
    }
  }

  test('minimal drops place and water labels but keeps roads', () => {
    const ids = buildMapStyle({ mode: 'light', language: 'en', minimal: true }).layers.map(layer => layer.id);
    expect(ids).not.toContain('place-major');
    expect(ids).not.toContain('water-label');
    expect(ids).toContain('road-label');
  });

  test('labels follow the app language with a local-name fallback', () => {
    expect(localizedNameExpression('ru')).toEqual(['coalesce', ['get', 'name:ru'], ['get', 'name']]);
    expect(localizedNameExpression('en')[1]).toEqual(['get', 'name:en']);
  });

  test('styles are cached per key so maps do not restyle on rerender', () => {
    expect(mapStyleFor('dark', 'en')).toBe(mapStyleFor('dark', 'en'));
    expect(mapStyleFor('dark', 'en')).not.toBe(mapStyleFor('dark', 'en', true));
  });
});
