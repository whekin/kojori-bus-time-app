package expo.modules.kojoriwidget

import android.content.Context
import android.content.Intent
import android.appwidget.AppWidgetManager
import android.view.View
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import androidx.core.content.ContextCompat
import org.json.JSONObject
class WidgetListService : RemoteViewsService() {
  override fun onGetViewFactory(intent: Intent): RemoteViewsFactory {
    return WidgetListFactory(
      applicationContext,
      intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID),
    )
  }
}

class WidgetListFactory(
  private val context: Context,
  private val appWidgetId: Int,
) : RemoteViewsService.RemoteViewsFactory {
  private companion object {
    // The synced state carries up to a week of departures; only render the next few.
    const val MAX_VISIBLE_DEPARTURES = 24
    const val WEEK_MS = 7L * 24 * 60 * 60 * 1000
  }

  private enum class RowType { HEADER, DEPARTURE }
  private data class WidgetRow(
    val id: Long,
    val type: RowType,
    val bus: String? = null,
    val time: String? = null,
    val remainingMins: Int? = null,
  )
  private data class DepartureRow(
    val bus: String,
    val time: String,
    val remainingMins: Int,
    val departureEpochMs: Long,
  )
  private data class Palette(val text: Int, val textDim: Int, val route380: Int, val route316: Int)

  private var direction: String = "kojori"
  private var narrow: Boolean = false
  private var stopLabel: String = ""
  private var stopId: String = ""
  private var rows: List<WidgetRow> = emptyList()
  private var palette = defaultPalette()
  private var strings: JSONObject? = null

  override fun onCreate() {}

  override fun onDataSetChanged() {
    rows = emptyList()
    stopId = ""
    stopLabel = ""
    val stateJson = WidgetPrefs.getStateJson(context) ?: return
    val root = runCatching { JSONObject(stateJson) }.getOrNull() ?: return
    if (!isSupportedWidgetState(root)) return
    strings = root.optJSONObject("strings")
    direction = WidgetPrefs.getDirection(context)
    val snapshot = root.optJSONObject("directions")?.optJSONObject(direction) ?: return
    val items = snapshot.optJSONArray("items") ?: return

    palette = readPalette(root)
    narrow = isNarrow()
    val label = snapshot.optString("stopLabel", "")
    stopId = snapshot.optString("stopId", "")
    val syncedAtEpochMs = snapshot.optLong("syncedAtEpochMs", 0L)
    val stopCode = stopId.substringAfter(":", stopId)
    val from = localizedString("from", "from")
    stopLabel = if (stopCode.isNotBlank()) "$from $label [#$stopCode]" else "$from $label"
    val nowMs = System.currentTimeMillis()

    val departures = (0 until items.length()).mapNotNull { i ->
      val item = items.optJSONObject(i) ?: return@mapNotNull null
      val time = item.optString("time", "--:--")
      var departureEpochMs = item.optLong("departureEpochMs", 0L)
      if (departureEpochMs <= 0L && syncedAtEpochMs > 0L && item.has("minsUntilAtSync")) {
        departureEpochMs = syncedAtEpochMs + item.optInt("minsUntilAtSync", 0) * 60_000L
      }
      if (departureEpochMs <= 0L) return@mapNotNull null
      // The synced items cover a full week and the timetable repeats weekly
      // (Georgia has no DST), so past departures are projected forward to
      // their next weekly occurrence instead of expiring.
      if (departureEpochMs < nowMs) {
        val weeksBehind = Math.floorDiv(nowMs - departureEpochMs, WEEK_MS) + 1
        departureEpochMs += weeksBehind * WEEK_MS
      }
      DepartureRow(
        bus = item.optString("bus", "--"),
        time = time,
        remainingMins = Math.floorDiv(departureEpochMs - nowMs, 60_000L).toInt(),
        departureEpochMs = departureEpochMs,
      )
    }
      .sortedBy { it.departureEpochMs }
      .take(MAX_VISIBLE_DEPARTURES)

    rows = buildList {
      add(WidgetRow(id = 2L, type = RowType.HEADER))
      departures.forEachIndexed { index, row ->
        add(
          WidgetRow(
            id = 10L + index,
            type = RowType.DEPARTURE,
            bus = row.bus,
            time = row.time,
            remainingMins = row.remainingMins,
          ),
        )
      }
    }
  }

  override fun onDestroy() {
    rows = emptyList()
  }

  override fun getCount(): Int = rows.size

  override fun getViewAt(position: Int): RemoteViews {
    val row = rows[position]
    return when (row.type) {
      RowType.HEADER -> headerRow()
      RowType.DEPARTURE -> departureRow(row, position == rows.lastIndex)
    }
  }

  override fun getLoadingView(): RemoteViews? = null
  override fun getViewTypeCount(): Int = RowType.entries.size
  override fun getItemId(position: Int): Long = rows[position].id
  override fun hasStableIds(): Boolean = true

  private fun headerRow(): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.widget_list_header)
    views.setTextViewText(R.id.header_stop, stopLabel)
    views.setTextColor(R.id.header_stop, palette.textDim)
    views.setOnClickFillInIntent(R.id.header_stop, openAppIntent())
    return views
  }

  private fun departureRow(row: WidgetRow, isLast: Boolean): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.widget_list_item)
    val bus = row.bus ?: "--"
    val busColor = if (bus == "380") palette.route380 else palette.route316

    views.setTextViewText(R.id.item_bus, bus)
    views.setTextColor(R.id.item_bus, busColor)
    views.setTextViewText(R.id.item_countdown, countdownLabel(row.remainingMins))
    views.setTextColor(R.id.item_countdown, palette.textDim)
    views.setTextViewText(R.id.item_time, row.time ?: "--:--")
    views.setTextColor(R.id.item_time, palette.text)
    views.setViewVisibility(R.id.item_divider, if (isLast) View.GONE else View.VISIBLE)
    views.setOnClickFillInIntent(R.id.item_root, openAppIntent())
    return views
  }

  private fun localizedString(key: String, fallback: String): String {
    return strings?.optString(key, fallback)?.ifBlank { fallback } ?: fallback
  }

  // Narrow widgets show only the departure time; wide ones add a relative
  // countdown for departures within the next hour.
  private fun countdownLabel(remainingMins: Int?): String {
    if (narrow || remainingMins == null || remainingMins >= 60) return ""
    if (remainingMins <= 0) return localizedString("now", "now")
    return localizedString("inMinutes", "in {minutes} mins")
      .replace("{minutes}", remainingMins.toString())
  }

  private fun isNarrow(): Boolean {
    if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) return false
    val options = AppWidgetManager.getInstance(context).getAppWidgetOptions(appWidgetId)
    val minWidth = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0)
    return minWidth in 1 until 180
  }

  private fun openAppIntent() = baseActionIntent(stopId).apply {
    action = "expo.modules.kojoriwidget.OPEN_APP"
    putExtra("direction", direction)
    putExtra("stop_id", stopId)
  }

  private fun baseActionIntent(seed: String): Intent {
    return Intent().apply {
      putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
      putExtra("action_token", WidgetPrefs.getActionToken(context))
      data = android.net.Uri.parse("kojoriwidget://$seed/$appWidgetId")
    }
  }

  private fun readPalette(root: JSONObject?): Palette {
    val accents = WidgetTheme.accents(context, root)
    return Palette(
      text = ContextCompat.getColor(context, R.color.widget_text),
      textDim = ContextCompat.getColor(context, R.color.widget_text_dim),
      route380 = accents.route380,
      route316 = accents.route316,
    )
  }

  private fun defaultPalette() = readPalette(null)
}
