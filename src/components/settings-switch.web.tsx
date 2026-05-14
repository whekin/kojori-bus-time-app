import React from 'react';
import { StyleSheet, Switch, View, type SwitchProps } from 'react-native';

import { useAppColors } from '@/hooks/use-app-colors';

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

  return (
    <View style={styles.slot}>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onValueChange}
        trackColor={{ false: colors.surfaceHigh, true: `${accentColor}48` }}
        thumbColor={value ? accentColor : colors.textDim}
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
