import ExpoModulesCore
import Foundation
import WidgetKit

public final class KojoriWidgetModule: Module {
  public func definition() -> ModuleDefinition {
    Name("KojoriWidget")
    AsyncFunction("syncWidgetState") { (stateJSON: String) in
      let group = Bundle.main.object(forInfoDictionaryKey: "KojoriWidgetAppGroup") as? String ?? "group.com.whekin.kojoribus.shared"
      guard let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group),
            let data = stateJSON.data(using: .utf8) else {
        throw NSError(domain: "KojoriWidget", code: 1, userInfo: [NSLocalizedDescriptionKey: "Shared widget storage is unavailable"])
      }
      try data.write(to: container.appendingPathComponent("favorites.json"), options: .atomic)
      WidgetCenter.shared.reloadAllTimelines()
    }
    Function("canPinWidget") { false }
    Function("requestPinWidget") { (_: String) in false }
    Function("hasWidgetInstalled") { false }
  }
}
