import Foundation

@main
enum WidgetScheduleTests {
    static func main() throws {
        assert(WidgetCopy.resolvedLanguage(bundleLanguages: ["ru"], systemLanguages: ["en-US"]) == "ru")
        assert(WidgetCopy.resolvedLanguage(bundleLanguages: ["ru_RU"], systemLanguages: ["en-US"]) == "ru")
        assert(WidgetCopy.resolvedLanguage(bundleLanguages: ["ka"], systemLanguages: ["en-US"]) == "ka")
        assert(WidgetCopy.resolvedLanguage(bundleLanguages: ["Base"], systemLanguages: ["ka-GE"]) == "ka")
        assert(WidgetCopy.resolvedLanguage(bundleLanguages: [], systemLanguages: ["de-DE"]) == "en")
        assert(WidgetCopy.text("toTbilisi", language: "ru") == "В Тбилиси")
        func date(_ value: String) -> Date { ISO8601DateFormatter().date(from: value)! }
        let weekday = WidgetPeriod(fromDay: "MONDAY", toDay: "FRIDAY", serviceDates: [], minutes: [70, 600])
        let weekend = WidgetPeriod(fromDay: "SATURDAY", toDay: "SUNDAY", serviceDates: [], minutes: [1455])
        let stop = WidgetStop(id: "test", stopId: "1:1", direction: "toKojori", names: ["en": "Test"],
                              routes: ["380": [weekday, weekend], "316": [weekday]])
        let schedule = WidgetSchedule(schemaVersion: 1, bakedAt: "", stops: [stop])
        let link = URLComponents(url: stop.deepLink!, resolvingAgainstBaseURL: false)!
        assert(link.scheme == "kojoribs")
        assert(link.queryItems?.first { $0.name == "widgetMode" }?.value == "kojori")
        assert(link.queryItems?.first { $0.name == "widgetStopId" }?.value == "1:1")
        // Sunday 23:55 in Tbilisi: yesterday's 24:15 remains a valid departure.
        let sunday = schedule.departures(after: date("2026-10-25T19:55:00Z"), stopID: "test")
        assert(sunday.first?.date == date("2026-10-25T20:15:00Z"))
        assert(sunday.first?.time == "00:15")
        assert(sunday.first?.confirmed == false)
        let justAfterMidnight = schedule.departures(after: date("2026-10-25T20:05:00Z"), stopID: "test")
        assert(justAfterMidnight.first?.date == date("2026-10-25T20:15:00Z"))

        // Monday 01:05 in Tbilisi, although UTC is still Sunday.
        let monday = schedule.departures(after: date("2026-10-25T21:05:00Z"), stopID: "test")
        assert(monday.first?.date == date("2026-10-25T21:10:00Z"))
        assert(monday.first?.time == "01:10")
        assert(monday.prefix(2).map(\.bus) == ["316", "380"])
        assert(schedule.departures(after: date("2026-10-25T21:05:00Z"), stopID: "test", route: "316")
            .allSatisfy { $0.bus == "316" })
        assert(schedule.departures(after: Date(), stopID: "unknown").isEmpty)
        assert(WidgetPeriod(fromDay: "FRIDAY", toDay: "MONDAY", serviceDates: [], minutes: []).covers(weekday: 0))
        assert(!weekday.covers(weekday: 0))

        let exact = WidgetPeriod(fromDay: "MONDAY", toDay: "FRIDAY", serviceDates: ["2026-10-26"], minutes: [75])
        let exactStop = WidgetStop(id: "exact", stopId: "1:1", direction: "toKojori", names: [:],
                                   routes: ["380": [exact, weekday]])
        let exactSchedule = WidgetSchedule(schemaVersion: 1, bakedAt: "", stops: [exactStop])
        let upcoming = exactSchedule.departures(after: date("2026-10-25T21:05:00Z"), stopID: "exact")
        assert(upcoming.first?.time == "01:15")
        assert(upcoming.first?.confirmed == true)
        let arbitraryJSON = #"{"schemaVersion":2,"bakedAt":"","stops":[{"id":"favorite-101","favoriteId":"favorite-101","stopId":"1:2949","direction":"School","names":{"en":"Krtsanisi"},"routeNames":{"route-key":"101"},"routes":{"route-key":[{"fromDay":"MONDAY","toDay":"FRIDAY","serviceDates":[],"minutes":[70]}]}}]}"#
        let arbitrary = try JSONDecoder().decode(WidgetSchedule.self, from: Data(arbitraryJSON.utf8))
        assert(arbitrary.departures(after: date("2026-10-25T21:05:00Z"), stopID: "favorite-101").first?.bus == "101")
        let favoriteLink = URLComponents(url: arbitrary.stops[0].deepLink!, resolvingAgainstBaseURL: false)!
        assert(favoriteLink.queryItems?.first { $0.name == "widgetFavoriteId" }?.value == "favorite-101")
        assert(arbitrary.resolveStop("removed-favorite") == nil)
        let gapPeriod = WidgetPeriod(fromDay: "MONDAY", toDay: "FRIDAY", serviceDates: ["2026-11-02", "2026-11-04"], minutes: [420])
        let gapStop = WidgetStop(id: "gap", stopId: "1:1", direction: "School", names: [:], routes: ["101": [gapPeriod]])
        let gapSchedule = WidgetSchedule(schemaVersion: 2, bakedAt: "", stops: [gapStop])
        assert(gapSchedule.departures(after: date("2026-11-02T20:00:00Z"), stopID: "gap").first?.date == date("2026-11-04T03:00:00Z"))
        let migratedStop = WidgetStop(id: "legacy:toKojori:1:2994", stopId: "1:2994", direction: "Kojori", names: [:], routes: [:])
        assert(WidgetSchedule(schemaVersion: 2, bakedAt: "", stops: [migratedStop]).resolveStop("toKojori:1:2994")?.id == migratedStop.id)
        // Every output JSON must decode through the same model the extension uses.
        let data = try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))
        let bundled = try JSONDecoder().decode(WidgetSchedule.self, from: data)
        assert(bundled.stops.count == 10)
        assert(!bundled.departures(after: Date(), stopID: "toKojori:1:2994").isEmpty)
        print("Widget schedule checks passed (Tbilisi timezone, midnight, weekdays, route filter, confirmed dates, bundled data).")
    }
}
