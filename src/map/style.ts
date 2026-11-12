import type {
  ExpressionSpecification,
  LayerSpecification,
  StyleSpecification,
} from '@maplibre/maplibre-gl-style-spec';

/**
 * Basemap for every map in the app, on every platform. Vector tiles come from
 * OpenFreeMap (OpenMapTiles schema, no key, no quota); the layers are our own
 * so the map wears the app's paper tones instead of a stock palette, and the
 * same JSON drives MapLibre Native and maplibre-gl on the web.
 */
export const OPENFREEMAP_TILES = 'https://tiles.openfreemap.org/planet';
export const OPENFREEMAP_GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
const ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> ' +
  '<a href="https://www.openmaptiles.org/" target="_blank">&copy; OpenMapTiles</a> ' +
  'Data from <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>';

const FONT_REGULAR = ['Noto Sans Regular'];
const FONT_BOLD = ['Noto Sans Bold'];
const FONT_ITALIC = ['Noto Sans Italic'];

export type MapStyleMode = 'light' | 'dark';
export type MapStyleLanguage = 'en' | 'ka' | 'ru';

export type MapPalette = {
  background: string;
  natural: string;
  park: string;
  residential: string;
  building: string;
  water: string;
  waterLabel: string;
  road: string;
  roadCasing: string;
  majorRoad: string;
  majorRoadCasing: string;
  rail: string;
  boundary: string;
  label: string;
  labelHalo: string;
  roadLabel: string;
};

// Warm paper tones carried over from the Google styles this replaced.
export const MAP_PALETTES: Record<MapStyleMode, MapPalette> = {
  light: {
    background: '#F2EFE6',
    natural: '#EAE6D8',
    park: '#DDE3CB',
    residential: '#EDE9DE',
    building: '#E6E0D1',
    water: '#C8D5D9',
    waterLabel: '#63808C',
    road: '#FFFFFF',
    roadCasing: '#E3DCCB',
    majorRoad: '#F7ECD6',
    majorRoadCasing: '#E0D3B4',
    rail: '#D8D1BF',
    boundary: '#C9C1AE',
    label: '#6B675C',
    labelHalo: '#F7F4EC',
    roadLabel: '#87816F',
  },
  dark: {
    background: '#1D1D1D',
    natural: '#202020',
    park: '#1F241D',
    residential: '#212121',
    building: '#262626',
    water: '#0F141A',
    waterLabel: '#5F7A88',
    road: '#2C2C2C',
    roadCasing: '#171717',
    majorRoad: '#353331',
    majorRoadCasing: '#151515',
    rail: '#303030',
    boundary: '#444444',
    label: '#8A8A8A',
    labelHalo: '#1D1D1D',
    roadLabel: '#7A7A7A',
  },
};

export function localizedNameExpression(language: MapStyleLanguage): ExpressionSpecification {
  if (language === 'en') {
    return ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']];
  }
  return ['coalesce', ['get', `name:${language}`], ['get', 'name']];
}

function zoomRamp(stops: [zoom: number, value: number][]): ExpressionSpecification {
  return ['interpolate', ['exponential', 1.4], ['zoom'], ...stops.flat()] as ExpressionSpecification;
}

const MINOR_CLASSES = ['minor', 'service', 'track'];
const MID_CLASSES = ['secondary', 'tertiary'];
const MAJOR_CLASSES = ['primary', 'trunk', 'motorway'];

function roadClassFilter(classes: string[]): ExpressionSpecification {
  return [
    'all',
    ['match', ['get', 'class'], classes, true, false],
    ['!=', ['get', 'brunnel'], 'tunnel'],
  ];
}

function roadLayers(palette: MapPalette): LayerSpecification[] {
  const roads = [
    {
      id: 'road-minor',
      classes: MINOR_CLASSES,
      minzoom: 12.5,
      width: zoomRamp([[13, 0.6], [15, 3], [18, 14]]),
      fill: palette.road,
      casing: palette.roadCasing,
    },
    {
      id: 'road-mid',
      classes: MID_CLASSES,
      minzoom: 9,
      width: zoomRamp([[10, 0.6], [13, 2], [15, 5], [18, 18]]),
      fill: palette.road,
      casing: palette.roadCasing,
    },
    {
      id: 'road-major',
      classes: MAJOR_CLASSES,
      minzoom: 5,
      width: zoomRamp([[7, 0.6], [10, 1.6], [13, 3.4], [15, 7], [18, 24]]),
      fill: palette.majorRoad,
      casing: palette.majorRoadCasing,
    },
  ];

  const casings: LayerSpecification[] = roads.map(road => ({
    id: `${road.id}-casing`,
    type: 'line',
    source: 'openmaptiles',
    'source-layer': 'transportation',
    minzoom: Math.max(road.minzoom, 11),
    filter: roadClassFilter(road.classes),
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': road.casing,
      'line-gap-width': road.width,
      'line-width': zoomRamp([[12, 0.5], [16, 1.5]]),
    },
  }));
  const fills: LayerSpecification[] = roads.map(road => ({
    id: road.id,
    type: 'line',
    source: 'openmaptiles',
    'source-layer': 'transportation',
    minzoom: road.minzoom,
    filter: roadClassFilter(road.classes),
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': road.fill, 'line-width': road.width },
  }));

  return [...casings, ...fills];
}

