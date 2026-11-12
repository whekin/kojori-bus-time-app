import AppIntents
import SwiftUI
import WidgetKit

struct StopEntity: AppEntity {
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Favorite"
    static var defaultQuery = StopQuery()
    let id: String
    var displayRepresentation: DisplayRepresentation {
        let stop = WidgetSchedule.current.resolveStop(id)
        return DisplayRepresentation(title: "\(stop?.destination ?? id)", subtitle: "\(stop?.name ?? "")")
    }
}

struct StopQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [StopEntity] {
        identifiers.compactMap { WidgetSchedule.current.resolveStop($0) }.map { StopEntity(id: $0.id) }
    }
    func suggestedEntities() async throws -> [StopEntity] {
        WidgetSchedule.current.stops.map { StopEntity(id: $0.id) }
    }
    func defaultResult() async -> StopEntity? {
        WidgetSchedule.current.stops.first.map { StopEntity(id: $0.id) }
    }
}

enum RouteChoice: String, AppEnum {
    case all, bus380, bus316
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Routes"
    static var caseDisplayRepresentations: [RouteChoice: DisplayRepresentation] = [
        .all: "380 + 316", .bus380: "380", .bus316: "316",
    ]
    var bus: String { self == .all ? "all" : self == .bus380 ? "380" : "316" }
}

struct BusConfiguration: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Next departure"
    static var description = IntentDescription("Choose one of your favorite routes or groups.")
    @Parameter(title: "Favorite") var favorite: StopEntity?
    // Retained for widgets configured before favorite-based snapshots.
    @Parameter(title: "Stop") var stop: StopEntity?
    @Parameter(title: "Routes", default: .all) var routes: RouteChoice
    static var parameterSummary: some ParameterSummary { Summary("\(\.$favorite)") }
}

struct BusEntry: TimelineEntry {
    let date: Date
    let stop: WidgetStop?
    let departures: [WidgetDeparture]
}

struct BusProvider: AppIntentTimelineProvider {
    func entry(at date: Date, configuration: BusConfiguration) -> BusEntry {
        let schedule = WidgetSchedule.current
        let stop = schedule.resolveStop(configuration.favorite?.id ?? configuration.stop?.id)
        return BusEntry(date: date, stop: stop, departures: Array(schedule.departures(
            after: date, stopID: stop?.id ?? "", route: configuration.favorite == nil ? configuration.routes.bus : "all"
        ).prefix(16)))
    }
    func placeholder(in context: Context) -> BusEntry {
        entry(at: Date(), configuration: BusConfiguration())
    }
    func snapshot(for configuration: BusConfiguration, in context: Context) async -> BusEntry {
        entry(at: Date(), configuration: configuration)
    }
    func timeline(for configuration: BusConfiguration, in context: Context) async -> Timeline<BusEntry> {
        let now = Date()
        let schedule = WidgetSchedule.current
        let stopID = schedule.resolveStop(configuration.favorite?.id ?? configuration.stop?.id)?.id ?? ""
        let departures = schedule.departures(after: now, stopID: stopID, route: configuration.favorite == nil ? configuration.routes.bus : "all")
        let transitions = Set(departures.filter { $0.date < now.addingTimeInterval(86400) }
            .map { $0.date.addingTimeInterval(1) })
        let dates = [now] + transitions.sorted().prefix(60)
        return Timeline(entries: dates.map { entry(at: $0, configuration: configuration) },
                        policy: .after(now.addingTimeInterval(6 * 3600)))
    }
}

struct BusWidgetView: View {
    @Environment(\.widgetFamily) var family
    @Environment(\.locale) var locale
    let entry: BusEntry

    private var language: String {
        WidgetCopy.resolvedLanguage(bundleLanguages: [locale.identifier], systemLanguages: Locale.preferredLanguages)
    }
    private var stopName: String {
        entry.stop?.names[language] ?? entry.stop?.names["en"] ?? "Gzaap"
    }
    private var destination: String {
        WidgetCopy.text(entry.stop?.direction ?? "toKojori", language: language)
    }
    private var isPortrait: Bool {
        if #available(iOS 27.0, macOS 27.0, *) { return family == .systemExtraLargePortrait }
        return false
    }

    func badge(_ bus: String) -> some View {
        Text(bus).font(.system(.caption, design: .rounded, weight: .bold))
            .padding(.horizontal, 7).padding(.vertical, 3)
            .background(.tint.opacity(0.15), in: Capsule())
    }

