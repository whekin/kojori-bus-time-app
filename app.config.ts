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

  const legalBaseUrl = 'https://github.com/whekin/kojori-bus-time-app/blob/main/release/google-play';

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
    extra: {
      ...config.extra,
      release: {
        appName: config.name,
        packageName: config.android?.package,
        storeListingUrl: 'https://github.com/whekin/kojori-bus-time-app/blob/main/release/google-play/store-listing.md',
        privacyPolicyUrl: `${legalBaseUrl}/privacy-policy.md`,
        termsOfServiceUrl: `${legalBaseUrl}/terms-of-service.md`,
        dataSafetyUrl: 'https://github.com/whekin/kojori-bus-time-app/blob/main/release/google-play/data-safety.md',
        contentRatingUrl: 'https://github.com/whekin/kojori-bus-time-app/blob/main/release/google-play/content-rating.md',
        appAccessUrl: 'https://github.com/whekin/kojori-bus-time-app/blob/main/release/google-play/app-access.md',
        releaseChecklistUrl: 'https://github.com/whekin/kojori-bus-time-app/blob/main/release/google-play/release-checklist.md',
      },
      legal: {
        privacyPolicyUrl: `${legalBaseUrl}/privacy-policy.md`,
        supportUrl: 'https://github.com/whekin/kojori-bus-time-app/issues',
        termsOfServiceUrl: `${legalBaseUrl}/terms-of-service.md`,
      },
      maps: {
        androidConfigured: Boolean(androidGoogleMapsApiKey),
        iosGoogleMapsConfigured: Boolean(iosGoogleMapsApiKey),
      },
    },
  };
};
