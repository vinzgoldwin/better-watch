import SwiftUI

@MainActor final class MobileStore: ObservableObject {
    @Published var movies: [Movie] = []
    @Published var filtered: [Movie] = []
    @Published var directories: [String] = []
    @Published var marks: [String: Mark] = [:]
    @Published var query = FilmQuery() { didSet { filter() } }
    @Published var selected: Movie?
    @Published var playing: NativePlayback?
    @Published var error: String?
    @Published var loading = false
    @Published var artistsVisible = false
    private var filterTask: Task<Void, Never>?
    private var requestedPlayback: Movie?
    var folders: [String] { Array(Set(movies.map(\.topFolder))).sorted() }
    var artists: [String] { Array(Set(movies.flatMap { $0.artists ?? [] })).sorted() }
    var categories: [String] { Array(Set(movies.flatMap { $0.categories ?? [] })).sorted() }
    var heading: String { artistsVisible ? "Artists" : !query.artist.isEmpty ? query.artist : !query.folder.isEmpty ? query.folder : query.list.rawValue }
    init() {
        SharedLibrary.shared.onMarks = { [weak self] values in self?.marks = values; self?.filter() }
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
        filterTask?.cancel()
        let query = query, movies = movies, marks = marks
        filterTask = Task {
            do {
                try await Task.sleep(for: .milliseconds(120))
                let result = await Task.detached { query.apply(movies, marks: marks) }.value
                try Task.checkCancellation(); filtered = result
            } catch { }
        }
    }
    func choose(_ list: SavedList) { artistsVisible = false; query = FilmQuery(list: list) }
    func choose(folder: String) { artistsVisible = false; query.folder = folder; query.subfolder = ""; query.artist = ""; query.categories = [] }
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
    func closePlayback() { playing?.close(); playing = nil }
    func background() { playing?.pause(); Task { await SharedLibrary.shared.flush() }; SharedLibrary.shared.disconnect() }
}
