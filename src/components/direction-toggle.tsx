import React from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { type AppColors } from '@/constants/theme';
import { useAppColors } from '@/hooks/use-app-colors';

interface DirectionOption<T extends string> {
  value: T;
  label: string;
  accentColor: string;
}

export function DirectionToggle<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: DirectionOption<T>[];
  value: T;
  onChange: (value: T) => void;
  style?: ViewStyle;
}) {
  const C = useAppColors();
  const styles = React.useMemo(() => createStyles(C), [C]);

  return (
    <View style={[styles.toggle, style]}>
      {options.map(option => {
        const isActive = option.value === value;
        return (
          <Pressable
            key={option.value}
            style={[styles.toggleSeg, isActive && styles.toggleSegOn]}
            onPress={() => onChange(option.value)}>
            <Text style={[styles.toggleText, isActive && { color: option.accentColor }]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles(C: AppColors) {
  return StyleSheet.create({
    toggle: {
      flexDirection: 'row',
      backgroundColor: C.surface,
      borderRadius: 12,
      padding: 3,
      borderWidth: 1,
      borderColor: C.border,
    },
    toggleSeg: {
      flex: 1,
      paddingVertical: 11,
      alignItems: 'center',
      borderRadius: 9,
    },
    toggleSegOn: {
      backgroundColor: C.surfaceHigh,
      borderWidth: 1,
      borderColor: C.borderStrong,
    },
    toggleText: {
      color: C.textDim,
      fontSize: 14,
      fontWeight: '600',
      letterSpacing: 0.3,
    },
  });
}
