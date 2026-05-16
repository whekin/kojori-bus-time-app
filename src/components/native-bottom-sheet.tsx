import React, { type PropsWithChildren } from 'react';
import { Modal, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useAppColors } from '@/hooks/use-app-colors';

const SCRIM_COLOR = 'rgba(0, 0, 0, 0.38)';

export type NativeBottomSheetProps = PropsWithChildren<{
  visible: boolean;
  onClose: () => void;
  sheetGesturesEnabled?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  fallbackSheetStyle?: StyleProp<ViewStyle>;
}>;

export function NativeBottomSheet({
  visible,
  onClose,
  children,
  contentStyle,
  fallbackSheetStyle,
}: NativeBottomSheetProps) {
  const colors = useAppColors();
  const styles = createStyles(colors);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, fallbackSheetStyle]}>
          <View style={styles.handle} />
          <View style={contentStyle}>{children}</View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(C: ReturnType<typeof useAppColors>) {
  return StyleSheet.create({
    root: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    backdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: SCRIM_COLOR,
    },
    sheet: {
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      borderWidth: 1,
      borderBottomWidth: 0,
      borderColor: C.borderStrong,
      backgroundColor: C.surface,
      paddingTop: 10,
    },
    handle: {
      alignSelf: 'center',
      width: 44,
      height: 4,
      borderRadius: 999,
      backgroundColor: C.borderStrong,
      marginBottom: 6,
    },
  });
}
