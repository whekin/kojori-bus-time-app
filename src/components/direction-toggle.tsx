import React from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';

const C = {
  surface: '#111316',
  surfaceHigh: '#18191E',
  border: '#1E2128',
  borderStrong: '#2A2F3A',
  textDim: '#565C6B',
} as const;

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

const styles = StyleSheet.create({
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
