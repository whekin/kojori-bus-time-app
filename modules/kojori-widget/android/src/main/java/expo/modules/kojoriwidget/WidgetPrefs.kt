package expo.modules.kojoriwidget

import android.content.Context
import java.util.UUID

object WidgetPrefs {
  private const val PREFS_NAME = "kojori_bus_widget"
  private const val KEY_STATE_JSON = "state_json"
  private const val KEY_DIRECTION = "direction"
  private const val KEY_ACTION_TOKEN = "action_token"
  private const val KEY_REFRESHING_UNTIL_MS = "refreshing_until_ms"

  fun saveStateJson(context: Context, stateJson: String) {
    prefs(context).edit().putString(KEY_STATE_JSON, stateJson).apply()
  }

  fun getStateJson(context: Context): String? = prefs(context).getString(KEY_STATE_JSON, null)

  fun setDirection(context: Context, direction: String) {
    prefs(context).edit().putString(KEY_DIRECTION, direction).apply()
  }

  fun getDirection(context: Context): String =
    prefs(context).getString(KEY_DIRECTION, "kojori") ?: "kojori"

  fun getActionToken(context: Context): String {
    val prefs = prefs(context)
    val existing = prefs.getString(KEY_ACTION_TOKEN, null)
    if (!existing.isNullOrBlank()) return existing

    val token = UUID.randomUUID().toString()
    prefs.edit().putString(KEY_ACTION_TOKEN, token).apply()
    return token
  }

  fun setRefreshingUntil(context: Context, timestampMs: Long) {
    prefs(context).edit().putLong(KEY_REFRESHING_UNTIL_MS, timestampMs).apply()
  }

  fun getRefreshingUntil(context: Context): Long =
    prefs(context).getLong(KEY_REFRESHING_UNTIL_MS, 0L)

  fun clearRefreshing(context: Context) {
    prefs(context).edit().remove(KEY_REFRESHING_UNTIL_MS).apply()
  }

  private fun prefs(context: Context) =
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
}
