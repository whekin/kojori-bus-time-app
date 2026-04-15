/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const APP_PALETTES = {
  nightShift: {
    id: 'nightShift',
    name: 'Night Shift',
    tagline: 'Ink black, electric mint, taxi amber.',
    bg: '#08090D',
    surface: '#11141B',
    surfaceHigh: '#191E27',
    surfaceRaised: '#202734',
    panel: '#0D1118',
    panelHigh: '#141B25',
    border: '#202837',
    borderStrong: '#313B4D',
    text: '#F4EFE7',
    textDim: '#99A3B6',
    textFaint: '#5E687B',
    primary: '#71E7C5',
    route380: '#FFB54A',
    route316: '#39D0BE',
    live: '#71E7C5',
    warning: '#FFB54A',
    error: '#FF6B6B',
    sand: '#FFE3AF',
    rose: '#FFD2D2',
    map: '#8BCAFF',
  },
  emberPunch: {
    id: 'emberPunch',
    name: 'Ember Punch',
    tagline: 'Cocoa chrome, hot coral, aqua pulse.',
    bg: '#100B0C',
    surface: '#1A1316',
    surfaceHigh: '#261B20',
    surfaceRaised: '#302126',
    panel: '#140E11',
    panelHigh: '#20161A',
    border: '#34252C',
    borderStrong: '#4B3540',
    text: '#FFF2EA',
    textDim: '#BBA39D',
    textFaint: '#745D61',
    primary: '#FF8B77',
    route380: '#FFC561',
    route316: '#6DE4D7',
    live: '#6DE4D7',
    warning: '#FFC561',
    error: '#FF8B77',
    sand: '#FFE7B8',
    rose: '#FFD5CC',
    map: '#9CDAFF',
  },
  sorbetStatic: {
    id: 'sorbetStatic',
    name: 'Sorbet Static',
    tagline: 'Pastel bloom, lilac spark, peach haze.',
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
    route380: '#F2CDA0',
    route316: '#B3ECF2',
    live: '#B3ECF2',
    warning: '#F2CDA0',
    error: '#F28DB2',
    sand: '#F9E7C9',
    rose: '#FFD9E8',
    map: '#8873D6',
  },
  midnightFig: {
    id: 'midnightFig',
    name: 'Midnight Fig',
    tagline: 'Fig skin, leaf smoke, apricot glow.',
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
    route380: '#DB795F',
    route316: '#BACC82',
    live: '#BACC82',
    warning: '#E0B089',
    error: '#9F5C69',
    sand: '#F2D8B7',
    rose: '#E7C7CF',
    map: '#7B6E8C',
  },
} as const;

export type AppPaletteId = keyof typeof APP_PALETTES;
export type AppColors = (typeof APP_PALETTES)[AppPaletteId];

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

export const DEFAULT_APP_PALETTE: AppPaletteId = 'nightShift';

export function getAppColors(paletteId: AppPaletteId = DEFAULT_APP_PALETTE) {
  return APP_PALETTES[paletteId] ?? APP_PALETTES[DEFAULT_APP_PALETTE];
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

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