/**
 * `minimal` drops place and water labels for the small boarding-stop picker,
 * where only roads make a spot recognisable and the stop dots carry the rest.
 */
export function buildMapStyle({
  mode,
  language,
  minimal = false,
}: {
  mode: MapStyleMode;
  language: MapStyleLanguage;
  minimal?: boolean;
}): StyleSpecification {
  const palette = MAP_PALETTES[mode];
  const name = localizedNameExpression(language);
  const labelPaint = {
    'text-color': palette.label,
    'text-halo-color': palette.labelHalo,
    'text-halo-width': 1.4,
  };

  const layers: LayerSpecification[] = [
    { id: 'background', type: 'background', paint: { 'background-color': palette.background } },
    {
      id: 'landcover',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'landcover',
      filter: ['match', ['get', 'class'], ['wood', 'grass', 'farmland', 'scrub'], true, false],
      paint: { 'fill-color': palette.natural, 'fill-opacity': 0.8 },
    },
    {
      id: 'landuse-residential',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'landuse',
      filter: ['match', ['get', 'class'], ['residential', 'suburb', 'neighbourhood'], true, false],
      paint: { 'fill-color': palette.residential, 'fill-opacity': 0.7 },
    },
    {
      id: 'park',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'park',
      paint: { 'fill-color': palette.park },
    },
    {
      id: 'water',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'water',
      filter: ['!=', ['get', 'brunnel'], 'tunnel'],
      paint: { 'fill-color': palette.water },
    },
    {
      id: 'waterway',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'waterway',
      minzoom: 10,
      filter: ['!=', ['get', 'brunnel'], 'tunnel'],
      paint: { 'line-color': palette.water, 'line-width': zoomRamp([[10, 0.8], [16, 4]]) },
    },
    {
      id: 'building',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'building',
      minzoom: 14.5,
      paint: { 'fill-color': palette.building, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 14.5, 0, 16, 1] },
    },
    {
      id: 'railway',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      minzoom: 11,
      filter: ['match', ['get', 'class'], ['rail', 'transit'], true, false],
      paint: { 'line-color': palette.rail, 'line-width': zoomRamp([[11, 0.6], [16, 2]]) },
    },
    ...roadLayers(palette),
    {
      id: 'boundary-country',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'boundary',
      filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]],
      paint: { 'line-color': palette.boundary, 'line-width': 1.2, 'line-dasharray': [3, 2] },
    },
    {
      id: 'road-label',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'transportation_name',
      minzoom: minimal ? 15 : 14,
      filter: ['match', ['get', 'class'], [...MINOR_CLASSES, ...MID_CLASSES, ...MAJOR_CLASSES], true, false],
      layout: {
        'symbol-placement': 'line',
        'text-field': name,
        'text-font': FONT_REGULAR,
        'text-size': zoomRamp([[14, 10], [18, 13]]),
        'text-max-angle': 30,
      },
      paint: { ...labelPaint, 'text-color': palette.roadLabel },
    },
  ];

  if (!minimal) {
    layers.push(
      {
        id: 'water-label',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'water_name',
        minzoom: 12,
        layout: { 'text-field': name, 'text-font': FONT_ITALIC, 'text-size': 11 },
        paint: { ...labelPaint, 'text-color': palette.waterLabel },
      },
      {
        id: 'place-minor',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'place',
        minzoom: 12,
        filter: ['match', ['get', 'class'], ['suburb', 'neighbourhood', 'quarter', 'hamlet'], true, false],
        layout: {
          'text-field': name,
          'text-font': FONT_REGULAR,
          'text-size': zoomRamp([[12, 10], [16, 13]]),
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.08,
          'text-max-width': 8,
        },
        paint: { ...labelPaint, 'text-opacity': 0.8 },
      },
      {
        id: 'place-major',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'place',
        minzoom: 8,
        filter: ['match', ['get', 'class'], ['city', 'town', 'village'], true, false],
        layout: {
          'text-field': name,
          'text-font': FONT_BOLD,
          // Zoom has to be the outermost expression, so the class picks the
          // size at each zoom stop rather than picking a ramp.
          'text-size': [
            'interpolate', ['linear'], ['zoom'],
            8, ['match', ['get', 'class'], 'city', 13, 'town', 11, 10],
            14, ['match', ['get', 'class'], 'city', 20, 'town', 16, 13],
          ],
          'text-max-width': 8,
        },
        paint: labelPaint,
      },
    );
  }

  return {
    version: 8,
    name: `gzaap-${mode}${minimal ? '-minimal' : ''}`,
    glyphs: OPENFREEMAP_GLYPHS,
    sources: {
      openmaptiles: { type: 'vector', url: OPENFREEMAP_TILES, attribution: ATTRIBUTION },
    },
    layers,
  };
}

const cache = new Map<string, StyleSpecification>();

/** Same object per (mode, language, minimal), so maps never restyle on rerender. */
export function mapStyleFor(mode: MapStyleMode, language: MapStyleLanguage, minimal = false) {
  const key = `${mode}:${language}:${minimal}`;
  let style = cache.get(key);
  if (!style) {
    style = buildMapStyle({ mode, language, minimal });
    cache.set(key, style);
  }
  return style;
}
