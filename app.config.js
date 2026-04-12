const appJson = require('./app.json');

const androidGoogleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY_ANDROID;
const iosGoogleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY_IOS;

module.exports = () => {
  const expo = appJson.expo;

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
      maps: {
        androidConfigured: Boolean(androidGoogleMapsApiKey),
        iosGoogleMapsConfigured: Boolean(iosGoogleMapsApiKey),
      },
    },
  };
};
