import React from 'react';
import { StyleSheet, Switch, View, type SwitchProps } from 'react-native';

import { useAppColors } from '@/hooks/use-app-colors';

function withOpacity(color: string, opacity: number): string {
  const hex = color.replace('#', '');
  const normalized = hex.length === 3
    ? hex.split('').map(char => char + char).join('')
    : hex;

  if (normalized.length !== 6) {
    return color;
  }

  const alpha = Math.max(0, Math.min(255, Math.round(opacity * 255)))
    .toString(16)
    .padStart(2, '0');

  return `#${alpha}${normalized}`;
}

type SettingsSwitchProps = Pick<SwitchProps, 'disabled'> & {
  value: boolean;
  accentColor: string;
  onValueChange: (value: boolean) => void;
};

export function SettingsSwitch({
  value,
  disabled,
  accentColor,
  onValueChange,
}: SettingsSwitchProps) {
  const colors = useAppColors();
  const checkedTrackColor = withOpacity(accentColor, 0.28);
  const checkedThumbColor = accentColor;
  const uncheckedTrackColor = colors.surfaceHigh;
  const uncheckedThumbColor = colors.textDim;

  return (
    <View style={styles.slot}>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onValueChange}
        trackColor={{ false: uncheckedTrackColor, true: checkedTrackColor }}
        thumbColor={value ? checkedThumbColor : uncheckedThumbColor}
        ios_backgroundColor={uncheckedTrackColor}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    width: 56,
    minWidth: 56,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});
