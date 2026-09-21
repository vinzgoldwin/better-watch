import AVFoundation
import SwiftUI
import UIKit

struct MediaDescription: Decodable {
    struct Audio: Decodable, Identifiable { let id: Int; let title: String }
    struct Subtitle: Decodable, Identifiable { let id: String; let title: String; let language: String; let url: String }
    let duration: Double
    let audio: Int?
    let direct: String?
    let hls: String
    let audioTracks: [Audio]
    let subtitles: [Subtitle]
    let subtitleNotice: String?
}
struct SubtitleCue {
    let start: Double, end: Double
    let text: String
    static func parse(_ text: String) -> [SubtitleCue] {
        func seconds(_ text: String) -> Double {
            text.replacingOccurrences(of: ",", with: ".").split(separator: ":").reduce(0) { $0 * 60 + (Double($1) ?? 0) }
        }
        return text.replacingOccurrences(of: "\r", with: "").components(separatedBy: "\n\n").compactMap { block in
            let lines = block.components(separatedBy: "\n")
            guard let index = lines.firstIndex(where: { $0.contains(" --> ") }) else { return nil }
            let times = lines[index].components(separatedBy: " --> ")
            guard times.count == 2 else { return nil }
            let content = lines.dropFirst(index + 1).joined(separator: "\n").replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
                .replacingOccurrences(of: "&amp;", with: "&").replacingOccurrences(of: "&lt;", with: "<").replacingOccurrences(of: "&gt;", with: ">")
            return SubtitleCue(start: seconds(times[0]), end: seconds(times[1].components(separatedBy: " ")[0]), text: content)
        }
    }
}

@MainActor final class NativePlayback: ObservableObject, Identifiable {
    let id = UUID()
    let movie: Movie
    let player = AVPlayer()
    @Published var position = 0.0
    @Published var duration = 0.0
    @Published var paused = true
    @Published var loading = true
    @Published var error: String?
    @Published var media: MediaDescription?
    @Published var subtitle = "off"
    @Published var subtitleText = ""
    private var cues: [SubtitleCue] = []
    private var task: Task<Void, Never>?
    private var subtitleTask: Task<Void, Never>?
    private var status: NSKeyValueObservation?
    private var periodic: Any?
    private var endObserver: NSObjectProtocol?
    private var lastSaved = Date.distantPast
    private var closed = false
    private var fallback = false
    private var completed = false
    init(movie: Movie) {
        self.movie = movie
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
        try? AVAudioSession.sharedInstance().setActive(true)
        periodic = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.25, preferredTimescale: 600), queue: .main) { [weak self] time in
            MainActor.assumeIsolated {
                guard let self, !self.closed else { return }
                self.position = max(0, time.seconds.isFinite ? time.seconds : 0)
                self.subtitleText = self.cues.first { self.position >= $0.start && self.position < $0.end }?.text ?? ""
                if self.player.rate > 0 && Date().timeIntervalSince(self.lastSaved) >= 15 { self.save() }
            }
        }
        task = Task {
            do {
                try await SharedLibrary.shared.refresh()
                let data = try await API.data("/api/playback/" + movie.id)
                let media = try JSONDecoder().decode(MediaDescription.self, from: data)
                try Task.checkCancellation(); self.media = media; duration = media.duration
                if let english = media.subtitles.first(where: { ["eng", "en"].contains($0.language) }) { selectSubtitle(english.id) }
                load(media.direct ?? media.hls, start: ResumePosition.validStart(SharedLibrary.shared.positions[movie.id]), autoplay: true)
            } catch { if !Task.isCancelled { self.error = error.localizedDescription; loading = false } }
        }
    }
    private func load(_ path: String, start: Double, autoplay: Bool) {
        guard !closed else { return }
        loading = true; error = nil
        status = nil
        if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
        let item = AVPlayerItem(url: API.url(path)); item.preferredForwardBufferDuration = 20
        player.replaceCurrentItem(with: item)
        status = item.observe(\.status, options: [.initial, .new]) { [weak self] item, _ in
            Task { @MainActor in
                guard let self, !self.closed, self.player.currentItem === item else { return }
                if item.status == .readyToPlay {
                    self.player.seek(to: CMTime(seconds: start, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] _ in
                        Task { @MainActor in
                            guard let self, !self.closed, self.player.currentItem === item else { return }
                            self.loading = false
                            if autoplay { self.resume() }
                        }
                    }
                } else if item.status == .failed {
                    if !self.fallback, let media = self.media, path != media.hls {
                        self.fallback = true; self.load(media.hls, start: max(start, self.position), autoplay: autoplay)
                    } else { self.loading = false; self.error = item.error?.localizedDescription ?? "Could not play this film." }
                }
            }
        }
        endObserver = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.completed = true; self?.pause() }
        }
    }
    func pause() { player.pause(); paused = true; UIApplication.shared.isIdleTimerDisabled = false; save() }
    func resume() {
        if position >= duration - 0.5 { seek(0) }
        player.play(); paused = false; UIApplication.shared.isIdleTimerDisabled = true
    }
    func toggle() { if paused { resume() } else { pause() } }
    func seek(_ seconds: Double) {
        completed = false
        let target = max(0, min(duration, seconds)); position = target; loading = true
        player.seek(to: CMTime(seconds: target, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] finished in
            Task { @MainActor in
                guard let self, !self.closed, finished else { return }
                self.position = max(0, self.player.currentTime().seconds)
                self.loading = false; self.save()
            }
        }
    }
    func selectAudio(_ id: Int) {
        let start = position, autoplay = !paused; save()
        task?.cancel()
        task = Task {
            do {
                let data = try await API.data("/api/playback/" + movie.id + "?audio=\(id)")
                let media = try JSONDecoder().decode(MediaDescription.self, from: data)
                try Task.checkCancellation(); self.media = media; fallback = false
                load(media.direct ?? media.hls, start: start, autoplay: autoplay)
            } catch { if !Task.isCancelled { self.error = error.localizedDescription } }
        }
    }
    func selectSubtitle(_ id: String) {
        subtitle = id; cues = []; subtitleText = ""; subtitleTask?.cancel()
        guard let track = media?.subtitles.first(where: { $0.id == id }) else { return }
        subtitleTask = Task {
            do {
                let data = try await API.data(track.url)
                let parsed = SubtitleCue.parse(String(decoding: data, as: UTF8.self))
                try Task.checkCancellation(); cues = parsed
            } catch { if !Task.isCancelled { self.error = "Could not load subtitles." } }
        }
    }
    func save() {
        guard !loading, duration > 0, position.isFinite else { return }
        SharedLibrary.shared.savePosition(movie.id, position: ResumePosition(seconds: completed ? 0 : min(duration, max(0, position)), duration: duration))
        lastSaved = Date()
    }
    func close() {
        guard !closed else { return }
        pause(); closed = true; task?.cancel(); subtitleTask?.cancel(); status = nil
        if let periodic { player.removeTimeObserver(periodic); self.periodic = nil }
        if let endObserver { NotificationCenter.default.removeObserver(endObserver); self.endObserver = nil }
        player.replaceCurrentItem(with: nil)
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}

struct NativeVideoSurface: UIViewRepresentable {
    let player: AVPlayer
    final class Surface: UIView { override class var layerClass: AnyClass { AVPlayerLayer.self } }
    func makeUIView(context: Context) -> Surface { let view = Surface(); view.backgroundColor = .black; return view }
    func updateUIView(_ view: Surface, context: Context) { (view.layer as? AVPlayerLayer)?.player = player; (view.layer as? AVPlayerLayer)?.videoGravity = .resizeAspect }
}
