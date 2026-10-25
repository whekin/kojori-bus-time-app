import Foundation

struct WidgetPeriod: Codable {
    let fromDay: String
    let toDay: String
    let serviceDates: [String]
    let minutes: [Int]

    func covers(weekday: Int) -> Bool {
        let days = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"]
        guard let first = days.firstIndex(of: fromDay), let last = days.firstIndex(of: toDay) else { return false }
        return first <= last ? (first...last).contains(weekday) : weekday >= first || weekday <= last
    }
}

struct WidgetStop: Codable, Identifiable {
    let id: String
    let stopId: String
    let direction: String
    let names: [String: String]
    let routes: [String: [WidgetPeriod]]

    var name: String { names[WidgetCopy.language] ?? names["en"] ?? stopId }
    var destination: String { WidgetCopy.text(direction) }
    var deepLink: URL? {
        var url = URLComponents()
        url.scheme = "kojoribs"
        url.host = ""
        url.queryItems = [
            URLQueryItem(name: "widgetMode", value: direction == "toKojori" ? "kojori" : "tbilisi"),
            URLQueryItem(name: "widgetStopId", value: stopId),
        ]
        return url.url
    }
}

struct WidgetDeparture: Identifiable {
    let date: Date
    let bus: String
    let confirmed: Bool
    var id: String { "\(bus)-\(date.timeIntervalSince1970)" }
    var time: String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_GB")
        formatter.timeZone = TimeZone(identifier: "Asia/Tbilisi")!
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: date)
    }
}

struct WidgetSchedule: Codable {
    let schemaVersion: Int
    let bakedAt: String
    let stops: [WidgetStop]

    static var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Tbilisi")!
        return calendar
    }

    static let bundled: WidgetSchedule = {
        guard let url = Bundle.main.url(forResource: "timetable", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let schedule = try? JSONDecoder().decode(WidgetSchedule.self, from: data),
              schedule.schemaVersion == 1 else {
            return WidgetSchedule(schemaVersion: 1, bakedAt: "", stops: [])
        }
        return schedule
    }()

    func departures(after now: Date, stopID: String, route: String = "all") -> [WidgetDeparture] {
        guard let stop = stops.first(where: { $0.id == stopID }) else { return [] }
        let calendar = Self.calendar
        let midnight = calendar.startOfDay(for: now)
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        var result: [WidgetDeparture] = []
        // Include yesterday for TTC service times such as 24:15.
        for offset in -1...3 {
            guard let day = calendar.date(byAdding: .day, value: offset, to: midnight) else { continue }
            let dateString = formatter.string(from: day)
            let weekday = calendar.component(.weekday, from: day) - 1
            for bus in ["380", "316"] where route == "all" || route == bus {
                let periods = stop.routes[bus] ?? []
                let exact = periods.first { $0.serviceDates.contains(dateString) }
                guard let period = exact ?? periods.first(where: { $0.covers(weekday: weekday) }) else { continue }
                for minutes in period.minutes where minutes >= 0 && minutes < 48 * 60 {
                    guard let departure = calendar.date(byAdding: .minute, value: minutes, to: day),
                          departure >= now else { continue }
                    result.append(WidgetDeparture(date: departure, bus: bus, confirmed: exact != nil))
                }
            }
        }
        return result.sorted { $0.date == $1.date ? $0.bus < $1.bus : $0.date < $1.date }
    }
}

enum WidgetCopy {
    static func resolvedLanguage(bundleLanguages: [String], systemLanguages: [String]) -> String {
        for identifier in bundleLanguages + systemLanguages {
            let language = String(identifier.prefix(2))
            if ["en", "ru", "ka"].contains(language) { return language }
        }
        return "en"
    }
    static var language: String {
        resolvedLanguage(bundleLanguages: Bundle.main.preferredLocalizations,
                         systemLanguages: Locale.preferredLanguages)
    }
    static func text(_ key: String, language: String = WidgetCopy.language) -> String {
        let values: [String: [String]] = [
            "toKojori": ["To Kojori", "В Коджори", "კოჯრისკენ"],
            "toTbilisi": ["To Tbilisi", "В Тбилиси", "თბილისისკენ"],
            "schedule": ["Timetable · Tbilisi time", "Расписание · время Тбилиси", "განრიგი · თბილისის დრო"],
            "saved": ["Saved timetable", "Сохранённое расписание", "შენახული განრიგი"],
            "empty": ["No departures", "Нет отправлений", "რეისები არ არის"],
            "tomorrow": ["Tomorrow", "Завтра", "ხვალ"],
            "later": ["Following departures", "Следующие рейсы", "შემდეგი რეისები"],
        ]
        return values[key]?[["en": 0, "ru": 1, "ka": 2][language] ?? 0] ?? key
    }
}
