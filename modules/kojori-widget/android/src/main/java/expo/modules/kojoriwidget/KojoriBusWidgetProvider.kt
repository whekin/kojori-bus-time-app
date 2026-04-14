package expo.modules.kojoriwidget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.view.View
import android.widget.RemoteViews
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class KojoriBusWidgetProvider : AppWidgetProvider() {
  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)

    if (intent.action == ACTION_SET_DIRECTION) {
      val nextDirection = intent.getStringExtra(EXTRA_DIRECTION) ?: return
      WidgetPrefs.setDirection(context, nextDirection)
      refreshAll(context)
    }
  }

  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray,
  ) {
    appWidgetIds.forEach { appWidgetId ->
      updateWidget(context, appWidgetManager, appWidgetId)
    }
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
    private const val EXTRA_DIRECTION = "direction"

    fun refreshAll(context: Context) {
      val appWidgetManager = AppWidgetManager.getInstance(context)
      val component = ComponentName(context, KojoriBusWidgetProvider::class.java)
      val appWidgetIds = appWidgetManager.getAppWidgetIds(component)
      appWidgetIds.forEach { appWidgetId ->
        updateWidget(context, appWidgetManager, appWidgetId)
      }
    }

    private fun updateWidget(
      context: Context,
      appWidgetManager: AppWidgetManager,
      appWidgetId: Int,
    ) {
      val views = RemoteViews(context.packageName, R.layout.kojori_bus_widget)
      val currentDirection = WidgetPrefs.getDirection(context)
      val isCompact = isCompactWidget(appWidgetManager, appWidgetId)

      bindDirectionButtons(context, views, appWidgetId, currentDirection)

      val stateJson = WidgetPrefs.getStateJson(context)
      if (stateJson.isNullOrBlank()) {
        bindEmptyState(context, views, currentDirection)
        appWidgetManager.updateAppWidget(appWidgetId, views)
        return
      }

      val root = runCatching { JSONObject(stateJson) }.getOrNull()
      val snapshot = root
        ?.optJSONObject("directions")
        ?.optJSONObject(currentDirection)

      if (snapshot == null) {
        bindEmptyState(context, views, currentDirection)
        appWidgetManager.updateAppWidget(appWidgetId, views)
        return
      }

      val generatedAt = root.optLong("generatedAt", 0L)
      val stopId = snapshot.optString("stopId", "")
      val title = snapshot.optString("title", directionLabel(currentDirection))
      val stopLabel = snapshot.optString("stopLabel", "Open app to configure")
      val message = snapshot.optString("message", "")
      val items = snapshot.optJSONArray("items")

      views.setTextViewText(R.id.widget_title, title)
      views.setTextViewText(R.id.widget_stop, stopLabel)
      views.setTextViewText(R.id.widget_updated, updatedLabel(generatedAt))
      views.setTextViewText(R.id.widget_message, message)
      views.setTextColor(
        R.id.widget_message,
        if (snapshot.optString("status") == "error") {
          ContextCompat.getColor(context, R.color.widget_warning)
        } else {
          ContextCompat.getColor(context, R.color.widget_text_dim)
        },
      )

      bindOpenIntent(context, views, appWidgetId, currentDirection, stopId)
      bindRows(context, views, items, isCompact)
      appWidgetManager.updateAppWidget(appWidgetId, views)
    }

    private fun bindDirectionButtons(
      context: Context,
      views: RemoteViews,
      appWidgetId: Int,
      currentDirection: String,
    ) {
      styleDirectionButton(
        context,
        views,
        R.id.widget_toggle_kojori,
        "→ Kojori",
        currentDirection == "kojori",
        R.drawable.widget_chip_active_amber,
      )
      styleDirectionButton(
        context,
        views,
        R.id.widget_toggle_tbilisi,
        "→ Tbilisi",
        currentDirection == "tbilisi",
        R.drawable.widget_chip_active_teal,
      )

      views.setOnClickPendingIntent(
        R.id.widget_toggle_kojori,
        directionPendingIntent(context, appWidgetId, "kojori"),
      )
      views.setOnClickPendingIntent(
        R.id.widget_toggle_tbilisi,
        directionPendingIntent(context, appWidgetId, "tbilisi"),
      )
    }

    private fun styleDirectionButton(
      context: Context,
      views: RemoteViews,
      viewId: Int,
      label: String,
      isActive: Boolean,
      activeBackground: Int,
    ) {
      views.setTextViewText(viewId, label)
      views.setTextColor(
        viewId,
        if (isActive) ContextCompat.getColor(context, R.color.widget_text)
        else ContextCompat.getColor(context, R.color.widget_text_dim),
      )
      views.setInt(
        viewId,
        "setBackgroundResource",
        if (isActive) activeBackground else R.drawable.widget_chip_idle,
      )
    }

    private fun bindOpenIntent(
      context: Context,
      views: RemoteViews,
      appWidgetId: Int,
      direction: String,
      stopId: String,
    ) {
      val uri = Uri.parse("kojoribs://?widgetMode=$direction&widgetStopId=$stopId")
      val intent = Intent(Intent.ACTION_VIEW, uri).apply {
        setPackage(context.packageName)
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
      }

      val pendingIntent = PendingIntent.getActivity(
        context,
        appWidgetId + 5000,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )

      views.setOnClickPendingIntent(R.id.widget_body, pendingIntent)
    }

    private fun bindRows(
      context: Context,
      views: RemoteViews,
      items: org.json.JSONArray?,
      isCompact: Boolean,
    ) {
      val rowIds = listOf(
        Triple(R.id.widget_row_1, R.id.widget_row_bus_1, Pair(R.id.widget_row_time_1, R.id.widget_row_countdown_1)),
        Triple(R.id.widget_row_2, R.id.widget_row_bus_2, Pair(R.id.widget_row_time_2, R.id.widget_row_countdown_2)),
        Triple(R.id.widget_row_3, R.id.widget_row_bus_3, Pair(R.id.widget_row_time_3, R.id.widget_row_countdown_3)),
      )

      var visibleRows = 0

      rowIds.forEachIndexed { index, ids ->
        val item = items?.optJSONObject(index)
        val shouldShow = item != null && (!isCompact || index == 0)
        views.setViewVisibility(ids.first, if (shouldShow) View.VISIBLE else View.GONE)

        if (!shouldShow || item == null) return@forEachIndexed

        visibleRows += 1
        views.setTextViewText(ids.second, item.optString("bus", "--"))
        views.setTextViewText(ids.third.first, item.optString("time", "--:--"))

        val countdown = item.optString("countdown", "")
        val live = item.optBoolean("live", false)
        views.setTextViewText(
          ids.third.second,
          if (live && countdown.isNotBlank()) "$countdown LIVE" else countdown,
        )
        views.setTextColor(
          ids.third.second,
          if (live) ContextCompat.getColor(context, R.color.widget_live)
          else ContextCompat.getColor(context, R.color.widget_text_dim),
        )
      }

      views.setViewVisibility(R.id.widget_message, if (visibleRows == 0) View.VISIBLE else View.GONE)
    }

    private fun bindEmptyState(
      context: Context,
      views: RemoteViews,
      direction: String,
    ) {
      views.setTextViewText(R.id.widget_title, directionLabel(direction))
      views.setTextViewText(R.id.widget_stop, "Kojori Bus")
      views.setTextViewText(R.id.widget_updated, "Open app to load widget")
      views.setTextViewText(R.id.widget_message, "No widget snapshot yet")
      views.setTextColor(R.id.widget_message, ContextCompat.getColor(context, R.color.widget_text_dim))
      views.setViewVisibility(R.id.widget_row_1, View.GONE)
      views.setViewVisibility(R.id.widget_row_2, View.GONE)
      views.setViewVisibility(R.id.widget_row_3, View.GONE)
      views.setViewVisibility(R.id.widget_message, View.VISIBLE)
      bindOpenIntent(context, views, 0, direction, "")
    }

    private fun directionPendingIntent(
      context: Context,
      appWidgetId: Int,
      direction: String,
    ): PendingIntent {
      val intent = Intent(context, KojoriBusWidgetProvider::class.java).apply {
        action = ACTION_SET_DIRECTION
        putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
        putExtra(EXTRA_DIRECTION, direction)
      }

      return PendingIntent.getBroadcast(
        context,
        appWidgetId + if (direction == "kojori") 100 else 200,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }

    private fun updatedLabel(timestamp: Long): String {
      if (timestamp <= 0L) return "Updated recently"
      val formatter = SimpleDateFormat("HH:mm", Locale.UK)
      return "Updated ${formatter.format(Date(timestamp))}"
    }

    private fun directionLabel(direction: String) =
      if (direction == "tbilisi") "→ Tbilisi" else "→ Kojori"

    private fun isCompactWidget(
      appWidgetManager: AppWidgetManager,
      appWidgetId: Int,
    ): Boolean {
      val options = appWidgetManager.getAppWidgetOptions(appWidgetId)
      val minHeight = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 110)
      return minHeight < 150
    }
  }
}
