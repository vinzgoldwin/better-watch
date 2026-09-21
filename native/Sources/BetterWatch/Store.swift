import AppKit
import Combine
import UniformTypeIdentifiers

@MainActor final class Store: ObservableObject {
    enum Phase { case stopped, starting, running, stopping }
    @Published var phase: Phase = .stopped
    @Published var movies: [Movie] = []
    @Published var filtered: [Movie] = []
    @Published var folders: [String] = []
    @Published var directories: [String] = []
    @Published var artists: [String] = []
    @Published var categoryOptions: [(name: String, key: String, count: Int)] = []
    @Published var marks: [String: Mark] = [:]
    @Published var query = FilmQuery() { didSet { updateResults() } }
    @Published var selected: Movie? { didSet { if let selected { lastSelectedID = selected.id } } }
    var lastSelectedID: String?
    @Published var error: String?
    @Published var playback: Playback?
    @Published var scanning = false
    @Published var refreshing = false
    @Published var showArtists = false
    @Published var artistSearch = ""
    @Published var confirmStop = false
    @Published var confirmCleanup = false
    @Published var deleteCandidate: Movie?
    @Published var notice: String?
    private var filterTask: Task<Void, Never>?
    private var scanTask: Task<Void, Never>?
    private var requestTask: Task<Void, Never>?
    private var playbackTask: Task<Void, Never>?
    private var generation = 0
    private var stopWhenStarted = false
    private let marksURL: URL
    init() {
        marksURL = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Better Watch/marks.json")
        if let data = try? Data(contentsOf: marksURL), let stored = try? JSONDecoder().decode([String: Mark].self, from: data) { marks = stored }
        SharedLibrary.shared.onMarks = { [weak self] values in self?.marks = values; self?.persistMarks(); self?.updateResults() }
        SharedLibrary.shared.onError = { [weak self] message in self?.notice = message }
    }
    var heading: String { !query.artist.isEmpty ? query.artist : !query.folder.isEmpty ? query.folder : query.list.rawValue }
    var scope: String { query.subfolder.isEmpty ? query.folder : query.subfolder }
    func reconnect() {
        guard phase == .running else { return }
        closePlayback(); selected = nil; scanTask?.cancel(); requestTask?.cancel(); phase = .stopped; start()
    }
    func start() {
        guard phase == .stopped else { return }
        phase = .starting; error = nil; stopWhenStarted = false
        requestTask = Task {
            do {
                try await Remote.start()
                try await SharedLibrary.shared.connect(localMarks: marks)
                if !stopWhenStarted { try await refresh() }
                if stopWhenStarted { SharedLibrary.shared.disconnect(); try await Remote.stop(); movies = []; filtered = []; phase = .stopped }
                else { phase = .running }
            } catch {
                let failure = error.localizedDescription
                SharedLibrary.shared.disconnect()
                do { try await Remote.stop(); phase = .stopped; self.error = failure }
                catch { phase = .running; self.error = failure + "\nCould not disconnect. Try reconnecting." }
            }
        }
    }
    func stop() async -> Bool {
        if phase == .starting {
            stopWhenStarted = true
            await requestTask?.value
            return phase == .stopped
        }
        if phase == .stopping {
            while phase == .stopping { try? await Task.sleep(for: .milliseconds(100)) }
            return phase == .stopped
        }
        guard phase == .running || phase == .stopped else { return false }
        closePlayback(); phase = .stopping; selected = nil; scanTask?.cancel(); filterTask?.cancel(); requestTask?.cancel()
        do {
            await SharedLibrary.shared.flush()
            SharedLibrary.shared.disconnect()
            try await Remote.stop()
            await Covers.shared.clear()
            movies = []; filtered = []; folders = []; directories = []; artists = []; categoryOptions = []
            scanning = false; phase = .stopped; return true
        } catch { phase = .running; self.error = "Could not disconnect: \(error.localizedDescription)"; return false }
    }
    func refresh() async throws {
        let data = try await API.data("/api/library?artists=1")
        let library = try await Task.detached { try JSONDecoder().decode(Library.self, from: data) }.value
        try Task.checkCancellation()
        movies = library.movies; directories = library.directories
        folders = Array(Set(movies.map(\.topFolder))).sorted { $0.localizedStandardCompare($1) == .orderedAscending }
        artists = Array(Set(movies.flatMap { $0.artists ?? [] })).sorted { $0.localizedStandardCompare($1) == .orderedAscending }
        scanning = library.scanning; updateResults()
        await filterTask?.value
        if scanning { pollScan() }
    }
    func updateResults() {
        filterTask?.cancel(); generation += 1
        let token = generation, query = query, movies = movies, marks = marks
        filterTask = Task {
            do {
                try await Task.sleep(for: .milliseconds(120))
                let result = await Task.detached(priority: .userInitiated) { () -> ([Movie], [(String, String, Int)]) in
                    let scope = query.apply(movies, marks: marks, includeCategories: false)
                    var counts: [String: (String,Int)] = [:]
                    for m in scope {
                        let categories = m.categories ?? []
                        for value in Set(categories.isEmpty ? ["__uncategorized"] : categories) {
                            let key = value.lowercased(); let old = counts[key]
                            counts[key] = (value == "__uncategorized" ? "Uncategorized" : value, (old?.1 ?? 0)+1)
                        }
                    }
                    return (query.apply(movies, marks: marks), counts.map { ($0.value.0, $0.key, $0.value.1) }.sorted { $0.0.localizedStandardCompare($1.0) == .orderedAscending })
                }.value
                guard !Task.isCancelled, generation == token else { return }
                filtered = result.0; categoryOptions = result.1
            } catch { }
        }
    }
    func chooseFolder(_ folder: String) { showArtists = false; query.folder = folder; query.subfolder = ""; query.artist = ""; query.categories = [] }
    func chooseList(_ list: SavedList) { showArtists = false; query = FilmQuery(list: list) }
    func toggle(_ movie: Movie, _ field: WritableKeyPath<Mark, Bool>) {
        var mark = marks[movie.id] ?? Mark(); mark[keyPath: field].toggle(); marks[movie.id] = mark
        persistMarks(); updateResults()
        let key = field == \Mark.favorite ? "favorite" : field == \Mark.watchLater ? "watchLater" : "watched"
        SharedLibrary.shared.setMark(movie.id, field: key, value: mark[keyPath: field])
    }
    private func persistMarks() {
        do {
            try FileManager.default.createDirectory(at: marksURL.deletingLastPathComponent(), withIntermediateDirectories: true)
            try JSONEncoder().encode(marks).write(to: marksURL, options: .atomic)
        } catch { self.error = "Could not save your lists: \(error.localizedDescription)" }
    }
    func importMarks() {
        let panel = NSOpenPanel(); panel.allowedContentTypes = [.json]; panel.canChooseDirectories = false
        panel.begin { [weak self] result in
            guard result == .OK, let url = panel.url else { return }
            Task { @MainActor in
                do {
                    let data = try Data(contentsOf: url)
                    let imported = try JSONDecoder().decode([String: Mark].self, from: data)
                    try await SharedLibrary.shared.importMarks(imported)
                } catch { self?.error = "Choose a Better Watch movie-lists JSON export." }
            }
        }
    }
    func play(_ movie: Movie) {
        guard phase == .running else { return }
        closePlayback(); selected = nil; lastSelectedID = movie.id
        playbackTask = Task {
            do {
                try await SharedLibrary.shared.refresh()
                try Task.checkCancellation()
                playback = Playback(movie: movie, sharedPosition: SharedLibrary.shared.positions[movie.id])
            } catch { if !Task.isCancelled { self.error = error.localizedDescription } }
        }
    }
    func closePlayback() {
        playbackTask?.cancel(); playbackTask = nil
        playback?.close(); playback = nil
        NotificationCenter.default.post(name:.init("BetterWatchRestoreFocus"),object:lastSelectedID)
    }
    func rescan() {
        guard !scanning, phase == .running else { return }
        scanning = true
        let scope = scope
        requestTask = Task {
            do { _ = try await API.data("/api/rescan", body: ["folder":scope]); pollScan() }
            catch { scanning = false; self.error = error.localizedDescription }
        }
    }
    private func pollScan() {
        scanTask?.cancel()
        scanTask = Task {
            do {
                while !Task.isCancelled {
                    try await Task.sleep(for: .seconds(3))
                    let data = try await API.data("/api/library/status")
                    let status = try JSONSerialization.jsonObject(with: data) as? [String: Any]
                    if status?["scanning"] as? Bool == false { try await refresh(); return }
                }
            } catch { if !Task.isCancelled { self.error = error.localizedDescription; scanning = false } }
        }
    }
    func cleanup() {
        requestTask = Task {
            do { _ = try await API.data("/api/sidecars/cleanup", body:["confirm":"remove-appledouble-sidecars"]); notice = "Sidecar cleanup completed." }
            catch { self.error = error.localizedDescription }
        }
    }
    func delete(_ movie: Movie) {
        requestTask = Task {
            do {
                _ = try await API.data("/api/movie", body:["id":movie.id,"confirm":"delete-from-disk"], method:"DELETE")
                selected = nil; try await refresh()
            } catch { self.error = error.localizedDescription }
        }
    }
}
