import SwiftUI
import AppKit
import MPVKit

struct PlaybackTrack: Identifiable {
    let id: Int
    let type: String
    let title: String
    let selected: Bool
    init?(_ value: [String: Any]) {
        guard let id = value["id"] as? Int, let type = value["type"] as? String, type == "audio" || type == "sub" else { return nil }
        self.id = id; self.type = type; selected = value["selected"] as? Bool ?? false
        let language = value["lang"] as? String ?? ""
        let name = value["title"] as? String ?? ""
        title = [name, language].filter { !$0.isEmpty }.joined(separator: " · ").isEmpty ? "Track \(id)" : [name, language].filter { !$0.isEmpty }.joined(separator: " · ")
    }
}

@MainActor final class Playback: ObservableObject, Identifiable {
    let id = UUID()
    let movie: Movie
    let start: Double
    @Published var position = 0.0
    @Published var duration = 0.0
    @Published var paused = false
    @Published var loaded = false
    @Published var buffering = false
    @Published var ended = false
    @Published var volume: Double
    @Published var muted = false
    @Published var tracks: [PlaybackTrack] = []
    @Published var error: String?
    @Published var subtitleNotice: String?
    weak var surface: MPVVideoView?
    private var subtitleTask: Task<Void, Never>?
    private var closed = false
    private var lastSaved = Date.distantPast
    private var positions: [String: ResumePosition]
    private let positionsURL: URL
    private var diagnosticFile: FileHandle?
    private var viewingActivity: NSObjectProtocol?

