import {
  default as BottomSheet,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import React, { type PropsWithChildren } from 'react';
import { Modal, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useAppColors } from '@/hooks/use-app-colors';

export { BottomSheetScrollView as ScrollableBottomSheetScrollView };

export type ScrollableBottomSheetProps = PropsWithChildren<{
  visible: boolean;
  onClose: () => void;
  snapPoint: string;
  contentStyle?: StyleProp<ViewStyle>;
}>;

export function ScrollableBottomSheet({
  visible,
  onClose,
  snapPoint,
  children,
  contentStyle,
}: ScrollableBottomSheetProps) {
  const colors = useAppColors();
  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <BottomSheet
          index={0}
          snapPoints={[snapPoint]}
          enableDynamicSizing={false}
          enablePanDownToClose
          backgroundStyle={[
            styles.background,
            {
              backgroundColor: colors.surface,
              borderColor: colors.borderStrong,
            },
          ]}
          handleIndicatorStyle={{ backgroundColor: colors.borderStrong }}
          onClose={onClose}>
          <View style={contentStyle}>{children}</View>
        </BottomSheet>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.38)',
  },
  background: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
  },
});
