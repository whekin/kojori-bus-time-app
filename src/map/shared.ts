import type {
  ExpressionSpecification,
  LineLayerSpecification,
} from '@maplibre/maplibre-gl-style-spec';

import type { GeoLine } from './types';

export const LINE_LAYOUT: LineLayerSpecification['layout'] = {
  'line-cap': 'round',
  'line-join': 'round',
};

export function lineLayerPaint(
  width: number | ExpressionSpecification,
  opacity: number,
): LineLayerSpecification['paint'] {
  return {
    'line-color': ['get', 'color'],
    'line-width': width,
    'line-opacity': opacity,
  };
}

export function linesToFeatureCollection(lines: GeoLine[]): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  return {
    type: 'FeatureCollection',
    features: lines
      .filter(line => line.coordinates.length >= 2)
      .map((line, index) => ({
        type: 'Feature',
        id: index,
        properties: { color: line.color },
        geometry: { type: 'LineString', coordinates: line.coordinates },
      })),
  };
}

/** Line width that grows with zoom: `[zoom, px]` stops. */
export function widthByZoom(stops: [zoom: number, width: number][]): ExpressionSpecification {
  return ['interpolate', ['linear'], ['zoom'], ...stops.flat()] as ExpressionSpecification;
}
