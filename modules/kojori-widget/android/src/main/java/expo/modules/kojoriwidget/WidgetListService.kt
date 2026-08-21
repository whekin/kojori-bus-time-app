package expo.modules.kojoriwidget

import android.content.Context
import android.content.Intent
import android.appwidget.AppWidgetManager
import android.view.View
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.util.Calendar
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
    // Render every departure in a rolling 24-hour window. The synced state
    // carries a full week, so the list can cross midnight without reopening
    // the app and without an arbitrary row-count cutoff.
    const val DISPLAY_WINDOW_MS = 24L * 60 * 60 * 1000
    const val WEEK_MS = 7L * 24 * 60 * 60 * 1000
    const val COUNTDOWN_HIDE_BELOW_WIDTH_DP = 180
    const val COUNTDOWN_FULL_BELOW_WIDTH_DP = 250
  }

  private enum class RowType { HEADER, DAY_HEADER, FEATURED_DEPARTURE, DEPARTURE }
  private enum class CountdownMode { HIDDEN, SHORT, FULL }
  private data class WidgetRow(
    val id: Long,
    val type: RowType,
    val label: String? = null,
    val bus: String? = null,
    val time: String? = null,
    val remainingMins: Int? = null,
    val isLastToday: Boolean = false,
  )
  private data class DepartureRow(
    val bus: String,
    val time: String,
    val remainingMins: Int,
    val departureEpochMs: Long,
    val dayKey: Int,
  )
  private data class Palette(
    val text: Int,
    val textDim: Int,
    val textFaint: Int,
    val route380: Int,
    val route316: Int,
  )

  private var direction: String = "kojori"
  private var countdownMode: CountdownMode = CountdownMode.FULL
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
    countdownMode = resolveCountdownMode()
    val label = snapshot.optString("stopLabel", "")
    stopId = snapshot.optString("stopId", "")
    val syncedAtEpochMs = snapshot.optLong("syncedAtEpochMs", 0L)
    val stopCode = stopId.substringAfter(":", stopId)
    val from = localizedString("from", "from")
    stopLabel = if (stopCode.isNotBlank()) "$from $label [#$stopCode]" else "$from $label"
    val nowMs = System.currentTimeMillis()
    val windowEndMs = nowMs + DISPLAY_WINDOW_MS
    val todayKey = localDayKey(nowMs)

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
        dayKey = localDayKey(departureEpochMs),
      )
    }
      .sortedBy { it.departureEpochMs }
      .filter { it.departureEpochMs < windowEndMs }

    val lastTodayEpochMs = departures.lastOrNull { it.dayKey == todayKey }?.departureEpochMs
    val todayLabel = localizedString("today", "Today")
    val tomorrowLabel = localizedString("tomorrow", "Tomorrow")
    rows = buildList {
      add(WidgetRow(id = 2L, type = RowType.HEADER))
      var previousDayKey: Int? = null
      departures.forEachIndexed { index, row ->
        if (row.dayKey != previousDayKey) {
          add(
            WidgetRow(
              id = -row.dayKey.toLong(),
              type = RowType.DAY_HEADER,
              label = if (row.dayKey == todayKey) todayLabel else tomorrowLabel,
            ),
          )
          previousDayKey = row.dayKey
        }
        add(
          WidgetRow(
            id = row.departureEpochMs * 10 + if (row.bus == "380") 0 else 1,
            type = if (index == 0) RowType.FEATURED_DEPARTURE else RowType.DEPARTURE,
            bus = row.bus,
            time = row.time,
            remainingMins = row.remainingMins,
            isLastToday = row.departureEpochMs == lastTodayEpochMs,
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
      RowType.DAY_HEADER -> dayHeaderRow(row)
      RowType.FEATURED_DEPARTURE -> featuredDepartureRow(row)
      RowType.DEPARTURE -> departureRow(
        row,
        position == rows.lastIndex || rows.getOrNull(position + 1)?.type == RowType.DAY_HEADER,
      )
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

  private fun dayHeaderRow(row: WidgetRow): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.widget_list_day_header)
    views.setTextViewText(R.id.day_label, row.label ?: "")
    views.setTextColor(R.id.day_label, palette.textFaint)
    return views
  }

  private fun featuredDepartureRow(row: WidgetRow): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.widget_list_featured)
    val bus = row.bus ?: "--"
    val busColor = if (bus == "380") palette.route380 else palette.route316

    views.setTextViewText(
      R.id.featured_label,
      if (row.isLastToday) {
        localizedString("lastToday", "Last bus today")
      } else {
        localizedString("nextDeparture", "Next departure")
      },
    )
    views.setTextColor(R.id.featured_label, busColor)
    views.setTextViewText(R.id.featured_bus, bus)
    views.setTextColor(R.id.featured_bus, busColor)
    views.setTextViewText(R.id.featured_countdown, featuredCountdownLabel(row.remainingMins))
    views.setTextColor(R.id.featured_countdown, palette.textDim)
    views.setTextViewText(R.id.featured_time, row.time ?: "--:--")
    views.setTextColor(R.id.featured_time, palette.text)
    views.setOnClickFillInIntent(R.id.featured_root, openAppIntent())
    return views
  }

  private fun departureRow(row: WidgetRow, isLast: Boolean): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.widget_list_item)
    val bus = row.bus ?: "--"
    val busColor = if (bus == "380") palette.route380 else palette.route316

    views.setTextViewText(R.id.item_bus, bus)
    views.setTextColor(R.id.item_bus, busColor)
    val countdown = countdownLabel(row.remainingMins)
    views.setTextViewText(R.id.item_countdown, countdown)
    views.setTextColor(R.id.item_countdown, palette.textDim)
    views.setViewVisibility(R.id.item_countdown, if (countdown.isBlank()) View.GONE else View.VISIBLE)
    views.setTextViewText(R.id.item_time, row.time ?: "--:--")
    views.setTextColor(R.id.item_time, palette.text)
    views.setTextViewText(R.id.item_last_today, localizedString("lastToday", "Last bus today"))
    views.setTextColor(R.id.item_last_today, busColor)
    views.setViewVisibility(R.id.item_last_today, if (row.isLastToday) View.VISIBLE else View.GONE)
    views.setViewVisibility(R.id.item_divider, if (isLast) View.GONE else View.VISIBLE)
    views.setOnClickFillInIntent(R.id.item_root, openAppIntent())
    return views
  }

  private fun localizedString(key: String, fallback: String): String {
    return strings?.optString(key, fallback)?.ifBlank { fallback } ?: fallback
  }

  // Very narrow widgets show only the departure time; medium widgets use a
  // compact countdown that survives long localized copy like Russian
  // "через {minutes} мин"; wide widgets show the localized label.
  private fun countdownLabel(remainingMins: Int?): String {
    if (countdownMode == CountdownMode.HIDDEN || remainingMins == null) return ""
    if (remainingMins <= 0) return localizedString("now", "now")
    return relativeLabel(remainingMins, countdownMode != CountdownMode.FULL)
  }

  private fun featuredCountdownLabel(remainingMins: Int?): String {
    if (remainingMins == null || remainingMins <= 0) return localizedString("now", "now")
    return relativeLabel(remainingMins, countdownMode != CountdownMode.FULL)
  }

  // Departures an hour or more out still get a countdown — the list spans a
  // rolling 24 hours, so hiding them left most rows without one.
  private fun relativeLabel(remainingMins: Int, compact: Boolean): String {
    if (remainingMins < 60) {
      val key = if (compact) "countdownCompactMinutes" else "inMinutes"
      val fallback = if (compact) "+{minutes}m" else "in {minutes} mins"
      return localizedString(key, fallback).replace("{minutes}", remainingMins.toString())
    }

    val hours = remainingMins / 60
    val minutes = remainingMins % 60
    val key = when {
      compact && minutes == 0 -> "countdownCompactWholeHours"
      compact -> "countdownCompactHours"
      minutes == 0 -> "countdownWholeHours"
      else -> "countdownHours"
    }
    val fallback = when {
      compact && minutes == 0 -> "{hours}h"
      compact -> "{hours}h {minutes}m"
      minutes == 0 -> "in {hours}h"
      else -> "in {hours}h {minutes}m"
    }
    return localizedString(key, fallback)
      .replace("{hours}", hours.toString())
      .replace("{minutes}", minutes.toString())
  }

  private fun localDayKey(epochMs: Long): Int {
    val calendar = Calendar.getInstance().apply { timeInMillis = epochMs }
    return calendar.get(Calendar.YEAR) * 1000 + calendar.get(Calendar.DAY_OF_YEAR)
  }

  private fun resolveCountdownMode(): CountdownMode {
    if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) return CountdownMode.FULL
    val options = AppWidgetManager.getInstance(context).getAppWidgetOptions(appWidgetId)
    val minWidth = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0)
    return when {
      minWidth <= 0 -> CountdownMode.SHORT
      minWidth in 1 until COUNTDOWN_HIDE_BELOW_WIDTH_DP -> CountdownMode.HIDDEN
      minWidth in COUNTDOWN_HIDE_BELOW_WIDTH_DP until COUNTDOWN_FULL_BELOW_WIDTH_DP -> CountdownMode.SHORT
      else -> CountdownMode.FULL
    }
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
      textFaint = ContextCompat.getColor(context, R.color.widget_text_faint),
      route380 = accents.route380,
      route316 = accents.route316,
    )
  }

  private fun defaultPalette() = readPalette(null)
}
