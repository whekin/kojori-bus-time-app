const appJson = require('./app.json');

process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const androidGoogleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY_ANDROID;
const iosGoogleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY_IOS;

module.exports = () => {
  const expo = appJson.expo;
  const legalBaseUrl = 'https://github.com/whekin/kojori-bus-time-app/blob/main/release/google-play';

  return {
    ...expo,
    plugins: [
      ...(expo.plugins ?? []),
      [
        'react-native-maps',
        {
          androidGoogleMapsApiKey,
          iosGoogleMapsApiKey,
        },
      ],
    ],
    extra: {
      ...expo.extra,
      release: {
        appName: expo.name,
        packageName: expo.android?.package,
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
