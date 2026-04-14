package expo.modules.kojoriwidget

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.view.View
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import androidx.core.content.ContextCompat
import org.json.JSONObject
class WidgetListService : RemoteViewsService() {
  override fun onGetViewFactory(intent: Intent): RemoteViewsFactory {
    return WidgetListFactory(applicationContext)
  }
}

class WidgetListFactory(private val context: Context) : RemoteViewsService.RemoteViewsFactory {
  private data class DepartureRow(val bus: String, val time: String, val remainingMins: Int)
  private data class Palette(val text: Int, val textDim: Int, val route380: Int, val route316: Int)

  private var stopLabel: String = ""
  private var rows: List<DepartureRow> = emptyList()
  private var palette = defaultPalette()

  override fun onCreate() {}

  override fun onDataSetChanged() {
    val stateJson = WidgetPrefs.getStateJson(context) ?: return
    val root = runCatching { JSONObject(stateJson) }.getOrNull() ?: return
    val direction = WidgetPrefs.getDirection(context)
    val snapshot = root.optJSONObject("directions")?.optJSONObject(direction) ?: return
    val items = snapshot.optJSONArray("items") ?: return

    palette = readPalette(root)
    val label = snapshot.optString("stopLabel", "")
    val stopId = snapshot.optString("stopId", "")
    val syncedAtEpochMs = snapshot.optLong("syncedAtEpochMs", 0L)
    val stopCode = stopId.substringAfter(":", stopId)
    stopLabel = if (stopCode.isNotBlank()) "from $label [#$stopCode]" else "from $label"
    val elapsedMins = if (syncedAtEpochMs > 0L) {
      ((System.currentTimeMillis() - syncedAtEpochMs) / 60_000L).toInt().coerceAtLeast(0)
    } else {
      0
    }

    rows = (0 until items.length()).mapNotNull { i ->
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
  }

  override fun onDestroy() {
    rows = emptyList()
  }

  // Position 0 = stop header, rest = departure rows
  override fun getCount(): Int = if (rows.isEmpty()) 0 else rows.size + 1

  override fun getViewAt(position: Int): RemoteViews {
    // Header row: stop label
    if (position == 0) {
      val views = RemoteViews(context.packageName, R.layout.widget_list_header)
      views.setTextViewText(R.id.header_stop, stopLabel)
      views.setTextColor(R.id.header_stop, palette.textDim)
      return views
    }

    val row = rows[position - 1]
    val views = RemoteViews(context.packageName, R.layout.widget_list_item)
    val busColor = if (row.bus == "380") palette.route380 else palette.route316

    views.setTextViewText(R.id.item_bus, row.bus)
    views.setTextColor(R.id.item_bus, busColor)
    views.setTextViewText(R.id.item_time, row.time)
    views.setTextColor(R.id.item_time, palette.text)

    val isLast = position - 1 == rows.size - 1
    views.setViewVisibility(R.id.item_divider, if (isLast) View.GONE else View.VISIBLE)

    return views
  }

  override fun getLoadingView(): RemoteViews? = null
  override fun getViewTypeCount(): Int = 2
  override fun getItemId(position: Int): Long = position.toLong()
  override fun hasStableIds(): Boolean = false

  private fun readPalette(root: JSONObject): Palette {
    val p = root.optJSONObject("palette")
    return Palette(
      text = parseColor(p?.optString("text"), R.color.widget_text),
      textDim = parseColor(p?.optString("textDim"), R.color.widget_text_dim),
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
    route380 = ContextCompat.getColor(context, R.color.widget_amber),
    route316 = ContextCompat.getColor(context, R.color.widget_teal),
  )
}
