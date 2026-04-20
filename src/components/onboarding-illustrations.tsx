import React from 'react';
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Path,
  Polygon,
  Rect,
  Stop,
} from 'react-native-svg';

import { alpha } from '@/constants/theme';

type IllustrationProps = {
  width: number;
  height: number;
  accent: string;
  bg: string;
  outline: string;
  dim: string;
};

// Kojori — Azeula (Agarani) fortress ruins on a rocky peak near the village.
export function KojoriIllustration({ width, height, accent, bg, outline, dim }: IllustrationProps) {
  const sky = alpha(accent, '1A');
  const fog = alpha(accent, '2E');
  const peakFront = accent;
  const peakBack = alpha(accent, '70');
  const peakFar = alpha(accent, '38');
  const stone = alpha(accent, 'D8');
  const stoneShadow = alpha(accent, '80');
  const stoneDark = alpha('#000000', '55');

  return (
    <Svg width={width} height={height} viewBox="0 0 200 160" preserveAspectRatio="xMidYMid meet">
      <Defs>
        <LinearGradient id="kojori-sky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={sky} stopOpacity="1" />
          <Stop offset="1" stopColor={bg} stopOpacity="0" />
        </LinearGradient>
      </Defs>

      <Rect x="0" y="0" width="200" height="160" fill="url(#kojori-sky)" rx="16" ry="16" />

      {/* Sun */}
      <Circle cx="158" cy="36" r="11" fill={accent} opacity={0.75} />
      <Circle cx="158" cy="36" r="19" fill={accent} opacity={0.14} />

      {/* Far peaks */}
      <Polygon points="-10,126 22,94 50,114 82,86 116,116 152,98 194,128 210,140 -10,140" fill={peakFar} />

      {/* Mid ridge */}
      <Polygon points="-10,138 28,110 58,130 96,96 128,120 170,104 210,134 210,145 -10,145" fill={peakBack} />

      {/* Rocky summit hosting fortress — jagged silhouette */}
      <Path
        d="M 30 140 L 48 126 L 60 118 L 68 110 L 78 104 L 90 100 L 104 98 L 118 100 L 128 108 L 138 116 L 148 126 L 162 140 Z"
        fill={peakFront}
      />

      {/* Azeula fortress ruins */}
      <G>
        {/* Curtain wall — segmented, with gaps to read as ruined */}
        <Rect x="66" y="80" width="18" height="20" fill={stoneShadow} />
        <Rect x="86" y="80" width="22" height="20" fill={stoneShadow} />
        {/* collapsed gap 108–114 */}
        <Rect x="114" y="84" width="10" height="16" fill={stoneShadow} />

        {/* Crenellations (broken — irregular tops) */}
        <Rect x="66" y="74" width="4" height="7" fill={stoneShadow} />
        <Rect x="74" y="76" width="4" height="5" fill={stoneShadow} />
        <Rect x="88" y="74" width="4" height="7" fill={stoneShadow} />
        <Rect x="96" y="76" width="3" height="5" fill={stoneShadow} />
        <Rect x="104" y="74" width="4" height="7" fill={stoneShadow} />
        <Rect x="116" y="78" width="3" height="6" fill={stoneShadow} />

        {/* Arched gateway in wall */}
        <Path d="M 92 100 L 92 90 Q 98 84 104 90 L 104 100 Z" fill={stoneDark} />

        {/* Tall main tower — intact */}
        <Rect x="50" y="56" width="16" height="44" fill={stone} />
        {/* Tower crown merlons */}
        <Rect x="48" y="50" width="4" height="7" fill={stone} />
        <Rect x="54" y="50" width="4" height="7" fill={stone} />
        <Rect x="60" y="50" width="4" height="7" fill={stone} />
        {/* Tower window */}
        <Rect x="56" y="64" width="4" height="8" fill={stoneDark} opacity={0.8} />
        {/* Tower base stripe (masonry line) */}
        <Rect x="50" y="78" width="16" height="1.5" fill={outline} opacity={0.3} />

        {/* Ruined secondary tower — broken top silhouette */}
        <Polygon
          points="124,100 124,72 128,66 130,72 130,66 134,66 134,74 138,74 138,100"
          fill={stoneShadow}
        />

        {/* Base rubble / mound catching the fortress onto the peak */}
        <Path
          d="M 44 102 Q 60 104 82 100 Q 104 98 126 100 Q 140 102 148 104 L 150 110 Q 130 108 108 108 Q 80 108 58 108 Q 50 108 42 106 Z"
          fill={stoneShadow}
          opacity={0.85}
        />
      </G>

      {/* Pine silhouettes on slopes */}
      <G opacity={0.9}>
        <Polygon points="14,140 18,126 22,140" fill={outline} />
        <Polygon points="26,140 32,122 38,140" fill={outline} />
        <Polygon points="40,140 46,126 52,140" fill={outline} />
        <Polygon points="164,140 170,124 176,140" fill={outline} />
        <Polygon points="178,140 184,126 190,140" fill={outline} />
      </G>

      {/* Mist band */}
      <Rect x="0" y="122" width="200" height="5" fill={fog} rx="2.5" />
      <Rect x="0" y="130" width="200" height="3" fill={fog} opacity={0.55} rx="1.5" />

      {/* Small distant flag hint on main tower */}
      <Rect x="57" y="44" width="1" height="7" fill={dim} />
      <Polygon points="58,44 64,46 58,48" fill={accent} />
    </Svg>
  );
}

