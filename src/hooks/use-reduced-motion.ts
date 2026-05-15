import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReducedMotion(initialValue = false) {
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(initialValue);

  useEffect(() => {
    let mounted = true;

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
  }, []);

  return reduceMotionEnabled;
}