    init(movie: Movie, sharedPosition: ResumePosition? = nil) {
        self.movie = movie
        positionsURL = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Better Watch/resume.json")
        positions = (try? JSONDecoder().decode([String: ResumePosition].self, from: Data(contentsOf: positionsURL))) ?? [:]
        start = ResumePosition.validStart(sharedPosition)
        volume = UserDefaults.standard.object(forKey: "playbackVolume") as? Double ?? 70
        if let path = ProcessInfo.processInfo.environment["BW_PLAYBACK_DIAGNOSTICS"] {
            if !FileManager.default.fileExists(atPath:path) { FileManager.default.createFile(atPath:path, contents:nil) }
            diagnosticFile = FileHandle(forWritingAtPath:path); _ = try? diagnosticFile?.seekToEnd()
        }
    }
    func receive(_ state: [AnyHashable: Any]) {
        guard !closed else { return }
        let wasLoaded = loaded
        loaded = state["loaded"] as? Bool ?? loaded
        position = state["time-pos"] as? Double ?? position
        duration = state["duration"] as? Double ?? duration
        paused = state["pause"] as? Bool ?? paused
        buffering = state["paused-for-cache"] as? Bool ?? false
        ended = state["eof-reached"] as? Bool ?? false
        if loaded && !paused && !ended && viewingActivity == nil {
            viewingActivity = ProcessInfo.processInfo.beginActivity(options:[.idleDisplaySleepDisabled,.idleSystemSleepDisabled],reason:"Watching a film")
        } else if (paused || ended), let viewingActivity {
            ProcessInfo.processInfo.endActivity(viewingActivity); self.viewingActivity=nil
        }
        volume = state["volume"] as? Double ?? volume
        muted = state["mute"] as? Bool ?? muted
        tracks = (state["track-list"] as? [[String: Any]] ?? []).compactMap(PlaybackTrack.init)
        error = state["error"] as? String
        if loaded && !wasLoaded { loadSubtitles() }
        if loaded && Date().timeIntervalSince(lastSaved) >= 15 { save() }
        record(state)
    }
    func command(_ args: [String]) { surface?.command(args) }
    func togglePause() {
        if ended { seek(to:0); command(["set","pause","no"]) }
        else { command(["cycle","pause"]) }
        save()
        record(["action":"toggle-pause","position":position,"wasPaused":paused])
    }
    func seek(by seconds: Double) { command(["seek",String(seconds),"relative+exact"]); record(["action":"seek","delta":seconds]) }
    func seek(to seconds: Double) {
        let target=max(0,min(seconds,duration))
        command(["seek",String(target),"absolute+exact"]); record(["action":"seek-to","seconds":target])
    }
    func setVolume(_ value: Double) {
        volume = min(100,max(0,value)); command(["set","volume",String(volume)])
        UserDefaults.standard.set(volume,forKey:"playbackVolume")
    }
    func toggleMute() { command(["cycle","mute"]) }
    func select(_ track: PlaybackTrack) { command(["set",track.type == "audio" ? "aid" : "sid",String(track.id)]) }
    func subtitlesOff() { command(["set","sid","no"]) }
    private func loadSubtitles() {
        subtitleTask = Task {
            do {
                let data = try await API.data("/api/subtitles/" + movie.id)
                try Task.checkCancellation()
                guard !closed else { return }
                let object = try JSONSerialization.jsonObject(with:data) as? [String:Any]
                let external = object?["tracks"] as? [[String:String]] ?? []
                for (index,track) in external.enumerated() {
                    if let path = track["url"] { command(["sub-add",API.url(path).absoluteString,index == 0 ? "select" : "auto",track["title"] ?? "English","eng"]) }
                }
            } catch {
                if !Task.isCancelled && !closed { subtitleNotice = "Could not check external English subtitles. \(error.localizedDescription)" }
            }
        }
    }
    func retrySubtitles() { subtitleNotice = nil; subtitleTask?.cancel(); loadSubtitles() }
    private func save() {
        guard loaded, duration.isFinite, position.isFinite, duration > 0 else { return }
        positions[movie.id] = ResumePosition(seconds: ended ? 0 : min(duration, max(0, position)), duration:duration)
        SharedLibrary.shared.savePosition(movie.id, position: positions[movie.id]!)
        do {
            try FileManager.default.createDirectory(at:positionsURL.deletingLastPathComponent(),withIntermediateDirectories:true)
            try JSONEncoder().encode(positions).write(to:positionsURL,options:.atomic)
            lastSaved = Date()
        } catch { self.error = "Could not save playback position: \(error.localizedDescription)" }
    }
    func close() {
        guard !closed else { return }
        save(); closed = true; subtitleTask?.cancel(); surface?.shutdown(); surface = nil
        if let viewingActivity { ProcessInfo.processInfo.endActivity(viewingActivity); self.viewingActivity=nil }
        record(["action":"closed"]); try? diagnosticFile?.close(); diagnosticFile=nil
    }
    private func record(_ state: [AnyHashable:Any]) {
        guard let diagnosticFile else { return }
        var values = state.reduce(into:[String:Any]()) { result,pair in if let key = pair.key as? String { result[key]=pair.value } }
        values["uptime"] = ProcessInfo.processInfo.systemUptime; values["session"] = id.uuidString
        if let data = try? JSONSerialization.data(withJSONObject:values,options:.sortedKeys) { try? diagnosticFile.write(contentsOf:data + Data([10])) }
    }
}

struct MPVSurface: NSViewRepresentable {
    let playback: Playback
    func makeNSView(context: Context) -> MPVVideoView {
        let view = MPVVideoView(url:API.url("/api/stream/" + playback.movie.id).absoluteString,start:playback.start,volume:playback.volume) { [weak playback] state in
            // MPVKit delivers snapshots only on the main queue.
            MainActor.assumeIsolated { playback?.receive(state) }
        }
        playback.surface = view
        return view
    }
    func updateNSView(_ view: MPVVideoView, context: Context) {}
    static func dismantleNSView(_ view: MPVVideoView, coordinator: ()) { view.shutdown() }
}

