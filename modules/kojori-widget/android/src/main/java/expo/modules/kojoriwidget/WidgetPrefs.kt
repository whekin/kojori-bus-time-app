package expo.modules.kojoriwidget

import android.content.Context

object WidgetPrefs {
  private const val PREFS_NAME = "kojori_bus_widget"
  private const val KEY_STATE_JSON = "state_json"
  private const val KEY_DIRECTION = "direction"

  fun saveStateJson(context: Context, stateJson: String) {
    prefs(context).edit().putString(KEY_STATE_JSON, stateJson).apply()
  }

  fun getStateJson(context: Context): String? = prefs(context).getString(KEY_STATE_JSON, null)

  fun setDirection(context: Context, direction: String) {
    prefs(context).edit().putString(KEY_DIRECTION, direction).apply()
  }

  fun getDirection(context: Context): String =
    prefs(context).getString(KEY_DIRECTION, "kojori") ?: "kojori"

  private fun prefs(context: Context) =
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
}