// Tbilisi — Sameba (Holy Trinity) Cathedral, city's dominant skyline landmark.
export function TbilisiIllustration({ width, height, accent, bg, outline, dim }: IllustrationProps) {
  const sky = alpha(accent, '20');
  const wall = accent;
  const wallShadow = alpha(accent, '80');
  const wallSoft = alpha(accent, '55');
  const dome = alpha(accent, 'DD');
  const domeHighlight = alpha('#FFFFFF', '55');
  const window = alpha('#FFFFFF', '80');
  const arch = alpha('#000000', '66');

  return (
    <Svg width={width} height={height} viewBox="0 0 200 160" preserveAspectRatio="xMidYMid meet">
      <Defs>
        <LinearGradient id="tbilisi-sky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={sky} stopOpacity="1" />
          <Stop offset="1" stopColor={bg} stopOpacity="0" />
        </LinearGradient>
      </Defs>

      <Rect x="0" y="0" width="200" height="160" fill="url(#tbilisi-sky)" rx="16" ry="16" />

      {/* Faint hills (Makhata / Mtatsminda) */}
      <Path
        d="M -10 120 Q 50 84 110 96 Q 160 106 210 88 L 210 140 L -10 140 Z"
        fill={alpha(accent, '20')}
      />

      {/* Old-town rooftops, left cluster */}
      <G opacity={0.9}>
        <Rect x="6" y="116" width="20" height="18" fill={wallSoft} />
        <Polygon points="4,116 16,106 28,116" fill={alpha(accent, '6E')} />
        <Rect x="30" y="120" width="16" height="14" fill={alpha(accent, '44')} />
        <Polygon points="28,120 38,112 48,120" fill={alpha(accent, '5A')} />
      </G>

      {/* Old-town rooftops, right cluster */}
      <G opacity={0.9}>
        <Rect x="156" y="118" width="18" height="16" fill={wallSoft} />
        <Polygon points="154,118 165,108 176,118" fill={alpha(accent, '6E')} />
        <Rect x="176" y="122" width="16" height="12" fill={alpha(accent, '44')} />
        <Polygon points="174,122 184,114 194,122" fill={alpha(accent, '5A')} />
      </G>

      {/* Sameba Cathedral */}
      <G>
        {/* Widest base / stepped terrace */}
        <Rect x="58" y="130" width="84" height="10" fill={wallShadow} />
        <Rect x="66" y="122" width="68" height="10" fill={wallShadow} />

        {/* Left side chapel with small dome */}
        <Rect x="68" y="108" width="14" height="16" fill={wallSoft} />
        <Path d="M 68 108 Q 75 98 82 108 Z" fill={dome} />
        <Rect x="74.2" y="92" width="1.6" height="6" fill={dome} />
        <Rect x="70" y="116" width="2" height="4" fill={window} opacity={0.55} />
        <Rect x="78" y="116" width="2" height="4" fill={window} opacity={0.55} />

        {/* Right side chapel */}
        <Rect x="118" y="108" width="14" height="16" fill={wallSoft} />
        <Path d="M 118 108 Q 125 98 132 108 Z" fill={dome} />
        <Rect x="124.2" y="92" width="1.6" height="6" fill={dome} />
        <Rect x="120" y="116" width="2" height="4" fill={window} opacity={0.55} />
        <Rect x="128" y="116" width="2" height="4" fill={window} opacity={0.55} />

        {/* Main central body */}
        <Rect x="84" y="72" width="32" height="52" fill={wall} />
        {/* Central entry arch */}
        <Path d="M 92 124 L 92 110 Q 100 102 108 110 L 108 124 Z" fill={arch} opacity={0.75} />
        {/* Tall arched windows on body */}
        <Path d="M 87 104 L 87 90 Q 90 86 93 90 L 93 104 Z" fill={arch} opacity={0.55} />
        <Path d="M 107 104 L 107 90 Q 110 86 113 90 L 113 104 Z" fill={arch} opacity={0.55} />
        {/* Shoulder roofs flanking main body */}
        <Polygon points="82,84 84,72 84,84" fill={wallShadow} />
        <Polygon points="116,72 118,84 116,84" fill={wallShadow} />

        {/* Drum (dome base) */}
        <Rect x="88" y="50" width="24" height="22" fill={wall} />
        {/* Drum arched windows */}
        <Path d="M 91 70 L 91 60 Q 94 56 97 60 L 97 70 Z" fill={arch} opacity={0.6} />
        <Path d="M 99 70 L 99 60 Q 102 56 105 60 L 105 70 Z" fill={arch} opacity={0.6} />
        <Path d="M 107 70 L 107 62 Q 109 60 111 62 L 111 70 Z" fill={arch} opacity={0.5} />

        {/* Big golden dome */}
        <Path d="M 82 50 Q 100 14 118 50 Z" fill={dome} />
        <Path d="M 100 14 L 100 50" stroke={domeHighlight} strokeWidth="0.7" />
        {/* Small lantern */}
        <Rect x="96" y="12" width="8" height="6" fill={dome} />
        <Path d="M 94 12 Q 100 6 106 12 Z" fill={dome} />

        {/* Cross on top */}
        <Rect x="99" y="-2" width="2" height="12" fill={wall} />
        <Rect x="95" y="2" width="10" height="2" fill={wall} />
      </G>

      {/* Kura river */}
      <Rect x="0" y="142" width="200" height="5" fill={alpha(accent, '38')} rx="2.5" />
      <Rect x="0" y="150" width="200" height="3" fill={alpha(accent, '22')} rx="1.5" />

      {/* Hint of bridge arches (Peace / Metekhi) */}
      <G opacity={0.75}>
        <Path d="M 24 144 Q 32 136 40 144" stroke={outline} strokeWidth="1.2" fill="none" />
        <Path d="M 40 144 Q 48 136 56 144" stroke={outline} strokeWidth="1.2" fill="none" />
      </G>

      {/* Dim silhouette ground between roofs and cathedral base */}
      <Rect x="0" y="134" width="200" height="6" fill={alpha(dim, '10')} />
    </Svg>
  );
}
