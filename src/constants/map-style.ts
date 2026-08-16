// Google Maps JSON styles shared by the full map tab and the boarding-stop
// mini map, so both surfaces restyle together when the theme changes.
export const GOOGLE_DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#1d1d1d' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1d1d1d' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8a8a8a' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#444444' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#6d6d6d' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2c2c2c' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#171717' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#8a8a8a' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#2f2f2f' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f141a' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#5f7a88' }] },
];

// The boarding-stop picker is only about stops, so everything Google would
// otherwise draw on top — POI pins, transit icons, place labels — is switched
// off. Roads stay: they are what makes a location recognisable.
const MINIMAL_OVERRIDES = [
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'landscape', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'labels', stylers: [{ visibility: 'off' }] },
];

// Warm paper tones tuned to the app's palettes (cream surfaces, muted
// accents) instead of stock Google blue-green.
export const GOOGLE_LIGHT_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#f2efe6' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f7f4ec' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6b675c' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#d8d2c2' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#eae6d8' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#e7e2d3' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#8a857a' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#dde3cb' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#7c8464' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#e3dccb' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#87816F' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#f7ecd6' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#e0d3b4' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#e4dfd0' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c8d5d9' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#63808c' }] },
];

export const GOOGLE_DARK_MINIMAL_MAP_STYLE = [...GOOGLE_DARK_MAP_STYLE, ...MINIMAL_OVERRIDES];
export const GOOGLE_LIGHT_MINIMAL_MAP_STYLE = [...GOOGLE_LIGHT_MAP_STYLE, ...MINIMAL_OVERRIDES];
