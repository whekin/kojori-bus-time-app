package expo.modules.kojoriwidget

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class KojoriWidgetModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("KojoriWidget")

    AsyncFunction("syncWidgetState") { stateJson: String ->
      val context = appContext.reactContext ?: throw IllegalStateException("React context unavailable")
      WidgetPrefs.saveStateJson(context, stateJson)
      KojoriBusWidgetProvider.refreshAll(context)
    }
  }
}
