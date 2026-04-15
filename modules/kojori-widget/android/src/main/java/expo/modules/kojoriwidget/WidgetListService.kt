package expo.modules.kojoriwidget

import android.content.Context
import android.content.Intent
import android.appwidget.AppWidgetManager
import android.graphics.Color
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
  private enum class RowType { TITLE, TOGGLE, HEADER, DEPARTURE }
  private data class WidgetRow(
    val id: Long,
    val type: RowType,
    val bus: String? = null,
    val time: String? = null,
    val remainingMins: Int? = null,
  )
  private data class DepartureRow(val bus: String, val time: String, val remainingMins: Int)
  private data class Palette(val text: Int, val textDim: Int, val textFaint: Int, val route380: Int, val route316: Int)

  private var direction: String = "kojori"
  private var isRefreshing: Boolean = false
  private var narrow: Boolean = false
  private var stopLabel: String = ""
  private var stopId: String = ""
  private var rows: List<WidgetRow> = emptyList()
  private var palette = defaultPalette()

  override fun onCreate() {}

  override fun onDataSetChanged() {
    val stateJson = WidgetPrefs.getStateJson(context) ?: return
    val root = runCatching { JSONObject(stateJson) }.getOrNull() ?: return
    direction = WidgetPrefs.getDirection(context)
    val snapshot = root.optJSONObject("directions")?.optJSONObject(direction) ?: return
    val items = snapshot.optJSONArray("items") ?: return

    palette = readPalette(root)
    isRefreshing = WidgetPrefs.getRefreshingUntil(context) > System.currentTimeMillis()
    narrow = isNarrow()
    val label = snapshot.optString("stopLabel", "")
    stopId = snapshot.optString("stopId", "")
    val syncedAtEpochMs = snapshot.optLong("syncedAtEpochMs", 0L)
    val stopCode = stopId.substringAfter(":", stopId)
    stopLabel = if (stopCode.isNotBlank()) "from $label [#$stopCode]" else "from $label"
    val elapsedMins = if (syncedAtEpochMs > 0L) {
      ((System.currentTimeMillis() - syncedAtEpochMs) / 60_000L).toInt().coerceAtLeast(0)
    } else {
      0
    }

    val departures = (0 until items.length()).mapNotNull { i ->
      val item = items.optJSONObject(i) ?: return@mapNotNull null
      val time = item.optString("time", "--:--")
      val remainingMins = item.optInt("minsUntilAtSync", Int.MAX_VALUE) - elapsedMins
      if (remainingMins < 0) return@mapNotNull null
      DepartureRow(
        bus = item.optString("bus", "--"),
        time = time,
        remainingMins = remainingMins,
      )
    }

    rows = buildList {
      add(WidgetRow(id = 0L, type = RowType.TITLE))
      add(WidgetRow(id = 1L, type = RowType.TOGGLE))
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
      RowType.TITLE -> titleRow()
      RowType.TOGGLE -> toggleRow()
      RowType.HEADER -> headerRow()
      RowType.DEPARTURE -> departureRow(row, position == rows.lastIndex)
    }
  }

  override fun getLoadingView(): RemoteViews? = null
  override fun getViewTypeCount(): Int = RowType.entries.size
  override fun getItemId(position: Int): Long = rows[position].id
  override fun hasStableIds(): Boolean = true

  private fun titleRow(): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.widget_list_title)
    val baseCity = if (direction == "kojori") "Tbilisi" else "Kojori"
    val dotColor = if (direction == "kojori") palette.route380 else palette.route316
    views.setTextViewText(R.id.title_text, baseCity)
    views.setTextColor(R.id.title_text, palette.text)
    views.setTextColor(R.id.title_dot, dotColor)
    views.setTextColor(R.id.title_refresh_text, palette.textDim)
    views.setViewVisibility(R.id.title_refresh_spinner, if (isRefreshing) View.VISIBLE else View.GONE)
    views.setOnClickFillInIntent(R.id.title_root, openAppIntent())
    views.setOnClickFillInIntent(R.id.title_refresh, baseActionIntent(KojoriBusWidgetProvider::class.java.name).apply {
      action = "expo.modules.kojoriwidget.REFRESH"
    })
    return views
  }

  private fun toggleRow(): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.widget_list_toggle)
    views.setViewVisibility(R.id.toggle_row_h, if (narrow) View.GONE else View.VISIBLE)
    views.setViewVisibility(R.id.toggle_row_v, if (narrow) View.VISIBLE else View.GONE)

    styleToggleButton(views, R.id.toggle_kojori, "Kojori", direction == "kojori", palette.route380)
    styleToggleButton(views, R.id.toggle_tbilisi, "Tbilisi", direction == "tbilisi", palette.route316)
    styleToggleButton(views, R.id.toggle_kojori_v, "→ Kojori", direction == "kojori", palette.route380)
    styleToggleButton(views, R.id.toggle_tbilisi_v, "→ Tbilisi", direction == "tbilisi", palette.route316)

    val kojoriIntent = baseActionIntent("kojori").apply {
      action = "expo.modules.kojoriwidget.SET_DIRECTION"
      putExtra("direction", "kojori")
    }
    val tbilisiIntent = baseActionIntent("tbilisi").apply {
      action = "expo.modules.kojoriwidget.SET_DIRECTION"
      putExtra("direction", "tbilisi")
    }

    views.setOnClickFillInIntent(R.id.toggle_kojori, kojoriIntent)
    views.setOnClickFillInIntent(R.id.toggle_tbilisi, tbilisiIntent)
    views.setOnClickFillInIntent(R.id.toggle_kojori_v, kojoriIntent)
    views.setOnClickFillInIntent(R.id.toggle_tbilisi_v, tbilisiIntent)
    return views
  }

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
    views.setTextViewText(R.id.item_time, row.time ?: "--:--")
    views.setTextColor(R.id.item_time, palette.text)
    views.setViewVisibility(R.id.item_divider, if (isLast) View.GONE else View.VISIBLE)
    views.setOnClickFillInIntent(R.id.item_root, openAppIntent())
    return views
  }

  private fun styleToggleButton(
    views: RemoteViews,
    viewId: Int,
    label: String,
    isActive: Boolean,
    activeColor: Int,
  ) {
    views.setTextViewText(viewId, label)
    views.setTextColor(viewId, if (isActive) activeColor else palette.textDim)
    views.setInt(viewId, "setBackgroundResource", R.drawable.widget_chip_idle)
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

  private fun isNarrow(): Boolean {
    if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) return false
    val manager = AppWidgetManager.getInstance(context)
    val options = manager.getAppWidgetOptions(appWidgetId)
    val minWidth = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0)
    return minWidth in 1 until 180
  }

  private fun readPalette(root: JSONObject): Palette {
    val p = root.optJSONObject("palette")
    return Palette(
      text = parseColor(p?.optString("text"), R.color.widget_text),
      textDim = parseColor(p?.optString("textDim"), R.color.widget_text_dim),
      textFaint = parseColor(p?.optString("textFaint"), R.color.widget_text_faint),
      route380 = parseColor(p?.optString("route380"), R.color.widget_amber),
      route316 = parseColor(p?.optString("route316"), R.color.widget_teal),
    )
  }

  private fun parseColor(hex: String?, fallbackRes: Int): Int {
    return runCatching {
      if (hex.isNullOrBlank()) ContextCompat.getColor(context, fallbackRes) else Color.parseColor(hex)
    }.getOrElse { ContextCompat.getColor(context, fallbackRes) }
  }

  private fun defaultPalette() = Palette(
    text = ContextCompat.getColor(context, R.color.widget_text),
    textDim = ContextCompat.getColor(context, R.color.widget_text_dim),
    textFaint = ContextCompat.getColor(context, R.color.widget_text_faint),
    route380 = ContextCompat.getColor(context, R.color.widget_amber),
    route316 = ContextCompat.getColor(context, R.color.widget_teal),
  )
}
