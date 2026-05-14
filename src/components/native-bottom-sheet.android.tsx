import {
  Host,
  ModalBottomSheet,
  RNHostView,
  type ModalBottomSheetRef,
} from '@expo/ui/jetpack-compose';
import React, { type PropsWithChildren, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useAppColors } from '@/hooks/use-app-colors';

const SCRIM_COLOR = '#61000000';

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
  sheetGesturesEnabled = true,
  children,
  contentStyle,
}: NativeBottomSheetProps) {
  const colors = useAppColors();
  const sheetRef = useRef<ModalBottomSheetRef>(null);
  const latestVisibleRef = useRef(visible);
  const mountedRef = useRef(true);
  const hideRequestRef = useRef(0);
  const isHidingRef = useRef(false);
  const [shouldRender, setShouldRender] = useState(visible);

  latestVisibleRef.current = visible;

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (visible) {
      hideRequestRef.current += 1;
      isHidingRef.current = false;
      setShouldRender(true);
      return;
    }

    if (!shouldRender || isHidingRef.current) return;

    const hideRequest = hideRequestRef.current + 1;
    hideRequestRef.current = hideRequest;

    const sheet = sheetRef.current;
    if (!sheet) {
      setShouldRender(false);
      return;
    }

    isHidingRef.current = true;
    void sheet.hide()
      .catch(() => {
        // If the native view is already dismissed, still let React unmount it.
      })
      .finally(() => {
        if (mountedRef.current && hideRequestRef.current === hideRequest) {
          setShouldRender(latestVisibleRef.current);
        }
        isHidingRef.current = false;
      });
  }, [shouldRender, visible]);

  if (!shouldRender) return null;

  function handleDismissRequest() {
    if (latestVisibleRef.current) {
      onClose();
    }
  }

  return (
    <Host useViewportSizeMeasurement style={styles.host}>
      <ModalBottomSheet
        ref={sheetRef}
        onDismissRequest={handleDismissRequest}
        containerColor={colors.surface}
        contentColor={colors.text}
        scrimColor={SCRIM_COLOR}
        showDragHandle
        sheetGesturesEnabled={sheetGesturesEnabled}
        properties={{
          shouldDismissOnBackPress: true,
          shouldDismissOnClickOutside: true,
        }}>
        <RNHostView matchContents>
          <View style={contentStyle}>{children}</View>
        </RNHostView>
      </ModalBottomSheet>
    </Host>
  );
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
  },
});
