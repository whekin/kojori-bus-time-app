import type { AppColors } from '@/constants/theme';

/**
 * Builds a stylesheet once per palette instead of once per component instance.
 * Screens call their style hook from dozens of components (including list rows),
 * and `useMemo` only dedupes within a single instance — every new row still ran
 * the whole factory on mount.
 */
export function createThemedStyles<T>(factory: (colors: AppColors) => T) {
  const cache = new WeakMap<AppColors, T>();

  return function getThemedStyles(colors: AppColors): T {
    let styles = cache.get(colors);
    if (!styles) {
      styles = factory(colors);
      cache.set(colors, styles);
    }
    return styles;
  };
}
