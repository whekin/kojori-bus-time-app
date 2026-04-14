import { requireOptionalNativeModule } from 'expo-modules-core';

export interface KojoriWidgetModule {
  syncWidgetState(stateJson: string): Promise<void>;
  requestPinWidget(size: '2x2' | '2x3' | '3x3'): boolean;
  hasWidgetInstalled(): boolean;
  canPinWidget(): boolean;
}

export default requireOptionalNativeModule<KojoriWidgetModule>('KojoriWidget');
