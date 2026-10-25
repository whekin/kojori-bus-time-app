import AppIntents
import SwiftUI
import WidgetKit

struct StopEntity: AppEntity {
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Stop"
    static var defaultQuery = StopQuery()
    let id: String
    var displayRepresentation: DisplayRepresentation {
        let stop = WidgetSchedule.bundled.stops.first { $0.id == id }
        return DisplayRepresentation(title: "\(stop?.name ?? id)", subtitle: "\(stop?.destination ?? "")")
    }
}

struct StopQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [StopEntity] {
        WidgetSchedule.bundled.stops.filter { identifiers.contains($0.id) }.map { StopEntity(id: $0.id) }
    }
    func suggestedEntities() async throws -> [StopEntity] {
        WidgetSchedule.bundled.stops.map { StopEntity(id: $0.id) }
    }
    func defaultResult() async -> StopEntity? {
        WidgetSchedule.bundled.stops.first.map { StopEntity(id: $0.id) }
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
    static var title: LocalizedStringResource = "Next bus"
    static var description = IntentDescription("Choose a boarding stop and bus routes.")
    @Parameter(title: "Stop") var stop: StopEntity?
    @Parameter(title: "Routes", default: .all) var routes: RouteChoice
}

struct BusEntry: TimelineEntry {
    let date: Date
    let stop: WidgetStop?
    let departures: [WidgetDeparture]
}

struct BusProvider: AppIntentTimelineProvider {
    func entry(at date: Date, configuration: BusConfiguration) -> BusEntry {
        let schedule = WidgetSchedule.bundled
        let stop = schedule.stops.first { $0.id == configuration.stop?.id } ?? schedule.stops.first
        return BusEntry(date: date, stop: stop, departures: Array(schedule.departures(
            after: date, stopID: stop?.id ?? "", route: configuration.routes.bus
        ).prefix(8)))
    }
    func placeholder(in context: Context) -> BusEntry {
        entry(at: Date(), configuration: BusConfiguration())
    }
    func snapshot(for configuration: BusConfiguration, in context: Context) async -> BusEntry {
        entry(at: Date(), configuration: configuration)
    }
    func timeline(for configuration: BusConfiguration, in context: Context) async -> Timeline<BusEntry> {
        let now = Date()
        let schedule = WidgetSchedule.bundled
        let stopID = configuration.stop?.id ?? schedule.stops.first?.id ?? ""
        let departures = schedule.departures(after: now, stopID: stopID, route: configuration.routes.bus)
        let transitions = Set(departures.filter { $0.date < now.addingTimeInterval(86400) }
            .map { $0.date.addingTimeInterval(1) })
        let dates = [now] + transitions.sorted().prefix(60)
        return Timeline(entries: dates.map { entry(at: $0, configuration: configuration) },
                        policy: .after(now.addingTimeInterval(6 * 3600)))
    }
}

struct BusWidgetView: View {
    @Environment(\.widgetFamily) var family
    let entry: BusEntry

    func badge(_ bus: String) -> some View {
        Text(bus).font(.system(.caption, design: .rounded, weight: .bold))
            .padding(.horizontal, 7).padding(.vertical, 3)
            .background(.tint.opacity(0.15), in: Capsule())
    }

    var body: some View {
        VStack(alignment: .leading, spacing: family == .systemSmall ? 6 : 8) {
            HStack(spacing: 5) {
                Image(systemName: "bus.fill").foregroundStyle(.tint)
                Text(entry.stop?.destination ?? "Kojoring Time").font(.subheadline.weight(.semibold))
                Spacer(minLength: 0)
            }
            Text(entry.stop?.name ?? "Kojoring Time")
                .font(.caption).foregroundStyle(.secondary).lineLimit(1)
            if let next = entry.departures.first {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(next.time).font(.system(size: family == .systemSmall ? 32 : 38, weight: .semibold, design: .rounded))
                        .monospacedDigit().minimumScaleFactor(0.7).lineLimit(1)
                    if family != .systemSmall { badge(next.bus) }
                }
                HStack {
                    if family == .systemSmall { badge(next.bus) }
                    Text(next.date, style: .relative).font(.caption).foregroundStyle(.secondary)
                    if !WidgetSchedule.calendar.isDate(next.date, inSameDayAs: entry.date) {
                        Text(WidgetCopy.text("tomorrow")).font(.caption2).foregroundStyle(.secondary)
                    }
                }
                if family != .systemSmall {
                    ForEach(Array(entry.departures.dropFirst().prefix(family == .systemLarge ? 5 : 1))) { departure in
                        HStack {
                            badge(departure.bus)
                            Text(departure.time).font(.system(.body, design: .rounded).monospacedDigit())
                            Spacer()
                            Text(departure.date, style: .relative).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
                Spacer(minLength: 0)
                Text(WidgetCopy.text(next.confirmed ? "schedule" : "saved"))
                    .font(.system(size: 9)).foregroundStyle(.secondary).lineLimit(1)
            } else {
                Spacer(minLength: 0)
                Text(WidgetCopy.text("empty")).font(.headline)
                Spacer(minLength: 0)
            }
        }
        .containerBackground(.background, for: .widget)
        .widgetURL(URL(string: "kojoribs://"))
    }
}

@main
struct KojoriBusWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "KojoriBusWidget", intent: BusConfiguration.self, provider: BusProvider()) { entry in
            BusWidgetView(entry: entry)
        }
        .configurationDisplayName("Kojoring Time")
        .description("Next bus")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}
