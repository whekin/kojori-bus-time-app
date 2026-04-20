package expo.modules.kojoriwidget

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.SystemClock
import android.view.View
import android.widget.RemoteViews
import androidx.core.content.ContextCompat
import org.json.JSONObject

open class KojoriBusWidgetProvider : AppWidgetProvider() {
  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)

    when (intent.action) {
      ACTION_SET_DIRECTION -> {
        if (!isTrustedWidgetAction(context, intent)) return
        val nextDirection = intent.getStringExtra(EXTRA_DIRECTION) ?: return
        WidgetPrefs.setDirection(context, nextDirection)
        refreshAll(context)
      }
      ACTION_REFRESH -> {
        if (!isTrustedWidgetAction(context, intent)) return
        WidgetPrefs.setRefreshingUntil(context, System.currentTimeMillis() + REFRESH_ANIMATION_MS)
        scheduleRefreshAnimationClear(context)
        refreshAll(context)
      }
      ACTION_TICK -> {
        if (!isTrustedWidgetAction(context, intent)) return
        refreshAll(context)
      }
      ACTION_CLEAR_REFRESH_ANIMATION -> {
        if (!isTrustedWidgetAction(context, intent)) return
        WidgetPrefs.clearRefreshing(context)
        refreshAll(context)
      }
      ACTION_OPEN_APP -> {
        if (!isTrustedWidgetAction(context, intent)) return
        val direction = intent.getStringExtra(EXTRA_DIRECTION) ?: WidgetPrefs.getDirection(context)
        val stopId = intent.getStringExtra(EXTRA_STOP_ID) ?: ""
        val uri = Uri.parse("kojoribs://?widgetMode=$direction&widgetStopId=$stopId")
        val openIntent = Intent(Intent.ACTION_VIEW, uri).apply {
          setPackage(context.packageName)
          flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        context.startActivity(openIntent)
      }
    }
  }

  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray,
  ) {
    scheduleMinuteTick(context)
    appWidgetIds.forEach { appWidgetId ->
      updateWidget(context, appWidgetManager, appWidgetId)
    }
  }

  override fun onEnabled(context: Context) {
    super.onEnabled(context)
    scheduleMinuteTick(context)
  }

  override fun onDisabled(context: Context) {
    super.onDisabled(context)
    cancelMinuteTick(context)
  }

  override fun onAppWidgetOptionsChanged(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetId: Int,
    newOptions: android.os.Bundle,
  ) {
    super.onAppWidgetOptionsChanged(context, appWidgetManager, appWidgetId, newOptions)
    updateWidget(context, appWidgetManager, appWidgetId)
  }

  companion object {
    private const val ACTION_SET_DIRECTION = "expo.modules.kojoriwidget.SET_DIRECTION"
    private const val ACTION_REFRESH = "expo.modules.kojoriwidget.REFRESH"
    private const val ACTION_TICK = "expo.modules.kojoriwidget.TICK"
    private const val ACTION_CLEAR_REFRESH_ANIMATION = "expo.modules.kojoriwidget.CLEAR_REFRESH_ANIMATION"
    private const val ACTION_OPEN_APP = "expo.modules.kojoriwidget.OPEN_APP"
    private const val EXTRA_DIRECTION = "direction"
    private const val EXTRA_STOP_ID = "stop_id"
    private const val EXTRA_ACTION_TOKEN = "action_token"
    private const val TICK_INTERVAL_MS = 60_000L
    private const val TICK_REQUEST_CODE = 9999
    private const val CLEAR_REFRESH_REQUEST_CODE = 10000
    private const val REFRESH_ANIMATION_MS = 1800L

    private data class WidgetPalette(
      val text: Int,
      val textDim: Int,
      val textFaint: Int,
      val route380: Int,
      val route316: Int,
    )

    private val PROVIDER_CLASSES: Array<Class<out KojoriBusWidgetProvider>> = arrayOf(
      KojoriBusWidgetProvider::class.java,
      KojoriBusWidget2x2::class.java,
      KojoriBusWidget3x3::class.java,
    )

    fun refreshAll(context: Context) {
      val appWidgetManager = AppWidgetManager.getInstance(context)
      for (cls in PROVIDER_CLASSES) {
        val component = ComponentName(context, cls)
        val appWidgetIds = appWidgetManager.getAppWidgetIds(component)
        if (appWidgetIds.isEmpty()) continue
        appWidgetManager.notifyAppWidgetViewDataChanged(appWidgetIds, R.id.widget_list)
        appWidgetIds.forEach { appWidgetId ->
          updateWidget(context, appWidgetManager, appWidgetId)
        }
      }
    }

    private const val NARROW_WIDTH_THRESHOLD_DP = 180

    private fun isNarrow(appWidgetManager: AppWidgetManager, appWidgetId: Int): Boolean {
      val options = appWidgetManager.getAppWidgetOptions(appWidgetId)
      val minWidth = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0)
      return minWidth in 1 until NARROW_WIDTH_THRESHOLD_DP
    }

    private fun updateWidget(
      context: Context,
      appWidgetManager: AppWidgetManager,
      appWidgetId: Int,
    ) {
      val views = RemoteViews(context.packageName, R.layout.kojori_bus_widget)
      val currentDirection = WidgetPrefs.getDirection(context)
      val stateJson = WidgetPrefs.getStateJson(context)
      val root = stateJson?.let { runCatching { JSONObject(it) }.getOrNull() }
      val palette = readPalette(context, root)

      val listIntent = Intent(context, WidgetListService::class.java).apply {
        putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
        data = Uri.parse(toUri(Intent.URI_INTENT_SCHEME))
      }
      views.setRemoteAdapter(R.id.widget_list, listIntent)
      views.setPendingIntentTemplate(R.id.widget_list, widgetCollectionPendingIntent(context, appWidgetId))

      if (stateJson.isNullOrBlank()) {
        bindEmptyState(views, currentDirection, palette)
        appWidgetManager.updateAppWidget(appWidgetId, views)
        return
      }

      val snapshot = root
        ?.optJSONObject("directions")
        ?.optJSONObject(currentDirection)

      if (snapshot == null) {
        bindEmptyState(views, currentDirection, palette)
        appWidgetManager.updateAppWidget(appWidgetId, views)
        return
      }

      val message = snapshot.optString("message", "")
      val items = snapshot.optJSONArray("items")
      val hadSnapshotItems = items != null && items.length() > 0
      val hasItems = hasUpcomingItems(snapshot, System.currentTimeMillis())
      val displayMessage = when {
        snapshot.optString("status") == "error" -> message.ifBlank { "Open app to refresh" }
        !hasItems && hadSnapshotItems -> "Open app to refresh"
        message.isBlank() -> "No departures soon"
        else -> message
      }

      views.setTextViewText(R.id.widget_message, displayMessage)
      views.setTextColor(
        R.id.widget_message,
        if (snapshot.optString("status") == "error") {
          ContextCompat.getColor(context, R.color.widget_warning)
        } else {
          palette.textDim
        },
      )

      views.setViewVisibility(R.id.widget_message, if (hasItems) View.GONE else View.VISIBLE)
      views.setViewVisibility(R.id.widget_list, if (hasItems) View.VISIBLE else View.GONE)
      appWidgetManager.updateAppWidget(appWidgetId, views)
    }

    private fun hasUpcomingItems(snapshot: JSONObject, nowMs: Long): Boolean {
      val items = snapshot.optJSONArray("items") ?: return false
      val syncedAtEpochMs = snapshot.optLong("syncedAtEpochMs", 0L)

      for (index in 0 until items.length()) {
        val item = items.optJSONObject(index) ?: continue
        val departureEpochMs = item.optLong("departureEpochMs", 0L)
        if (departureEpochMs > nowMs) return true

        if (departureEpochMs <= 0L && syncedAtEpochMs > 0L && item.has("minsUntilAtSync")) {
          val legacyDepartureEpochMs = syncedAtEpochMs + item.optInt("minsUntilAtSync", Int.MIN_VALUE) * 60_000L
          if (legacyDepartureEpochMs > nowMs) return true
        }
      }

      return false
    }

    private fun bindEmptyState(
      views: RemoteViews, direction: String, palette: WidgetPalette,
    ) {
      views.setTextViewText(R.id.widget_message, "Open app to load")
      views.setTextColor(R.id.widget_message, palette.textDim)
      views.setViewVisibility(R.id.widget_list, View.GONE)
      views.setViewVisibility(R.id.widget_message, View.VISIBLE)
    }

    private fun widgetCollectionPendingIntent(context: Context, appWidgetId: Int): PendingIntent {
      val intent = Intent(context, KojoriBusWidgetProvider::class.java).apply {
        putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
        putExtra(EXTRA_ACTION_TOKEN, WidgetPrefs.getActionToken(context))
      }
      return PendingIntent.getBroadcast(
        context,
        appWidgetId + 7000,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
      )
    }

    private fun directionPendingIntent(
      context: Context, appWidgetId: Int, direction: String,
    ): PendingIntent {
      val intent = Intent(context, KojoriBusWidgetProvider::class.java).apply {
        action = ACTION_SET_DIRECTION
        putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
        putExtra(EXTRA_DIRECTION, direction)
        putExtra(EXTRA_ACTION_TOKEN, WidgetPrefs.getActionToken(context))
      }
      return PendingIntent.getBroadcast(
        context, appWidgetId + if (direction == "kojori") 100 else 200,
        intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }

    private fun isTrustedWidgetAction(context: Context, intent: Intent): Boolean {
      return intent.getStringExtra(EXTRA_ACTION_TOKEN) == WidgetPrefs.getActionToken(context)
    }

    private fun tickPendingIntent(context: Context): PendingIntent {
      val intent = Intent(context, KojoriBusWidgetProvider::class.java).apply {
        action = ACTION_TICK
        putExtra(EXTRA_ACTION_TOKEN, WidgetPrefs.getActionToken(context))
      }
      return PendingIntent.getBroadcast(
        context, TICK_REQUEST_CODE, intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }

    private fun clearRefreshAnimationPendingIntent(context: Context): PendingIntent {
      val intent = Intent(context, KojoriBusWidgetProvider::class.java).apply {
        action = ACTION_CLEAR_REFRESH_ANIMATION
        putExtra(EXTRA_ACTION_TOKEN, WidgetPrefs.getActionToken(context))
      }
      return PendingIntent.getBroadcast(
        context, CLEAR_REFRESH_REQUEST_CODE, intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }

    private fun scheduleMinuteTick(context: Context) {
      val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      alarmManager.setInexactRepeating(
        AlarmManager.ELAPSED_REALTIME,
        SystemClock.elapsedRealtime() + TICK_INTERVAL_MS,
        TICK_INTERVAL_MS,
        tickPendingIntent(context),
      )
    }

    private fun scheduleRefreshAnimationClear(context: Context) {
      val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      alarmManager.set(
        AlarmManager.ELAPSED_REALTIME,
        SystemClock.elapsedRealtime() + REFRESH_ANIMATION_MS,
        clearRefreshAnimationPendingIntent(context),
      )
    }

    private fun cancelMinuteTick(context: Context) {
      val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      alarmManager.cancel(tickPendingIntent(context))
      alarmManager.cancel(clearRefreshAnimationPendingIntent(context))
    }

    private fun readPalette(context: Context, root: JSONObject?): WidgetPalette {
      val p = root?.optJSONObject("palette")
      return WidgetPalette(
        text = colorOrDefault(context, p?.optString("text"), R.color.widget_text),
        textDim = colorOrDefault(context, p?.optString("textDim"), R.color.widget_text_dim),
        textFaint = colorOrDefault(context, p?.optString("textFaint"), R.color.widget_text_faint),
        route380 = colorOrDefault(context, p?.optString("route380"), R.color.widget_amber),
        route316 = colorOrDefault(context, p?.optString("route316"), R.color.widget_teal),
      )
    }

    private fun colorOrDefault(context: Context, hex: String?, defaultRes: Int): Int {
      return runCatching {
        if (hex.isNullOrBlank()) ContextCompat.getColor(context, defaultRes) else Color.parseColor(hex)
      }.getOrElse { ContextCompat.getColor(context, defaultRes) }
    }
  }
}
