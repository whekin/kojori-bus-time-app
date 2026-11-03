package expo.modules.kojoriwidget

import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

/** Calendar evaluation is entirely local; no network access from the widget. */
internal object WidgetSchedules {
  private val days = listOf("SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY")
  private fun covers(period: JSONObject, weekday: Int): Boolean {
    val first = days.indexOf(period.optString("fromDay"))
    val last = days.indexOf(period.optString("toDay"))
    return first >= 0 && last >= 0 && if (first <= last) weekday in first..last else weekday >= first || weekday <= last
  }

  fun items(snapshot: JSONObject, now: Long): JSONArray {
    val groups = snapshot.optJSONArray("periodGroups") ?: return snapshot.optJSONArray("items") ?: JSONArray()
    val result = JSONArray()
    val midnight = Calendar.getInstance(TimeZone.getTimeZone("Asia/Tbilisi")).apply {
      timeInMillis = now
      set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
    }
    val seen = mutableSetOf<String>()
    for (offset in -1..7) {
      val day = (midnight.clone() as Calendar).apply { add(Calendar.DAY_OF_YEAR, offset) }
      val date = String.format(Locale.ROOT, "%04d-%02d-%02d", day.get(Calendar.YEAR), day.get(Calendar.MONTH) + 1, day.get(Calendar.DAY_OF_MONTH))
      val weekday = day.get(Calendar.DAY_OF_WEEK) - 1
      for (index in 0 until groups.length()) {
        val group = groups.optJSONObject(index) ?: continue
        val raw = group.optJSONArray("periods") ?: continue
        val periods = (0 until raw.length()).mapNotNull { raw.optJSONObject(it) }
        val exact = periods.firstOrNull { p ->
          val dates = p.optJSONArray("serviceDates")
          dates != null && (0 until dates.length()).any { dates.optString(it) == date }
        }
        val listedDates = periods.flatMap { p -> val dates = p.optJSONArray("serviceDates"); if (dates == null) emptyList() else (0 until dates.length()).map { dates.optString(it) } }
        val undated = periods.any { (it.optJSONArray("serviceDates")?.length() ?: 0) == 0 }
        if (exact == null && !undated && listedDates.isNotEmpty() && date <= listedDates.maxOrNull()!!) continue
        val period = exact ?: periods.firstOrNull { covers(it, weekday) } ?: continue
        val minutes = period.optJSONArray("minutes") ?: continue
        for (i in 0 until minutes.length()) {
          val value = minutes.optInt(i, -1)
          if (value !in 0 until 48 * 60) continue
          val epoch = day.timeInMillis + value * 60_000L
          val key = "${group.optString("id")}:$epoch"
          if (epoch < now || !seen.add(key)) continue
          result.put(JSONObject().put("key", key).put("routeId", group.optString("routeId"))
            .put("bus", group.optString("bus")).put("departureEpochMs", epoch)
            .put("time", String.format(Locale.ROOT, "%02d:%02d", value / 60 % 24, value % 60)))
        }
      }
    }
    return result
  }
}
