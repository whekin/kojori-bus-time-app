import {
  default as BottomSheet,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import React, { type PropsWithChildren } from 'react';
import { Modal, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ReduceMotion } from 'react-native-reanimated';

import { useAppColors } from '@/hooks/use-app-colors';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

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
  const reduceMotion = useReducedMotion();
  if (!visible) return null;

  return (
    <Modal visible transparent animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={styles.root}>
        <Pressable
          accessible={false}
          importantForAccessibility="no"
          style={styles.backdrop}
          onPress={onClose}
        />
        <BottomSheet
          index={0}
          snapPoints={[snapPoint]}
          animateOnMount={!reduceMotion}
          overrideReduceMotion={reduceMotion ? ReduceMotion.Always : ReduceMotion.System}
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
