package expo.modules.kojoriwidget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.os.Build
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

    Function("requestPinWidget") { size: String ->
      val context = appContext.reactContext ?: return@Function false
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return@Function false
      val manager = AppWidgetManager.getInstance(context)
      if (!manager.isRequestPinAppWidgetSupported) return@Function false
      val cls = when (size) {
        "2x2" -> KojoriBusWidget2x2::class.java
        "3x3" -> KojoriBusWidget3x3::class.java
        else -> KojoriBusWidgetProvider::class.java // 2x3 default
      }
      val component = ComponentName(context, cls)
      manager.requestPinAppWidget(component, null, null)
      true
    }

    Function("hasWidgetInstalled") {
      val context = appContext.reactContext ?: return@Function false
      val manager = AppWidgetManager.getInstance(context)
      val providers = arrayOf(
        KojoriBusWidgetProvider::class.java,
        KojoriBusWidget2x2::class.java,
        KojoriBusWidget3x3::class.java,
      )
      providers.any { manager.getAppWidgetIds(ComponentName(context, it)).isNotEmpty() }
    }

    Function("canPinWidget") {
      val context = appContext.reactContext ?: return@Function false
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return@Function false
      AppWidgetManager.getInstance(context).isRequestPinAppWidgetSupported
    }
  }
}
