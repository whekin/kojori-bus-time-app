package expo.modules.kojoriwidget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
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

    private data class WidgetPalette(
      val text: Int,
      val textDim: Int,
      val textFaint: Int,
      val primary: Int,
      val route380: Int,
      val route316: Int,
    )

    fun refreshAll(context: Context) {
      val appWidgetManager = AppWidgetManager.getInstance(context)
      val component = ComponentName(context, KojoriBusWidgetProvider::class.java)
      val appWidgetIds = appWidgetManager.getAppWidgetIds(component)
      // Notify the list adapter to reload data
      appWidgetManager.notifyAppWidgetViewDataChanged(appWidgetIds, R.id.widget_list)
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
      val stateJson = WidgetPrefs.getStateJson(context)
      val root = stateJson?.let { runCatching { JSONObject(it) }.getOrNull() }
      val palette = readPalette(context, root)

      bindDirectionButtons(views, appWidgetId, currentDirection, context, palette)

      // Set up the ListView with RemoteViewsService
      val listIntent = Intent(context, WidgetListService::class.java).apply {
        putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
        data = Uri.parse(toUri(Intent.URI_INTENT_SCHEME))
      }
      views.setRemoteAdapter(R.id.widget_list, listIntent)

      if (stateJson.isNullOrBlank()) {
        bindEmptyState(context, views, currentDirection, palette)
        appWidgetManager.updateAppWidget(appWidgetId, views)
        return
      }

      val snapshot = root
        ?.optJSONObject("directions")
        ?.optJSONObject(currentDirection)

      if (snapshot == null) {
        bindEmptyState(context, views, currentDirection, palette)
        appWidgetManager.updateAppWidget(appWidgetId, views)
        return
      }

      val generatedAt = root.optLong("generatedAt", 0L)
      val stopId = snapshot.optString("stopId", "")
      val title = snapshot.optString("title", directionLabel(currentDirection))
      val stopLabel = snapshot.optString("stopLabel", "Open app to configure")
      val message = snapshot.optString("message", "")
      val items = snapshot.optJSONArray("items")
      val hasItems = items != null && items.length() > 0

      views.setTextViewText(R.id.widget_title, title)
      views.setTextViewText(R.id.widget_stop, stopLabel)
      views.setTextViewText(R.id.widget_updated, updatedLabel(generatedAt))
      views.setTextViewText(R.id.widget_message, message)
      views.setTextColor(R.id.widget_title, palette.text)
      views.setTextColor(R.id.widget_stop, palette.textDim)
      views.setTextColor(R.id.widget_updated, palette.textFaint)
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

      bindOpenIntent(context, views, appWidgetId, currentDirection, stopId)
      appWidgetManager.updateAppWidget(appWidgetId, views)
    }

    private fun bindDirectionButtons(
      views: RemoteViews,
      appWidgetId: Int,
      currentDirection: String,
      context: Context,
      palette: WidgetPalette,
    ) {
      styleDirectionButton(
        views,
        R.id.widget_toggle_kojori,
        "→ Kojori",
        currentDirection == "kojori",
        palette.route380,
        palette.textDim,
      )
      styleDirectionButton(
        views,
        R.id.widget_toggle_tbilisi,
        "→ Tbilisi",
        currentDirection == "tbilisi",
        palette.route316,
        palette.textDim,
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
      views: RemoteViews,
      viewId: Int,
      label: String,
      isActive: Boolean,
      activeColor: Int,
      idleColor: Int,
    ) {
      views.setTextViewText(viewId, label)
      views.setTextColor(viewId, if (isActive) activeColor else idleColor)
      views.setInt(viewId, "setBackgroundResource", R.drawable.widget_chip_idle)
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

    private fun bindEmptyState(
      context: Context,
      views: RemoteViews,
      direction: String,
      palette: WidgetPalette,
    ) {
      views.setTextViewText(R.id.widget_title, directionLabel(direction))
      views.setTextViewText(R.id.widget_stop, "Kojori Bus")
      views.setTextViewText(R.id.widget_updated, "Open app to load widget")
      views.setTextViewText(R.id.widget_message, "No widget snapshot yet")
      views.setTextColor(R.id.widget_title, palette.text)
      views.setTextColor(R.id.widget_stop, palette.textDim)
      views.setTextColor(R.id.widget_updated, palette.textFaint)
      views.setTextColor(R.id.widget_message, palette.textDim)
      views.setViewVisibility(R.id.widget_list, View.GONE)
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

    private fun readPalette(context: Context, root: JSONObject?): WidgetPalette {
      val paletteJson = root?.optJSONObject("palette")
      return WidgetPalette(
        text = colorOrDefault(context, paletteJson?.optString("text"), R.color.widget_text),
        textDim = colorOrDefault(context, paletteJson?.optString("textDim"), R.color.widget_text_dim),
        textFaint = colorOrDefault(context, paletteJson?.optString("textFaint"), R.color.widget_text_faint),
        primary = colorOrDefault(context, paletteJson?.optString("primary"), R.color.widget_text),
        route380 = colorOrDefault(context, paletteJson?.optString("route380"), R.color.widget_amber),
        route316 = colorOrDefault(context, paletteJson?.optString("route316"), R.color.widget_teal),
      )
    }

    private fun colorOrDefault(context: Context, hex: String?, defaultRes: Int): Int {
      return runCatching {
        if (hex.isNullOrBlank()) ContextCompat.getColor(context, defaultRes) else Color.parseColor(hex)
      }.getOrElse {
        ContextCompat.getColor(context, defaultRes)
      }
    }
  }
}
