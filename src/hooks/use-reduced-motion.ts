import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useReducedMotion as useReanimatedReducedMotion } from 'react-native-reanimated';

export function useReducedMotion(initialValue?: boolean) {
  const systemReducedMotion = useReanimatedReducedMotion();
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(
    systemReducedMotion ?? initialValue ?? false,
  );

  useEffect(() => {
    let mounted = true;
    setReduceMotionEnabled(systemReducedMotion);

    AccessibilityInfo.isReduceMotionEnabled()
      .then(enabled => {
        if (mounted) setReduceMotionEnabled(enabled);
      })
      .catch(() => {
        if (mounted) setReduceMotionEnabled(false);
      });

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotionEnabled,
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, [systemReducedMotion]);

  return reduceMotionEnabled;
}