    func nextDeparture(_ next: WidgetDeparture) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(next.time).font(.system(size: family == .systemSmall ? 32 : 38, weight: .semibold, design: .rounded))
                    .monospacedDigit().minimumScaleFactor(0.7).lineLimit(1)
                if family == .systemLarge { badge(next.bus) }
            }
            HStack(spacing: 5) {
                if family != .systemLarge { badge(next.bus) }
                Text(next.date, style: .relative).font(.caption).foregroundStyle(.secondary)
            }
            if !WidgetSchedule.calendar.isDate(next.date, inSameDayAs: entry.date) {
                Text(WidgetCopy.text("tomorrow", language: language)).font(.caption2).foregroundStyle(.secondary)
            }
        }
    }

    func followingDepartures(limit: Int) -> some View {
        VStack(spacing: 6) {
            ForEach(Array(entry.departures.dropFirst().prefix(limit))) { departure in
                HStack {
                    badge(departure.bus)
                    Text(departure.time).font(.system(.body, design: .rounded).monospacedDigit())
                    if family == .systemLarge {
                        Spacer()
                        Text(departure.date, style: .relative).font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
        }
    }

    private var compactBody: some View {
        VStack(alignment: .leading, spacing: family == .systemSmall ? 6 : 8) {
            HStack(spacing: 5) {
                Image(systemName: "bus.fill").foregroundStyle(.tint)
                Text(destination).font(.subheadline.weight(.semibold))
                Spacer(minLength: 0)
            }
            Text(stopName)
                .font(.caption).foregroundStyle(.secondary).lineLimit(1)
            if let next = entry.departures.first {
                if family == .systemMedium {
                    HStack(alignment: .top) {
                        nextDeparture(next)
                        Spacer(minLength: 8)
                        followingDepartures(limit: 3)
                    }
                } else {
                    nextDeparture(next)
                    if family == .systemLarge { followingDepartures(limit: 5) }
                }
                Spacer(minLength: 0)
                Text(WidgetCopy.text(next.confirmed ? "schedule" : "saved", language: language))
                    .font(.system(size: 9)).foregroundStyle(.secondary).lineLimit(1)
            } else {
                Spacer(minLength: 0)
                Text(WidgetCopy.text("empty", language: language)).font(.headline)
                Spacer(minLength: 0)
            }
        }
    }

    private var portraitBody: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 10) {
                Image(systemName: "bus.fill").font(.title2).foregroundStyle(.tint)
                VStack(alignment: .leading, spacing: 3) {
                    Text("Gzaap").font(.caption).foregroundStyle(.secondary)
                    Text(destination).font(.title2.weight(.bold))
                }
                Spacer(minLength: 0)
            }
            Text(stopName).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
            if let next = entry.departures.first {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        Text(next.time).font(.system(size: 64, weight: .semibold, design: .rounded))
                            .monospacedDigit().minimumScaleFactor(0.7).lineLimit(1)
                        badge(next.bus)
                    }
                    Text(next.date, style: .relative).font(.headline).foregroundStyle(.secondary)
                    if !WidgetSchedule.calendar.isDate(next.date, inSameDayAs: entry.date) {
                        Text(WidgetCopy.text("tomorrow", language: language)).font(.subheadline).foregroundStyle(.secondary)
                    }
                }
                Divider()
                Text(WidgetCopy.text("later", language: language)).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                // Read chronologically across each row, then down. Keep the
                // countdown below the time so both columns stay readable.
                LazyVGrid(columns: [GridItem(.flexible(), alignment: .leading),
                                    GridItem(.flexible(), alignment: .leading)],
                          alignment: .leading, spacing: 14) {
                    ForEach(Array(entry.departures.dropFirst().prefix(12))) { departure in
                        VStack(alignment: .leading, spacing: 5) {
                            HStack(spacing: 6) {
                                Text(departure.time)
                                    .font(.system(.title3, design: .rounded, weight: .semibold))
                                    .monospacedDigit().lineLimit(1).minimumScaleFactor(0.8)
                                    .layoutPriority(1)
                                badge(departure.bus)
                            }
                            Text(departure.date, style: .relative)
                                .font(.caption).foregroundStyle(.secondary)
                                .lineLimit(1).minimumScaleFactor(0.8)
                            Divider()
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                Spacer(minLength: 0)
                Text(WidgetCopy.text(next.confirmed ? "schedule" : "saved", language: language))
                    .font(.caption2).foregroundStyle(.secondary)
            } else {
                Spacer()
                Text(WidgetCopy.text("empty", language: language)).font(.headline)
                Spacer()
            }
        }
    }

    var body: some View {
        Group {
            if isPortrait { portraitBody } else { compactBody }
        }
        .containerBackground(.background, for: .widget)
        .widgetURL(entry.stop?.deepLink ?? URL(string: "kojoribs://"))
    }
}

@main
struct KojoriBusWidget: Widget {
    private var families: [WidgetFamily] {
        var families: [WidgetFamily] = [.systemSmall, .systemMedium, .systemLarge]
        if #available(iOS 27.0, macOS 27.0, *) { families.append(.systemExtraLargePortrait) }
        return families
    }
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "KojoriBusWidget", intent: BusConfiguration.self, provider: BusProvider()) { entry in
            BusWidgetView(entry: entry)
        }
        .configurationDisplayName("Gzaap")
        .description("Next departure")
        .supportedFamilies(families)
    }
}
