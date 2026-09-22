import SwiftUI
import AppKit

@MainActor final class AppDelegate: NSObject, NSApplicationDelegate {
    weak var store: Store?
    private var finishing = false
    func applicationShouldTerminate(_ sender:NSApplication) -> NSApplication.TerminateReply {
        guard !finishing, let store, store.phase != .stopped else { return .terminateNow }

        Task { let stopped = await store.stop(); finishing = stopped; sender.reply(toApplicationShouldTerminate:stopped) }
        return .terminateLater
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender:NSApplication) -> Bool { true }
}
@main struct BetterWatchApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @StateObject private var store = Store()
    var body: some Scene {
        Window("Better Watch", id:"library") {
            RootView().environmentObject(store).preferredColorScheme(.dark).frame(minWidth:900,minHeight:580)
                .background(WindowCloseGuard().frame(width:0,height:0))
                .onAppear { delegate.store = store }
        }.defaultSize(width:1380,height:860)
            .commands {
                CommandGroup(replacing:.newItem) {}
                CommandGroup(after:.textEditing) { Button("Search Films") { NotificationCenter.default.post(name:.init("BetterWatchSearch"),object:nil) }.keyboardShortcut("f") }
                CommandMenu("Library") {
                    Button("Connect to Library") { store.start() }.disabled(store.phase != .stopped)
                    Button("Disconnect…") { store.confirmStop = true }.disabled(store.phase != .running)
                    Divider()
                    Button("Rescan Current Folder") { store.rescan() }.disabled(store.phase != .running || store.scanning)
                    Button("Import Movie Lists…") { store.importMarks() }
                }
            }
    }
}

// Keep the library window alive when the user cancels Quit or shutdown fails.
// Forward SwiftUI's other window callbacks to its original delegate.
struct WindowCloseGuard: NSViewRepresentable {
    final class Probe: NSView {
        var attach: ((NSWindow) -> Void)?
        override func viewDidMoveToWindow() { super.viewDidMoveToWindow(); if let window { attach?(window) } }
    }
    final class Coordinator: NSObject, NSWindowDelegate {
        weak var original: NSWindowDelegate?
        func windowShouldClose(_ sender: NSWindow) -> Bool { NSApp.terminate(nil); return false }
        func window(_ window: NSWindow, willUseFullScreenPresentationOptions proposedOptions: NSApplication.PresentationOptions) -> NSApplication.PresentationOptions {
            var options = original?.window?(window, willUseFullScreenPresentationOptions: proposedOptions) ?? proposedOptions
            // Let AppKit reveal the title bar and toolbar together on top-edge hover.
            options.remove(.hideMenuBar)
            options.formUnion([.fullScreen, .autoHideMenuBar, .autoHideToolbar])
            return options
        }
        override func responds(to selector: Selector!) -> Bool { super.responds(to: selector) || (original?.responds(to: selector) ?? false) }
        override func forwardingTarget(for selector: Selector!) -> Any? { original }
    }
    func makeCoordinator() -> Coordinator { Coordinator() }
    func makeNSView(context: Context) -> Probe {
        let probe = Probe()
        probe.attach = { [weak coordinator = context.coordinator] window in
            guard let coordinator, window.delegate !== coordinator else { return }
            coordinator.original = window.delegate; window.delegate = coordinator
        }
        return probe
    }
    func updateNSView(_ view: Probe, context: Context) {}
    static func dismantleNSView(_ view: Probe, coordinator: Coordinator) { if view.window?.delegate === coordinator { view.window?.delegate = coordinator.original } }
}
