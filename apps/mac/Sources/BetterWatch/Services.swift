import AppKit
import AVFoundation
import ImageIO

struct ServiceError: LocalizedError { let message: String; var errorDescription: String? { message } }
enum API {
    static let base = URL(string: "http://127.0.0.1:3000")!
    // Media stays on the HDD. Native networking uses no on-disk URL cache.
    static let session: URLSession = {
        let c = URLSessionConfiguration.ephemeral
        c.urlCache = nil; c.httpMaximumConnectionsPerHost = 4
        c.timeoutIntervalForRequest = 90
        return URLSession(configuration: c)
    }()
    static func url(_ path: String) -> URL { URL(string: path, relativeTo: base)!.absoluteURL }
    static func data(_ path: String, body: [String: Any]? = nil, method: String? = nil) async throws -> Data {
        var r = URLRequest(url: url(path)); r.httpMethod = method ?? (body == nil ? "GET" : "POST")
        if let body { r.httpBody = try JSONSerialization.data(withJSONObject: body); r.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        let (data, response) = try await session.data(for: r)
        guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode) else {
            let message = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
            throw ServiceError(message: message ?? "The library could not complete this request. Check the connection and try again.")
        }
        return data
    }
}
// Process work never blocks the main actor. Commands are fixed, not assembled from library metadata.
enum Remote {
    static func run(_ arguments: [String], executable: String = "/usr/bin/ssh") async throws {
        try await Task.detached(priority: .userInitiated) {
            let process = Process(); process.executableURL = URL(fileURLWithPath: executable); process.arguments = arguments
            let pipe = Pipe(); process.standardOutput = pipe; process.standardError = pipe
            try process.run()
            let output = pipe.fileHandleForReading.readDataToEndOfFile()
            process.waitUntilExit()
            guard process.terminationStatus == 0 else { throw ServiceError(message: String(data: output, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "Could not contact M1-asahi.") }
        }.value
    }
    static func start() async throws {
        guard let script = Bundle.main.url(forResource: "launch-mac", withExtension: "sh") else { throw ServiceError(message: "The launcher is missing. Reinstall Better Watch.") }
        try await run([script.path, "--check"], executable: "/bin/bash")
    }
    static func stop() async throws {
        // Disconnect only this Mac. The shared server also serves iPad and Android.
        try? await run(["-S", NSHomeDirectory() + "/.ssh/better-watch-tunnel", "-O", "exit", "asahi-codex"])
    }
}
actor Covers {
    static let shared = Covers()
    private let cache = NSCache<NSString, NSImage>()
    init() { cache.totalCostLimit = 48 * 1024 * 1024; cache.countLimit = 160 }
    func image(_ path: String) async throws -> NSImage {
        if let hit = cache.object(forKey: path as NSString) { return hit }
        let data: Data
        var strip = false
        do { data = try await API.data(path + "?quality=cover&width=480") }
        catch {
            try Task.checkCancellation()
            // A cached strip still gives an identifiable cover when a source is unavailable.
            data = try await API.data(path); strip = true
        }
        try Task.checkCancellation()
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let decoded = CGImageSourceCreateThumbnailAtIndex(source, 0, [kCGImageSourceCreateThumbnailFromImageAlways:true, kCGImageSourceThumbnailMaxPixelSize:strip ? 1440 : 480, kCGImageSourceCreateThumbnailWithTransform:true, kCGImageSourceShouldCacheImmediately:true] as CFDictionary) else { throw ServiceError(message: "Cover unavailable") }
        let frameWidth = min(decoded.width, Int(Double(decoded.height) * 16 / 9))
        let cg = strip ? (decoded.cropping(to: CGRect(x:0,y:0,width:frameWidth,height:decoded.height)) ?? decoded) : decoded
        let image = NSImage(cgImage: cg, size: NSSize(width: cg.width, height: cg.height))
        cache.setObject(image, forKey: path as NSString, cost: cg.bytesPerRow * cg.height)
        return image
    }
    func clear() { cache.removeAllObjects() }
}
@MainActor final class Preview: ObservableObject {
    @Published var player: AVPlayer?
    @Published var loading = false
    @Published var error: String?
    @Published var moment = 0
    @Published var ended = false
    private var task: Task<Void, Never>?
    private var observer: NSObjectProtocol?
    private var statusObservation: NSKeyValueObservation?
    private var generation = UUID()
    func load(_ movie: Movie, moment next: Int) {
        stop(); moment = (next + 3) % 3; loading = true; error = nil; ended = false
        let token = generation
        task = Task {
            do {
                let data = try await API.data("/api/preview", body: ["id":movie.id,"moment":moment])
                try Task.checkCancellation()
                let object = try JSONSerialization.jsonObject(with: data) as? [String: String]
                guard let path = object?["preview"], generation == token else { return }
                let item = AVPlayerItem(url: API.url(path)); item.preferredForwardBufferDuration = 6
                let p = AVPlayer(playerItem: item); p.volume = 0.4; p.actionAtItemEnd = .pause
                player = p
                statusObservation = item.observe(\.status, options: [.initial, .new]) { [weak self] item, _ in
                    let status = item.status
                    Task { @MainActor [weak self] in
                        guard let self, self.generation == token else { return }
                        if status == .readyToPlay { self.loading = false }
                        if status == .failed { self.loading = false; self.error = "Could not play this preview. Try again." }
                    }
                }
                observer = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { [weak self] _ in
                    Task { @MainActor [weak self] in if self?.generation == token { self?.ended = true } }
                }
                p.play()
            } catch { if !Task.isCancelled && generation == token { self.error = error.localizedDescription; loading = false } }
        }
    }
    func stop() {
        generation = UUID(); task?.cancel(); task = nil
        player?.pause(); player?.replaceCurrentItem(with: nil); player = nil
        statusObservation = nil
        if let observer { NotificationCenter.default.removeObserver(observer) }; observer = nil
        loading = false
    }
    func replay() { player?.seek(to: .zero); player?.play(); ended = false }
}
