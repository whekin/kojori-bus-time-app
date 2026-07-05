// @ts-nocheck
import { describe, expect, it } from 'bun:test';

import { translateDuration, translateRelativeDuration } from './translations';

describe('Russian pluralized time labels', () => {
  it('keeps the full count for relative minute values ending in one', () => {
    expect(translateRelativeDuration('ru', 'future', 'minute', 51)).toBe('через 51 минуту');
    expect(translateRelativeDuration('ru', 'future', 'minute', 21)).toBe('через 21 минуту');
  });

  it('keeps the full count for compact duration values ending in one', () => {
    expect(translateDuration('ru', 'minute', 21)).toBe('21 мин');
    expect(translateDuration('ru', 'hour', 21)).toBe('21 ч');
  });
});
