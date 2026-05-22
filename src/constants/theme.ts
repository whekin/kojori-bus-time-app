/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export type AppResolvedThemeMode = 'light' | 'dark';
export type AppThemeMode = 'system' | AppResolvedThemeMode;

type AppColorTokens = {
  bg: string;
  surface: string;
  surfaceHigh: string;
  surfaceRaised: string;
  panel: string;
  panelHigh: string;
  border: string;
  borderStrong: string;
  text: string;
  textDim: string;
  textFaint: string;
  primary: string;
  route380: string;
  route316: string;
  live: string;
  warning: string;
  error: string;
  sand: string;
  rose: string;
  map: string;
};

type AppPaletteDefinition = {
  id: string;
  name: string;
  tagline: string;
  dark: AppColorTokens;
  light: AppColorTokens;
};

export const APP_PALETTES = {
  midnightFig: {
    id: 'midnightFig',
    name: 'Midnight Fig',
    tagline: 'Fig skin, leaf smoke, apricot glow.',
    dark: {
      bg: '#0F0B10',
      surface: '#19131B',
      surfaceHigh: '#241C28',
      surfaceRaised: '#2E2433',
      panel: '#140F16',
      panelHigh: '#1E1721',
      border: '#3A2B35',
      borderStrong: '#51404D',
      text: '#F6EFF4',
      textDim: '#C7BAC3',
      textFaint: '#8E7F8F',
      primary: '#DB795F',
      route380: '#BACC82',
      route316: '#DB795F',
      live: '#BACC82',
      warning: '#E0B089',
      error: '#9F5C69',
      sand: '#F2D8B7',
      rose: '#E7C7CF',
      map: '#7B6E8C',
    },
    light: {
      bg: '#FAF7F8',
      surface: '#FFFFFF',
      surfaceHigh: '#F1EAEE',
      surfaceRaised: '#E7DBE1',
      panel: '#F8F1F3',
      panelHigh: '#EFE3E7',
      border: '#DCCCD2',
      borderStrong: '#C5B0B7',
      text: '#34212A',
      textDim: '#7D6870',
      textFaint: '#A59198',
      primary: '#C76D56',
      route380: '#9DB36B',
      route316: '#CD6F58',
      live: '#9BB36B',
      warning: '#C79772',
      error: '#8D5663',
      sand: '#8F6542',
      rose: '#935D6B',
      map: '#756888',
    },
  },
  woodlandParty: {
    id: 'woodlandParty',
    name: 'Woodland Party',
    tagline: 'Dusty pink, woodland olive, and warm bark.',
    dark: {
      bg: '#17150F',
      surface: '#211E15',
      surfaceHigh: '#2C281B',
      surfaceRaised: '#39331F',
      panel: '#1B1811',
      panelHigh: '#262219',
      border: '#433C28',
      borderStrong: '#62703E',
      text: '#F6EFE8',
      textDim: '#BFB7A8',
      textFaint: '#939C6D',
      primary: '#D9A7BE',
      route380: '#D9A7BE',
      route316: '#939C6D',
      live: '#939C6D',
      warning: '#BFB7A8',
      error: '#D98FA7',
      sand: '#BFB7A8',
      rose: '#D9A7BE',
      map: '#62703E',
    },
    light: {
      bg: '#F8F4EF',
      surface: '#FFFFFF',
      surfaceHigh: '#ECE5DB',
      surfaceRaised: '#DED5C8',
      panel: '#F2ECE4',
      panelHigh: '#E7DFD3',
      border: '#D3C9BA',
      borderStrong: '#BFB7A8',
      text: '#2F2A1C',
      textDim: '#62703E',
      textFaint: '#8A806F',
      primary: '#B97C98',
      route380: '#D9A7BE',
      route316: '#939C6D',
      live: '#62703E',
      warning: '#8C7B5E',
      error: '#A25F78',
      sand: '#9A8D7A',
      rose: '#B97C98',
      map: '#62703E',
    },
  },
  sorbetStatic: {
    id: 'sorbetStatic',
    name: 'Sorbet Static',
    tagline: 'Pastel bloom, lilac spark, peach haze.',
    dark: {
      bg: '#120E18',
      surface: '#1D1726',
      surfaceHigh: '#291F35',
      surfaceRaised: '#352846',
      panel: '#17111E',
      panelHigh: '#231A2E',
      border: '#433456',
      borderStrong: '#5B4874',
      text: '#FFF5FA',
      textDim: '#D5C4D8',
      textFaint: '#8C7A98',
      primary: '#F28DB2',
      route380: '#B78BD5',
      route316: '#BDDED2',
      live: '#B3ECF2',
      warning: '#F2CDA0',
      error: '#F28DB2',
      sand: '#F9E7C9',
      rose: '#FFD9E8',
      map: '#8873D6',
    },
    light: {
      bg: '#FFF8FC',
      surface: '#FFFFFF',
      surfaceHigh: '#F7ECF8',
      surfaceRaised: '#EFDFF2',
      panel: '#FFF1F7',
      panelHigh: '#F8E6F3',
      border: '#E3CBE5',
      borderStrong: '#D1B0D8',
      text: '#39293E',
      textDim: '#8E7694',
      textFaint: '#B49CBC',
      primary: '#DC719B',
      route380: '#B78BD5',
      route316: '#BDDED2',
      live: '#82C7D3',
      warning: '#D9AF78',
      error: '#D77698',
      sand: '#9E7448',
      rose: '#B86886',
      map: '#7A67C4',
    },
  },
} as const satisfies Record<string, AppPaletteDefinition>;

export type AppPaletteId = keyof typeof APP_PALETTES;
export type AppColors = AppColorTokens & {
  id: AppPaletteId;
  name: string;
  tagline: string;
  mode: AppResolvedThemeMode;
};

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const DEFAULT_APP_PALETTE: AppPaletteId = 'midnightFig';
export const DEFAULT_APP_THEME_MODE: AppThemeMode = 'system';

export function isAppPaletteId(value: unknown): value is AppPaletteId {
  return typeof value === 'string' && value in APP_PALETTES;
}

export function resolveAppThemeMode(
  themeMode: AppThemeMode = DEFAULT_APP_THEME_MODE,
  systemScheme: 'light' | 'dark' | 'unspecified' | null | undefined = 'dark',
): AppResolvedThemeMode {
  if (themeMode === 'light' || themeMode === 'dark') {
    return themeMode;
  }

  return systemScheme === 'light' ? 'light' : 'dark';
}

export function getAppColors(
  paletteId: AppPaletteId = DEFAULT_APP_PALETTE,
  mode: AppResolvedThemeMode = 'dark',
): AppColors {
  const palette = APP_PALETTES[paletteId] ?? APP_PALETTES[DEFAULT_APP_PALETTE];
  const variant = palette[mode];

  return {
    id: palette.id as AppPaletteId,
    name: palette.name,
    tagline: palette.tagline,
    mode,
    ...variant,
  };
}

export function alpha(hex: string, opacityHex: string) {
  return `${hex}${opacityHex}`;
}

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 78, android: 92 }) ?? 0;
export const MaxContentWidth = 800;
