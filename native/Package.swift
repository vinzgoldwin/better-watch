// swift-tools-version: 6.0
import PackageDescription
import Foundation
let mpvLibraries = ProcessInfo.processInfo.environment["MPV_LIBRARY_DIR"] ?? "/Applications/IINA.app/Contents/Frameworks"
let package = Package(name: "BetterWatch", platforms: [.macOS(.v14)], products: [.executable(name: "BetterWatch", targets: ["BetterWatch"])], targets: [
    .target(name: "MPVKit", publicHeadersPath: "include", cSettings: [.unsafeFlags(["-fobjc-arc"])], linkerSettings: [.unsafeFlags(["-L", mpvLibraries, "-Xlinker", "-rpath", "-Xlinker", mpvLibraries]), .linkedLibrary("mpv.2"), .linkedFramework("OpenGL"), .linkedFramework("AppKit")]),
    .executableTarget(name: "BetterWatch", dependencies: ["MPVKit"]),
    .testTarget(name: "BetterWatchTests", dependencies: ["BetterWatch"])
], swiftLanguageModes: [.v5])
