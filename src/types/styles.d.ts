// TypeScript 6 checks side-effect imports before Expo generates expo-env.d.ts.
// Metro handles this shared stylesheet when building each platform.
declare module '*.css';
