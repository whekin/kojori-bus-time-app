import { ConfigContext, ExpoConfig } from 'expo/config';

function dateVersion(): { version: string; buildNumber: string; versionCode: number } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  const version = `${y}.${m}.${d}`;
  const code = Number(`${y}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}00`);
  return { version, buildNumber: String(code), versionCode: code };
}

export default ({ config }: ConfigContext): ExpoConfig => {
  // In production builds, use the stamped values from app.json.
  // In dev, compute from today's date so it's always fresh.
  const isDev = process.env.NODE_ENV !== 'production';
  const v = isDev ? dateVersion() : null;

  const androidGoogleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY_ANDROID;
  const iosGoogleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY_IOS;

  return {
    ...config,
    name: config.name!,
    slug: config.slug!,
    version: v?.version ?? config.version,
    ios: {
      ...config.ios,
      buildNumber: v?.buildNumber ?? config.ios?.buildNumber,
    },
    android: {
      ...config.android,
      versionCode: v?.versionCode ?? config.android?.versionCode,
    },
    plugins: [
      ...(config.plugins ?? []),
      [
        'react-native-maps',
        {
          androidGoogleMapsApiKey,
          iosGoogleMapsApiKey,
        },
      ],
    ],
  };
};
