import { Host, Switch as ExpoUISwitch } from '@expo/ui/jetpack-compose';
import { size } from '@expo/ui/jetpack-compose/modifiers';
import React from 'react';
import { Platform, StyleSheet, Switch, View, type SwitchProps } from 'react-native';

function hasExpoUISwitch() {
  if (Platform.OS !== 'android') return false;
  return Boolean(globalThis.expo?.getViewConfig?.('ExpoUI', 'SwitchView'));
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
              checkedTrackColor: `${accentColor}CC`,
              checkedBorderColor: accentColor,
              checkedIconColor: 'transparent',
              uncheckedTrackColor: '#232830',
              uncheckedBorderColor: '#343A44',
              uncheckedIconColor: 'transparent',
              uncheckedThumbColor: '#D9DDE4',
              checkedThumbColor: '#F6F7F9',
              disabledCheckedTrackColor: '#39414A',
              disabledCheckedBorderColor: '#39414A',
              disabledCheckedIconColor: 'transparent',
              disabledUncheckedTrackColor: '#1B1F26',
              disabledUncheckedBorderColor: '#2A3038',
              disabledUncheckedIconColor: 'transparent',
              disabledUncheckedThumbColor: '#7B818C',
              disabledCheckedThumbColor: '#AAB1BC',
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
        trackColor={{ false: '#232830', true: `${accentColor}CC` }}
        thumbColor="#F6F7F9"
        ios_backgroundColor="#232830"
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