struct FilmPlayer: View {
    @ObservedObject var playback: Playback
    let close: () -> Void
    @State private var controls = true
    @State private var showDescription = false
    @State private var showTracks = false
    @State private var hideTask: Task<Void,Never>?
    @State private var eventMonitor: Any?
    @State private var cursorHidden = false
    @State private var seeking = false
    @State private var seekPosition = 0.0
    @State private var isFullscreen = false
    var body: some View {
        ZStack {
            Color.black
            // Extend only the picture; playback controls stay clear of the window controls.
            MPVSurface(playback:playback).ignoresSafeArea()
            Color.clear.contentShape(Rectangle()).onTapGesture(count:2) { fullscreen() }.onTapGesture { playback.togglePause(); reveal() }
            if !playback.loaded || playback.buffering {
                Text(playback.loaded ? "Buffering…" : "Opening film…").padding(12).background(.black.opacity(0.8))
            }
            if let error = playback.error {
                VStack(spacing:16) { Text(error).multilineTextAlignment(.center); Button("Return to Library") { exit() } }.padding(24).background(.black.opacity(0.9))
            }
            if controls {
                VStack {
                    HStack {
                        icon("arrow.left", "Return to Library", action:exit)
                        Spacer()
                        if let description = playback.movie.description, !description.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty {
                            icon("info.circle","Movie Description") { showDescription.toggle(); reveal() }
                                .popover(isPresented:$showDescription) {
                                    ScrollView { VStack(alignment:.leading,spacing:16) { Text(playback.movie.displayTitle).font(.title2.bold()); Text(description).textSelection(.enabled).lineSpacing(5) }.padding(24).frame(width:420,alignment:.leading) }.frame(maxHeight:480)
                                }
                        }
                    }.padding(24).background(LinearGradient(colors:[.black.opacity(0.75),.clear],startPoint:.top,endPoint:.bottom))
                    Spacer()
                    VStack(spacing:10) {
                        HStack(spacing:14) {
                            Slider(value:Binding(get:{ seeking ? seekPosition : playback.position },set:{ seekPosition=$0; if !seeking { playback.seek(to:$0) } }),in:0...max(1,playback.duration),onEditingChanged:{ editing in
                                if editing { seekPosition=playback.position }
                                seeking=editing; reveal()
                                if !editing { playback.seek(to:seekPosition) }
                            }).tint(Color(red:1,green:0.35,blue:0.3)).accessibilityLabel("Playback position")
                            Text(playbackTime(max(0,playback.duration-playback.position))).font(.caption.monospacedDigit()).frame(width:60,alignment:.trailing).accessibilityLabel("Time remaining")
                        }
                        HStack(spacing:22) {
                            icon(playback.paused || playback.ended ? "play.fill" : "pause.fill",playback.paused || playback.ended ? "Play" : "Pause") { playback.togglePause(); reveal() }
                            icon("gobackward.5","Back 5 seconds") { playback.seek(by:-5); reveal() }
                            icon("goforward.5","Forward 5 seconds") { playback.seek(by:5); reveal() }
                            HStack(spacing:8) {
                                icon(playback.muted || playback.volume == 0 ? "speaker.slash.fill" : "speaker.wave.2.fill","Mute / Unmute") { playback.toggleMute(); reveal() }
                                Slider(value:Binding(get:{playback.volume},set:{playback.setVolume($0);reveal()}),in:0...100).frame(width:80).tint(.white).accessibilityLabel("Volume")
                            }
                            Spacer(minLength:4)
                            Text(playback.movie.displayTitle).font(.callout.weight(.medium)).lineLimit(1)
                            Spacer(minLength:4)
                            icon("captions.bubble","Audio and Subtitles") { showTracks.toggle(); reveal() }
                                .popover(isPresented:$showTracks) { trackPicker }
                            icon("arrow.up.left.and.arrow.down.right","Toggle Fullscreen") { fullscreen(); reveal() }
                        }
                    }.padding(24).padding(.top,28).background(LinearGradient(colors:[.clear,.black.opacity(0.9)],startPoint:.top,endPoint:.bottom))
                }
                .frame(maxWidth:.infinity,maxHeight:.infinity,alignment:.top)
                // The hidden fullscreen title bar must not push the top controls down.
                // In a normal window, keep them below the native window buttons.
                .ignoresSafeArea(.container,edges:isFullscreen ? .top : [])
            }
        }
        .foregroundStyle(.white).background(.black)
        .onContinuousHover { phase in if case .active = phase { reveal() } }
        .onAppear {
            isFullscreen = (playback.surface?.window ?? NSApp.keyWindow)?.styleMask.contains(.fullScreen) == true
            installKeys(); reveal()
        }
        .onDisappear { hideTask?.cancel(); if let eventMonitor { NSEvent.removeMonitor(eventMonitor) }; showCursor(); playback.close() }
        .onChange(of:showDescription) { _,_ in reveal() }
        .onChange(of:showTracks) { _,_ in reveal() }
        .onReceive(NotificationCenter.default.publisher(for:NSApplication.didResignActiveNotification)) { _ in showCursor() }
        .onReceive(NotificationCenter.default.publisher(for:NSWindow.didEnterFullScreenNotification)) { notification in
            if notification.object as? NSWindow === playback.surface?.window { isFullscreen = true }
        }
        .onReceive(NotificationCenter.default.publisher(for:NSWindow.didExitFullScreenNotification)) { notification in
            if notification.object as? NSWindow === playback.surface?.window { isFullscreen = false }
        }
    }
    private var trackPicker: some View {
        ScrollView {
            VStack(alignment:.leading,spacing:12) {
                Text("Audio").font(.headline)
                ForEach(playback.tracks.filter{$0.type == "audio"}) { track in trackButton(track) }
                Divider()
                Text("Subtitles").font(.headline)
                Button { playback.subtitlesOff() } label: { Label("Off",systemImage:playback.tracks.contains{$0.type == "sub" && $0.selected} ? "circle" : "checkmark.circle.fill") }.buttonStyle(.plain)
                ForEach(playback.tracks.filter{$0.type == "sub"}) { track in trackButton(track) }
                if !playback.tracks.contains(where:{$0.type == "sub"}) { Text("No subtitle tracks found").font(.caption).foregroundStyle(.secondary) }
                if let notice = playback.subtitleNotice { Text(notice).font(.caption); Button("Retry Subtitle Search") { playback.retrySubtitles() } }
            }.padding(20).frame(width:350,alignment:.leading)
        }.frame(maxHeight:430)
    }
    private func trackButton(_ track:PlaybackTrack) -> some View {
        Button { playback.select(track) } label: { Label(track.title,systemImage:track.selected ? "checkmark.circle.fill" : "circle").frame(maxWidth:.infinity,alignment:.leading) }.buttonStyle(.plain).accessibilityAddTraits(track.selected ? .isSelected : [])
    }
    private func icon(_ symbol:String,_ label:String,action:@escaping ()->Void) -> some View {
        Button(action:action) { Image(systemName:symbol).font(.system(size:22,weight:.medium)).frame(width:30,height:32).contentShape(Rectangle()) }.buttonStyle(.plain).help(label).accessibilityLabel(label)
    }
    private func reveal() {
        controls=true; showCursor(); hideTask?.cancel()
        hideTask=Task { @MainActor in
            do { try await Task.sleep(for:.seconds(3)) } catch { return }
            guard !showDescription, !showTracks, !seeking, playback.error == nil else { return }
            controls=false
            if playback.surface?.window?.isKeyWindow == true { NSCursor.hide(); cursorHidden=true }
        }
    }
    private func showCursor() { if cursorHidden { NSCursor.unhide(); cursorHidden=false } }
    private func fullscreen() { playback.surface?.window?.toggleFullScreen(nil) }
    private func exit() {
        showCursor()
        // Returning to the library preserves the user's window/fullscreen choice.
        close()
    }
    private func installKeys() {
        eventMonitor=NSEvent.addLocalMonitorForEvents(matching:[.keyDown,.mouseMoved,.leftMouseDown]) { event in
            guard event.window == playback.surface?.window else { return event }
            if event.type != .keyDown { reveal(); return event }
            if showDescription || showTracks { return event }
            guard event.modifierFlags.intersection([.command,.control,.option]).isEmpty else { return event }
            switch event.keyCode {
            case 123: playback.seek(by:-5)
            case 124: playback.seek(by:5)
            case 125: playback.setVolume(playback.volume-5)
            case 126: playback.setVolume(playback.volume+5)
            case 49: playback.togglePause()
            case 53:
                if playback.surface?.window?.styleMask.contains(.fullScreen) == true { fullscreen() } else { exit() }
            default:
                switch event.charactersIgnoringModifiers?.lowercased() {
                case "f": fullscreen()
                case "m": playback.toggleMute()
                default: return event
                }
            }
            reveal(); return nil
        }
    }
}
func playbackTime(_ seconds:Double) -> String {
    let value=Int(max(0,seconds.isFinite ? seconds : 0))
    return value >= 3600 ? String(format:"%d:%02d:%02d",value/3600,(value/60)%60,value%60) : String(format:"%d:%02d",value/60,value%60)
}
