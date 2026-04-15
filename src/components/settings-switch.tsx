import { Host, Switch as ExpoUISwitch } from '@expo/ui/jetpack-compose';
import { size } from '@expo/ui/jetpack-compose/modifiers';
import React from 'react';
import { Platform, StyleSheet, Switch, View, type SwitchProps } from 'react-native';

import { useAppColors } from '@/hooks/use-app-colors';

function hasExpoUISwitch() {
  if (Platform.OS !== 'android') return false;
  return Boolean(globalThis.expo?.getViewConfig?.('ExpoUI', 'SwitchView'));
}

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
  const uncheckedBorderColor = colors.borderStrong;
  const uncheckedThumbColor = colors.textDim;
  const disabledCheckedTrackColor = withOpacity(accentColor, 0.18);
  const disabledCheckedThumbColor = withOpacity(accentColor, 0.55);
  const disabledUncheckedTrackColor = colors.surface;
  const disabledUncheckedBorderColor = colors.border;
  const disabledUncheckedThumbColor = colors.textFaint;

  if (Platform.OS === 'android' && hasExpoUISwitch()) {
    return (
      <View style={styles.slot}>
        <Host matchContents>
          <ExpoUISwitch
            value={value}
            enabled={!disabled}
            onCheckedChange={onValueChange}
            modifiers={[size(44, 26)]}
            colors={{
              checkedTrackColor,
              checkedBorderColor: accentColor,
              checkedIconColor: 'transparent',
              uncheckedTrackColor,
              uncheckedBorderColor,
              uncheckedIconColor: 'transparent',
              uncheckedThumbColor,
              checkedThumbColor,
              disabledCheckedTrackColor,
              disabledCheckedBorderColor: disabledCheckedTrackColor,
              disabledCheckedIconColor: 'transparent',
              disabledUncheckedTrackColor,
              disabledUncheckedBorderColor,
              disabledUncheckedIconColor: 'transparent',
              disabledUncheckedThumbColor,
              disabledCheckedThumbColor,
            }}
          />
        </Host>
      </View>
    );
  }

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
