import XCTest
@testable import BetterWatch

final class LibraryTests: XCTestCase {
    private func movie(_ id: String, folder: String = "Collection/Sub", categories: [String]? = nil, release: String? = nil) -> Movie {
        Movie(id: id, title: "Film \(id) [HD]", folder: folder, topFolder: "Collection", relativePath: folder+"/film.mp4", size: 100, duration: 120, height: 1080, releaseDate: release, categories: categories, artists:["Example Artist"])
    }
    func testCombinedFiltersAndNestedFolderBoundary() {
        let movies = [movie("1",folder:"Collection/Sub",categories:["Drama"]),movie("2",folder:"Collection/Sub/Child",categories:["Drama"]),movie("3",folder:"Collection/Submarine",categories:["Drama"]),movie("4",folder:"Collection/Sub",categories:["Comedy"])]
        var q = FilmQuery(folder:"Collection",subfolder:"Collection/Sub",categories:["drama"],list:.unwatched)
        XCTAssertEqual(q.apply(movies, marks:["1":Mark(watched:true)]).map(\.id),["2"])
        q.search = "no match"; XCTAssertTrue(q.apply(movies, marks:[:]).isEmpty)
    }
    func testCategoryORAndUncategorized() {
        let movies = [movie("1",categories:["Drama"]),movie("2",categories:[]),movie("3",categories:["Comedy"])]
        let q = FilmQuery(categories:["drama","__uncategorized"])
        XCTAssertEqual(q.apply(movies, marks:[:]).map(\.id),["1","2"])
    }
    func testUnknownDatesLastInBothDirections() {
        let movies = [movie("1"),movie("2",release:"2020-01-01"),movie("3",release:"2025-01-01")]
        XCTAssertEqual(movies.sorted(by:Sort.releaseNewest.ordered).map(\.id),["3","2","1"])
        XCTAssertEqual(movies.sorted(by:Sort.releaseOldest.ordered).map(\.id),["2","3","1"])
    }
    func testImportPartialBrowserMarks() throws {
        let marks = try JSONDecoder().decode([String:Mark].self, from:Data(#"{"film":{"favorite":true}}"#.utf8))
        XCTAssertTrue(marks["film"]!.favorite); XCTAssertFalse(marks["film"]!.watched)
    }
    func testSubtitleFlagFromServerAndLegacyMissingField() throws {
        let data = try JSONEncoder().encode(movie("subtitles"))
        var payload = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        for flag in [true, false] {
            payload["hasEnglishSub"] = flag
            let decoded = try JSONDecoder().decode(Movie.self, from: JSONSerialization.data(withJSONObject: payload))
            XCTAssertEqual(decoded.hasEnglishSub, flag)
        }
        payload.removeValue(forKey: "hasEnglishSub")
        let legacy = try JSONDecoder().decode(Movie.self, from: JSONSerialization.data(withJSONObject: payload))
        XCTAssertNil(legacy.hasEnglishSub)
    }
    func testShortPreviewAndRelativeFolder() {
        XCTAssertEqual(momentSeconds(3,2),0)
        XCTAssertEqual(momentSeconds(600,0),72)
        XCTAssertEqual(movie("1").location(in:"Collection"),"Sub")
        XCTAssertEqual(movie("1").displayTitle,"Film 1")
    }
    func testLargeLibraryFilteringBudget() {
        let movies = (0..<10000).map { movie(String(($0 * 7919) % 10000),categories:["Drama"]) }
        let start = Date()
        let result = FilmQuery(categories:["drama"],list:.unwatched).apply(movies,marks:[:])
        XCTAssertEqual(result.count,10000)
        XCTAssertLessThan(Date().timeIntervalSince(start),1.0)
        print("10,000-film filter/sort: \(Int(Date().timeIntervalSince(start)*1000)) ms")
    }
}
