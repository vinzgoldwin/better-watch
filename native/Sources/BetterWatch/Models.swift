import Foundation

struct Movie: Codable, Identifiable, Hashable {
    let id: String
    var title: String
    var folder: String
    var topFolder: String
    var relativePath: String
    var size: Double
    var modified: Double?
    var duration: Double?
    var height: Int?
    var description: String?
    var releaseDate: String?
    var categories: [String]?
    var artists: [String]?
    var thumbnail: String?
    var hasEnglishSub: Bool?
    var displayTitle: String { title.replacingOccurrences(of: #"\s*\[HD\]\s*$"#, with: "", options: .regularExpression) }
    var minutes: String { guard let duration else { return "" }; return "\(max(1, Int(duration / 60)))m" }
    var year: String { String((releaseDate ?? "").prefix(4)) }
    var resolution: String { height.map { "\($0)p" } ?? "" }
    var facts: String { [year, minutes, resolution].filter { !$0.isEmpty }.joined(separator: " · ") }
    func location(in collection: String) -> String {
        guard !collection.isEmpty else { return folder }
        return folder == collection ? "" : String(folder.dropFirst(collection.count + 1))
    }
}
struct Library: Decodable { var movies: [Movie]; var directories: [String]; var scanning: Bool }
struct Mark: Codable {
    var favorite = false; var watchLater = false; var watched = false
    init(favorite: Bool = false, watchLater: Bool = false, watched: Bool = false) { self.favorite = favorite; self.watchLater = watchLater; self.watched = watched }
    enum CodingKeys: String, CodingKey { case favorite, watchLater, watched }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        favorite = try c.decodeIfPresent(Bool.self, forKey: .favorite) ?? false
        watchLater = try c.decodeIfPresent(Bool.self, forKey: .watchLater) ?? false
        watched = try c.decodeIfPresent(Bool.self, forKey: .watched) ?? false
    }
}
enum SavedList: String, CaseIterable, Identifiable {
    case all = "All Films", favorite = "Favorites", watchLater = "Watch Later", unwatched = "Unwatched", watched = "Watched"
    var id: String { rawValue }
    var symbol: String { switch self { case .all: "square.grid.2x2"; case .favorite: "heart"; case .watchLater: "clock"; case .unwatched: "circle"; case .watched: "checkmark.circle" } }
    func matches(_ mark: Mark) -> Bool { switch self { case .all: true; case .favorite: mark.favorite; case .watchLater: mark.watchLater; case .unwatched: !mark.watched; case .watched: mark.watched } }
}
enum Sort: String, CaseIterable, Identifiable {
    case name = "Name", folder = "Folder", duration = "Duration", size = "Size", modified = "Newest", releaseNewest = "Newest release", releaseOldest = "Oldest release"
    var id: String { rawValue }
    func ordered(_ a: Movie, _ b: Movie) -> Bool {
        switch self {
        case .duration: if a.duration != b.duration { return (a.duration ?? 0) > (b.duration ?? 0) }
        case .size: if a.size != b.size { return a.size > b.size }
        case .modified: if a.modified != b.modified { return (a.modified ?? 0) > (b.modified ?? 0) }
        case .folder: if a.folder != b.folder { return a.folder.localizedStandardCompare(b.folder) == .orderedAscending }
        case .releaseNewest, .releaseOldest:
            if a.releaseDate != b.releaseDate {
                guard let ad = a.releaseDate, !ad.isEmpty else { return false }
                guard let bd = b.releaseDate, !bd.isEmpty else { return true }
                return self == .releaseNewest ? ad > bd : ad < bd
            }
        case .name: break
        }
        let order = a.title.localizedStandardCompare(b.title)
        return order == .orderedSame ? a.id < b.id : order == .orderedAscending
    }
}
struct FilmQuery {
    var folder = "", subfolder = "", search = "", artist = ""
    var categories: Set<String> = []
    var list: SavedList = .all
    var sort: Sort = .name
    func apply(_ movies: [Movie], marks: [String: Mark], includeCategories: Bool = true) -> [Movie] {
        let text = search.trimmingCharacters(in: .whitespacesAndNewlines)
        return movies.filter { m in
            (folder.isEmpty || m.topFolder == folder) &&
            (subfolder.isEmpty || m.folder == subfolder || m.folder.hasPrefix(subfolder + "/")) &&
            (artist.isEmpty || (m.artists ?? []).contains(artist)) &&
            (text.isEmpty || m.title.localizedStandardContains(text) || m.relativePath.localizedStandardContains(text)) &&
            list.matches(marks[m.id] ?? Mark()) &&
            (!includeCategories || categories.isEmpty || ((m.categories ?? []).isEmpty ? categories.contains("__uncategorized") : (m.categories ?? []).contains { categories.contains($0.lowercased()) }))
        }.sorted(by: sort.ordered)
    }
}
func momentSeconds(_ duration: Double?, _ index: Int) -> Int {
    Int(min(max(0, (duration ?? 0) - 6), max(0, (duration ?? 0) * [0.12, 0.5, 0.78][max(0, min(2,index))])))
}
func timestamp(_ seconds: Int) -> String { String(format: "%d:%02d", seconds / 60, seconds % 60) }
