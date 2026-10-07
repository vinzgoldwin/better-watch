import XCTest
@testable import BetterWatch

final class LibraryContractTests: XCTestCase {
    func testSharedNativeLibraryContract() throws {
        let ancestors = sequence(first: URL(fileURLWithPath: #filePath).deletingLastPathComponent()) { url in
            url.path == "/" ? nil : url.deletingLastPathComponent()
        }
        let fixtureURL = try XCTUnwrap(ancestors.map { $0.appendingPathComponent("tests/fixtures/native-library-contract.json") }
            .first { FileManager.default.fileExists(atPath: $0.path) })
        let data = try Data(contentsOf: fixtureURL)
        let fixture = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        let movies = try JSONDecoder().decode([Movie].self, from: JSONSerialization.data(withJSONObject: fixture["movies"]!))
        let marks = try JSONDecoder().decode([String: Mark].self, from: JSONSerialization.data(withJSONObject: fixture["marks"]!))
        let lists: [String: SavedList] = ["favorite": .favorite, "watchLater": .watchLater, "unwatched": .unwatched, "watched": .watched]
        let sorts: [String: Sort] = ["folder": .folder, "duration": .duration, "size": .size, "modified": .modified, "releaseNewest": .releaseNewest, "releaseOldest": .releaseOldest]
        for row in fixture["cases"] as! [[String: Any]] {
            let q = row["query"] as! [String: Any]
            let query = FilmQuery(folder: q["folder"] as? String ?? "", subfolder: q["subfolder"] as? String ?? "",
                search: q["search"] as? String ?? "", artist: q["artist"] as? String ?? "",
                categories: Set(q["categories"] as? [String] ?? []), list: lists[q["list"] as? String ?? ""] ?? .all,
                sort: sorts[q["sort"] as? String ?? ""] ?? .name)
            XCTAssertEqual(query.apply(movies, marks: marks).map(\.id), row["expected"] as! [String], row["name"] as! String)
        }
    }
}
