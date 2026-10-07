import SwiftUI

@MainActor final class MobileStore: ObservableObject {
    @Published var movies: [Movie] = []
    @Published var filtered: [Movie] = []
    @Published private(set) var positions: [String: ResumePosition] = [:]
    @Published private(set) var filtering = false
    @Published private(set) var picking = false
    @Published var directories: [String] = []
    @Published var categoryOptions: [(name: String, key: String, count: Int)] = []
    @Published var marks: [String: Mark] = [:]
    @Published var query = FilmQuery() { didSet { filter() } }
    @Published var selected: Movie? { didSet { if selected != nil { positions = SharedLibrary.shared.positions } } }
    @Published var playing: NativePlayback?
    @Published var error: String?
    @Published var loading = false
    @Published var artistsVisible = false
    private var filterTask: Task<Void, Never>?
    private var requestedPlayback: Movie?
    var folders: [String] { Array(Set(movies.map(\.topFolder))).sorted() }
    var artists: [String] { Array(Set(movies.flatMap { $0.artists ?? [] })).sorted() }
    var heading: String { artistsVisible ? "Artists" : !query.artist.isEmpty ? query.artist : !query.folder.isEmpty ? query.folder : query.list.rawValue }
    init() {
        SharedLibrary.shared.onMarks = { [weak self] values in self?.marks = values; self?.filter() }
        // Only the progress view and open details observe playback broadcasts.
        SharedLibrary.shared.onPositions = { [weak self] values in
            guard let self, self.playing == nil else { return }
            if self.query.list == .continuing { self.positions = values; self.filter() }
            else if self.selected != nil { self.positions = values }
        }
        SharedLibrary.shared.onError = { [weak self] message in self?.error = message }
    }
    func connect() async {
        guard !loading else { return }
        loading = true; error = nil
        do {
            let data = try await API.data("/api/library")
            let library = try await Task.detached { try JSONDecoder().decode(Library.self, from: data) }.value
            movies = library.movies; directories = library.directories
            try await SharedLibrary.shared.connect(localMarks: [:]); filter()
        } catch { self.error = error.localizedDescription }
        loading = false
    }
    func filter() {
        filtering = true
        let positions = SharedLibrary.shared.positions
        if query.list == .continuing { self.positions = positions }
        filterTask?.cancel()
        let query = query, movies = movies, marks = marks
        filterTask = Task {
            do {
                try await Task.sleep(for: .milliseconds(120))
                let result = await Task.detached {
                    let scope = query.apply(movies, marks: marks, positions: positions, includeCategories: false)
                    return (scope.filter(query.matchesCategories), FilmQuery.categoryOptions(in: scope))
                }.value
                try Task.checkCancellation(); filtered = result.0; categoryOptions = result.1; filtering = false
            } catch { }
        }
    }
    func choose(_ list: SavedList) { artistsVisible = false; query = FilmQuery(list: list) }
    func configure(_ address: String) async {
        guard !loading else { return }
        closePlayback(); selected = nil; requestedPlayback = nil
        await SharedLibrary.shared.flush()
        SharedLibrary.shared.disconnect()
        filterTask?.cancel()
        UserDefaults.standard.set(address, forKey: "serverURL")
        movies = []; filtered = []; marks = [:]; directories = []; categoryOptions = []
        await connect()
    }
    func choose(folder: String) { artistsVisible = false; query.folder = folder; query.subfolder = ""; query.artist = ""; query.categories = [] }
    var canPick: Bool { !filtering && filtered.contains { marks[$0.id]?.watched != true } }
    func open(_ movie: Movie) { picking = false; selected = movie }
    func pick() {
        guard !filtering, let movie = pickMovie(filtered, marks: marks, excluding: picking ? selected?.id : nil) else { return }
        picking = true; selected = movie
    }
    func toggle(_ movie: Movie, _ field: WritableKeyPath<Mark, Bool>) {
        var mark = marks[movie.id] ?? Mark(); mark[keyPath: field].toggle(); marks[movie.id] = mark; filter()
        let key = field == \Mark.favorite ? "favorite" : field == \Mark.watchLater ? "watchLater" : "watched"
        SharedLibrary.shared.setMark(movie.id, field: key, value: mark[keyPath: field])
    }
    func play(_ movie: Movie) {
        if selected != nil { requestedPlayback = movie; selected = nil }
        else { playing = NativePlayback(movie: movie) }
    }
    func previewDismissed() { if let movie = requestedPlayback { requestedPlayback = nil; playing = NativePlayback(movie: movie) } }
    func closePlayback() { playing?.close(); playing = nil; if query.list == .continuing { filter() } }
    func background() { playing?.pause(); Task { await SharedLibrary.shared.flush() }; SharedLibrary.shared.disconnect() }
}
