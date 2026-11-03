package expo.modules.kojoriwidget

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.time.Instant

class WidgetSchedulesTest {
  @Test fun missingDatesInsideAnExplicitCalendarDoNotCreateTrips() {
    val snapshot = JSONObject("""{"periodGroups":[{"id":"gap","routeId":"route","bus":"101","periods":[{"fromDay":"MONDAY","toDay":"FRIDAY","serviceDates":["2026-11-02","2026-11-04"],"minutes":[420]}]}]}""")
    val now = time("2026-11-02T20:00:00Z")
    val items = WidgetSchedules.items(snapshot, now)
    val first = (0 until items.length()).map { items.getJSONObject(it).getLong("departureEpochMs") }.minOrNull()
    assertEquals(time("2026-11-04T03:00:00Z"), first)
  }
  private fun time(value: String) = Instant.parse(value).toEpochMilli()
  private fun snapshot(): JSONObject = JSONObject("""{
    "periodGroups":[{"id":"route-101","routeId":"1:R216088","bus":"101","periods":[
      {"fromDay":"MONDAY","toDay":"FRIDAY","serviceDates":[],"minutes":[420]},
      {"fromDay":"SATURDAY","toDay":"SUNDAY","serviceDates":[],"minutes":[1455]}
    ]}]
  }""")

  @Test fun arbitraryRouteUsesTbilisiCalendarAcrossMidnight() {
    val now = time("2026-11-01T19:55:00Z") // Sunday 23:55 in Tbilisi.
    val items = WidgetSchedules.items(snapshot(), now)
    val sorted = (0 until items.length()).map { items.getJSONObject(it) }.sortedBy { it.getLong("departureEpochMs") }
    assertEquals("101", sorted.first().getString("bus"))
    assertEquals("00:15", sorted.first().getString("time"))
    assertEquals(time("2026-11-01T20:15:00Z"), sorted.first().getLong("departureEpochMs"))
    assertEquals(time("2026-11-02T03:00:00Z"), sorted[1].getLong("departureEpochMs"))
  }

  @Test fun exactServiceDatesOverrideTheWeekdayFallback() {
    val snapshot = snapshot()
    val periods = snapshot.getJSONArray("periodGroups").getJSONObject(0).getJSONArray("periods")
    periods.put(0, JSONObject("""{"fromDay":"MONDAY","toDay":"FRIDAY","serviceDates":["2026-11-02"],"minutes":[480]}"""))
    val now = time("2026-11-02T02:00:00Z")
    val items = WidgetSchedules.items(snapshot, now)
    assertEquals(time("2026-11-02T04:00:00Z"), items.getJSONObject(0).getLong("departureEpochMs"))
  }

  @Test fun supportsManyRoutesAndExplicitlyEmptyFavorites() {
    val snapshot = snapshot()
    val group = snapshot.getJSONArray("periodGroups").getJSONObject(0)
    val groups = JSONArray()
    for (index in 0 until 12) groups.put(JSONObject(group.toString()).put("id", "route-$index").put("bus", (300 + index).toString()))
    snapshot.put("periodGroups", groups)
    val now = time("2026-11-02T02:00:00Z")
    val items = WidgetSchedules.items(snapshot, now)
    val firstRun = (0 until items.length()).map { items.getJSONObject(it) }.filter { it.getLong("departureEpochMs") == time("2026-11-02T03:00:00Z") }
    assertEquals(12, firstRun.map { it.getString("bus") }.toSet().size)
    snapshot.put("periodGroups", JSONArray()).put("items", JSONArray().put(JSONObject().put("bus", "old")))
    assertEquals(0, WidgetSchedules.items(snapshot, now).length())
  }

  @Test fun readsLegacyVersionTwoItemsWithoutRequiringFavoritePeriods() {
    val items = JSONArray().put(JSONObject().put("bus", "380"))
    assertSame(items, WidgetSchedules.items(JSONObject().put("items", items), 0))
  }
}
