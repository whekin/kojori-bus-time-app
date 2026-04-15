import { Image } from 'expo-image';
import { useState } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { ReactNode } from 'react';

const INITIAL_SCALE_FACTOR = Dimensions.get('screen').height / 90;
const SPLASH_DELAY = 400;
const FADE_DURATION = 500;
const TOTAL_DURATION = SPLASH_DELAY + FADE_DURATION;
const DURATION = TOTAL_DURATION;

export function AnimatedSplashOverlay() {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  const overlayKeyframe = new Keyframe({
    0: { opacity: 1 },
    40: { opacity: 1 },
    100: { opacity: 0, easing: Easing.out(Easing.cubic) },
  });

  const logoKeyframe = new Keyframe({
    0: { opacity: 1, transform: [{ scale: 1 }] },
    30: { opacity: 1, transform: [{ scale: 1 }] },
    100: {
      opacity: 0,
      transform: [{ scale: 0.85 }],
      easing: Easing.out(Easing.cubic),
    },
  });

  const totalDuration = TOTAL_DURATION;

  return (
    <Animated.View
      entering={overlayKeyframe.duration(totalDuration).withCallback((finished) => {
        'worklet';
        if (finished) {
          scheduleOnRN(setVisible, false);
        }
      })}
      style={styles.backgroundSolidColor}>
      <View style={[styles.glowOrb, styles.glowOrbAmber]} />
      <View style={[styles.glowOrb, styles.glowOrbTeal]} />
      <View style={[styles.glowBand, styles.glowBandTop]} />
      <View style={[styles.glowBand, styles.glowBandBottom]} />
      <Animated.View entering={logoKeyframe.duration(totalDuration)} style={styles.splashLogoWrap}>
        <Image
          source={require('@/assets/images/splash-icon.png')}
          style={styles.splashLogo}
          contentFit="contain"
        />
      </Animated.View>
    </Animated.View>
  );
}

const appRevealKeyframe = new Keyframe({
  0: {
    opacity: 0,
    transform: [{ scale: 0.95 }],
  },
  30: {
    opacity: 0,
    transform: [{ scale: 0.95 }],
  },
  100: {
    opacity: 1,
    transform: [{ scale: 1 }],
    easing: Easing.out(Easing.cubic),
  },
});

export function AppReveal({ children }: { children: ReactNode }) {
  return (
    <Animated.View entering={appRevealKeyframe.duration(TOTAL_DURATION)} style={{ flex: 1 }}>
      {children}
    </Animated.View>
  );
}

const keyframe = new Keyframe({
  0: {
    transform: [{ scale: INITIAL_SCALE_FACTOR }],
  },
  100: {
    transform: [{ scale: 1 }],
    easing: Easing.elastic(0.7),
  },
});

const logoKeyframe = new Keyframe({
  0: {
    transform: [{ scale: 1.3 }],
    opacity: 0,
  },
  40: {
    transform: [{ scale: 1.3 }],
    opacity: 0,
    easing: Easing.elastic(0.7),
  },
  100: {
    opacity: 1,
    transform: [{ scale: 1 }],
    easing: Easing.elastic(0.7),
  },
});

const glowKeyframe = new Keyframe({
  0: {
    transform: [{ rotateZ: '0deg' }],
  },
  100: {
    transform: [{ rotateZ: '7200deg' }],
  },
});

export function AnimatedIcon() {
  return (
    <View style={styles.iconContainer}>
      <Animated.View entering={glowKeyframe.duration(60 * 1000 * 4)} style={styles.glow}>
        <Image style={styles.glow} source={require('@/assets/images/logo-glow.png')} />
      </Animated.View>

      <Animated.View style={styles.imageContainer} entering={logoKeyframe.duration(DURATION)}>
        <Animated.View entering={keyframe.duration(DURATION)} style={styles.imageBackdrop}>
          <Image style={styles.image} source={require('@/assets/images/splash-icon.png')} contentFit="contain" />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  imageContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  glow: {
    width: 201,
    height: 201,
    position: 'absolute',
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 128,
    height: 128,
    zIndex: 100,
  },
  imageBackdrop: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 128,
    height: 128,
  },
  image: {
    width: 128,
    height: 128,
  },
  backgroundSolidColor: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#111316',
    zIndex: 1000,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  glowOrb: {
    position: 'absolute',
    borderRadius: 999,
  },
  glowOrbAmber: {
    width: 240,
    height: 240,
    top: -70,
    left: -60,
    backgroundColor: 'rgba(245, 162, 10, 0.16)',
  },
  glowOrbTeal: {
    width: 260,
    height: 260,
    right: -80,
    bottom: -90,
    backgroundColor: 'rgba(16, 184, 163, 0.14)',
  },
  glowBand: {
    position: 'absolute',
    left: -20,
    right: -20,
    height: 120,
    opacity: 0.9,
  },
  glowBandTop: {
    top: 120,
    backgroundColor: 'rgba(245, 162, 10, 0.05)',
    transform: [{ rotate: '-8deg' }],
  },
  glowBandBottom: {
    bottom: 110,
    backgroundColor: 'rgba(16, 184, 163, 0.05)',
    transform: [{ rotate: '7deg' }],
  },
  splashLogoWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashLogo: {
    width: 120,
    height: 120,
  },
});
