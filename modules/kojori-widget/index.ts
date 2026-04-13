import { requireOptionalNativeModule } from 'expo-modules-core';

export interface KojoriWidgetModule {
  syncWidgetState(stateJson: string): Promise<void>;
}

export default requireOptionalNativeModule<KojoriWidgetModule>('KojoriWidget');
