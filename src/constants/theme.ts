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
  alpineGlow: {
    id: 'alpineGlow',
    name: 'Alpine Glow',
    tagline: 'Glacier blue, leaf green, sunrise gold.',
    bg: '#071015',
    surface: '#0F1B22',
    surfaceHigh: '#172731',
    surfaceRaised: '#20343F',
    panel: '#0B151B',
    panelHigh: '#122129',
    border: '#203741',
    borderStrong: '#30505E',
    text: '#EEF8F6',
    textDim: '#98B4B0',
    textFaint: '#5B7775',
    primary: '#91D6FF',
    route380: '#FFD66B',
    route316: '#7EE6AE',
    live: '#7EE6AE',
    warning: '#FFD66B',
    error: '#FF8F7A',
    sand: '#FFF0B8',
    rose: '#FFD9D1',
    map: '#91D6FF',
  },
  bubblePop: {
    id: 'bubblePop',
    name: 'Bubble Pop',
    tagline: 'Candy pink, speaker cyan, lemon spark.',
    bg: '#120A12',
    surface: '#23131F',
    surfaceHigh: '#311A2A',
    surfaceRaised: '#3C2034',
    panel: '#1A0F19',
    panelHigh: '#281626',
    border: '#533147',
    borderStrong: '#71465F',
    text: '#FFF1F7',
    textDim: '#D8AEBF',
    textFaint: '#8F6778',
    primary: '#8EF0E0',
    route380: '#8EF0E0',
    route316: '#FF8FB8',
    live: '#8EF0E0',
    warning: '#F6E05E',
    error: '#FF8FAF',
    sand: '#FFF1A6',
    rose: '#FFD3E0',
    map: '#9AF5E6',
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
