import AppKit
import Combine
import UniformTypeIdentifiers

@MainActor final class Store: ObservableObject {
    enum Phase { case stopped, starting, running, stopping }
    @Published var phase: Phase = .stopped
    @Published var movies: [Movie] = []
    @Published var filtered: [Movie] = []
    @Published private(set) var positions: [String: ResumePosition] = [:]
    @Published private(set) var filtering = false
    @Published private(set) var picking = false
    @Published var folders: [String] = []
    @Published var directories: [String] = []
    @Published var artists: [String] = []
    @Published var categoryOptions: [(name: String, key: String, count: Int)] = []
    @Published var marks: [String: Mark] = [:]
    @Published var query = FilmQuery() { didSet { updateResults() } }
    @Published var selected: Movie? { didSet { if let selected { lastSelectedID = selected.id; positions = SharedLibrary.shared.positions } } }
    var lastSelectedID: String?
    @Published var error: String?
    @Published private(set) var playbacks: [Playback] = []
    @Published private(set) var playback: Playback?
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
        // Only the progress view and open details observe playback broadcasts.
        SharedLibrary.shared.onPositions = { [weak self] values in
            guard let self, self.playback == nil else { return }
            if self.query.list == .continuing { self.positions = values; self.updateResults() }
            else if self.selected != nil { self.positions = values }
        }
        SharedLibrary.shared.onError = { [weak self] message in self?.notice = message }
    }
    var heading: String { !query.artist.isEmpty ? query.artist : !query.folder.isEmpty ? query.folder : query.list.rawValue }
    var scope: String { query.subfolder.isEmpty ? query.folder : query.subfolder }
    func reconnect() {
        guard phase == .running else { return }
        closeAllPlayback(); selected = nil; scanTask?.cancel(); requestTask?.cancel(); phase = .stopped; start()
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
        closeAllPlayback(); phase = .stopping; selected = nil; scanTask?.cancel(); filterTask?.cancel(); requestTask?.cancel()
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
        filtering = true
        let positions = SharedLibrary.shared.positions
        if query.list == .continuing { self.positions = positions }
        filterTask?.cancel(); generation += 1
        let token = generation, query = query, movies = movies, marks = marks
        filterTask = Task {
            do {
                try await Task.sleep(for: .milliseconds(120))
                let result = await Task.detached(priority: .userInitiated) { () -> ([Movie], [(String, String, Int)]) in
                    let scope = query.apply(movies, marks: marks, positions: positions, includeCategories: false)
                    return (scope.filter(query.matchesCategories), FilmQuery.categoryOptions(in: scope))
                }.value
                guard !Task.isCancelled, generation == token else { return }
                filtered = result.0; categoryOptions = result.1; filtering = false
            } catch { }
        }
    }
    func chooseFolder(_ folder: String) { showArtists = false; query.folder = folder; query.subfolder = ""; query.artist = ""; query.categories = [] }
    func chooseList(_ list: SavedList) { showArtists = false; query = FilmQuery(list: list) }
    var canPick: Bool { !filtering && filtered.contains { marks[$0.id]?.watched != true } }
    func open(_ movie: Movie) { picking = false; selected = movie }
    func pick() {
        guard !filtering, let movie = pickMovie(filtered, marks: marks, excluding: picking ? selected?.id : nil) else { return }
        picking = true; selected = movie
    }
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
        playbackTask?.cancel(); selected = nil
        if let existing = playbacks.first(where: { $0.movie.id == movie.id }) { selectPlayback(existing); return }
        guard playbacks.count < 3 else { error = "Close a video tab before opening another. You can keep up to 3 videos open."; return }
        playbackTask = Task {
            do {
                try await SharedLibrary.shared.refresh()
                try Task.checkCancellation()
                openPlayback(movie, sharedPosition: SharedLibrary.shared.positions[movie.id])
            } catch { if !Task.isCancelled { self.error = error.localizedDescription } }
        }
    }
    // Recheck admission after the asynchronous profile refresh. A movie has one tab.
    func openPlayback(_ movie: Movie, sharedPosition: ResumePosition?) {
        guard phase == .running else { return }
        if let existing = playbacks.first(where: { $0.movie.id == movie.id }) { selectPlayback(existing); return }
        guard playbacks.count < 3 else { error = "Close a video tab before opening another. You can keep up to 3 videos open."; return }
        let next = Playback(movie: movie, sharedPosition: sharedPosition)
        playbacks.append(next)
        selectPlayback(next)
    }
    func selectPlayback(_ next: Playback?) {
        guard next == nil || playbacks.contains(where: { $0 === next }) else { return }
        playbackTask?.cancel(); playbackTask = nil
        selected = nil
        guard playback !== next else { return }
        playback?.setActive(false)
        playback = next
        next?.setActive(true)
        if let next { lastSelectedID = next.movie.id }
        else {
            if query.list == .continuing { updateResults() }
            NotificationCenter.default.post(name:.init("BetterWatchRestoreFocus"),object:picking ? nil : lastSelectedID)
        }
    }
    func showLibrary() { selectPlayback(nil) }
    func selectPlayback(at index: Int) {
        guard playbacks.indices.contains(index) else { return }
        selectPlayback(playbacks[index])
    }
    func closePlayback(_ item: Playback) {
        guard let index = playbacks.firstIndex(where: { $0 === item }) else { return }
        item.close()
        playbacks.remove(at: index)
        if playback === item { selectPlayback(playbacks.isEmpty ? nil : playbacks[min(index, playbacks.count - 1)]) }
    }
    func closeCurrentPlayback() { if let playback { closePlayback(playback) } }
    func closeAllPlayback() {
        playbackTask?.cancel(); playbackTask = nil
        playbacks.forEach { $0.close() }
        playbacks = []; playback = nil
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
                if let tab = playbacks.first(where: { $0.movie.id == movie.id }) { closePlayback(tab) }
                selected = nil; try await refresh()
            } catch { self.error = error.localizedDescription }
        }
    }
}
