package expo.modules.kojoriwidget

import android.content.Context
import java.util.UUID

// Must match FAVORITES_WIDGET_SCHEMA in src/transit/widget.ts.
// Version 2 remains readable while existing widgets migrate to favorites.
internal const val WIDGET_STATE_SCHEMA_VERSION = 3

internal fun isSupportedWidgetState(root: org.json.JSONObject?): Boolean =
  root != null && root.optInt("schemaVersion", 1) in 2..WIDGET_STATE_SCHEMA_VERSION

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

  fun setDirection(context: Context, direction: String, widgetId: Int = -1) {
    prefs(context).edit().putString(if (widgetId < 0) KEY_DIRECTION else "${KEY_DIRECTION}_$widgetId", direction).apply()
  }

  fun getDirection(context: Context, widgetId: Int = -1): String {
    val saved = prefs(context).getString("${KEY_DIRECTION}_$widgetId", null)
      ?: prefs(context).getString(KEY_DIRECTION, "kojori") ?: "kojori"
    val root = getStateJson(context)?.let { runCatching { org.json.JSONObject(it) }.getOrNull() }
    val order = root?.optJSONArray("favoriteOrder") ?: return saved
    val ids = (0 until order.length()).map { order.optString(it) }
    if (saved in ids) return saved
    val migrated = root?.optJSONObject("legacySelections")?.optString(saved)
    if (migrated != null && migrated in ids) return migrated
    val legacyDirection = if (saved == "kojori") "toKojori" else if (saved == "tbilisi") "toTbilisi" else null
    return ids.firstOrNull { legacyDirection != null && it.startsWith("legacy:$legacyDirection:") } ?: ids.firstOrNull() ?: ""
  }

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
