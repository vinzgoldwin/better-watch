import XCTest
@testable import BetterWatch

final class PlaybackTests: XCTestCase {
    private func movie(_ id: String) -> Movie {
        Movie(id: id, title: "Fixture \(id)", folder: "Fixture", topFolder: "Fixture", relativePath: "Fixture/\(id).mkv", size: 100, duration: 600)
    }
    @MainActor func testThreeTabLimitDeduplicationAndClosing() async throws {
        let store = Store()
        store.phase = .running
        defer { store.closeAllPlayback() }
        for id in ["one", "two", "three"] { store.openPlayback(movie(id), sharedPosition: nil) }
        let first = try XCTUnwrap(store.playbacks.first)
        let third = try XCTUnwrap(store.playback)
        store.openPlayback(movie("four"), sharedPosition: nil)
        XCTAssertEqual(store.playbacks.map { $0.movie.id }, ["one", "two", "three"])
        XCTAssertTrue(store.playback === third)
        XCTAssertNotNil(store.error)

        // Selecting an already-open film is allowed even at capacity and keeps its session.
        first.position = 42
        store.openPlayback(movie("one"), sharedPosition: .init(seconds: 200, duration: 600))
        XCTAssertTrue(store.playback === first)
        XCTAssertEqual(first.position, 42)
        XCTAssertEqual(store.playbacks.count, 3)
        store.closePlayback(third)
        XCTAssertTrue(store.playback === first)
        store.openPlayback(movie("four"), sharedPosition: nil)
        let fourth = try XCTUnwrap(store.playback)
        store.closeCurrentPlayback()
        XCTAssertEqual(store.playback?.movie.id, "two")
        XCTAssertFalse(fourth.active)
        XCTAssertTrue(fourth.paused)
        store.closeAllPlayback()
        XCTAssertTrue(store.playbacks.isEmpty)
        XCTAssertNil(store.playback)
        XCTAssertTrue(first.paused)
    }
    @MainActor func testSwitchingAndLibraryPreserveManualPause() async throws {
        let store = Store()
        store.phase = .running
        defer { store.closeAllPlayback() }
        store.openPlayback(movie("one"), sharedPosition: nil)
        let first = try XCTUnwrap(store.playback)
        XCTAssertFalse(first.paused)
        first.togglePause()
        store.openPlayback(movie("two"), sharedPosition: nil)
        let second = try XCTUnwrap(store.playback)
        XCTAssertTrue(first.paused)
        XCTAssertFalse(first.active)
        XCTAssertFalse(second.paused)
        store.selectPlayback(at: 0)
        XCTAssertTrue(first.paused, "A manually paused tab must remain paused when selected again")
        XCTAssertTrue(second.paused)
        first.togglePause()
        store.showLibrary()
        XCTAssertNil(store.playback)
        XCTAssertTrue(store.playbacks.allSatisfy { $0.paused && !$0.active })
        store.selectPlayback(at: 0)
        XCTAssertFalse(first.paused, "A film paused by switching tabs resumes when selected")
        store.selectPlayback(at: 2)
        XCTAssertTrue(store.playback === first)
        store.showLibrary()
        store.closePlayback(second)
        XCTAssertNil(store.playback, "Closing a background tab in Library must not start another film")
    }
    @MainActor func testResumeFilePreservesInterleavedFilmsAndExistingPositions() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let url = directory.appendingPathComponent("resume.json")
        try Data(#"{"existing":{"seconds":91,"duration":600}}"#.utf8).write(to: url)
        let positions = PlaybackPositions(url: url)
        try positions.save("one", position: .init(seconds: 30, duration: 600))
        try positions.save("two", position: .init(seconds: 60, duration: 600))
        try positions.save("three", position: .init(seconds: 90, duration: 600))
        try positions.save("one", position: .init(seconds: 45, duration: 600))
        // A later launch must keep all saved films when writing another position.
        try PlaybackPositions(url: url).save("three", position: .init(seconds: 0, duration: 600))
        let saved = try JSONDecoder().decode([String: ResumePosition].self, from: Data(contentsOf: url))
        XCTAssertEqual(saved.count, 4)
        XCTAssertEqual(saved["existing"]?.seconds, 91)
        XCTAssertEqual(saved["one"]?.seconds, 45)
        XCTAssertEqual(saved["two"]?.seconds, 60)
        XCTAssertEqual(saved["three"]?.seconds, 0)
    }
    @MainActor func testPlayAfterSeekingBackFromEnd() async {
        for absolute in [false, true] {
            let playback = Playback(movie: movie("seek-from-end"))
            playback.setActive(true)
            playback.ended = true
            playback.paused = true
            playback.duration = 600
            if absolute { playback.seek(to: 300) } else { playback.seek(by: -5) }
            // mpv keeps pause=yes after seeking away from EOF. No media is loaded in this state test.
            playback.receive(["eof-reached": false, "pause": true])
            playback.togglePause()
            XCTAssertFalse(playback.paused, "Play should resume on its first press after seeking back from EOF")
            playback.close()
        }
    }
    func testResumeBoundaries() {
        XCTAssertEqual(ResumePosition.validStart(nil),0)
        XCTAssertEqual(ResumePosition.validStart(.init(seconds:120,duration:600)),120)
        for position in [-4.0, 0, 4, 590, 600, .infinity, .nan] {
            XCTAssertEqual(ResumePosition.validStart(.init(seconds:position,duration:600)),0)
        }
    }
    func testTrackSelectionAndMissingMetadata() {
        let track = PlaybackTrack(["id":2,"type":"sub","lang":"eng","selected":true])
        XCTAssertEqual(track?.title,"eng"); XCTAssertEqual(track?.selected,true)
        XCTAssertEqual(PlaybackTrack(["id":1,"type":"audio"])?.title,"Track 1")
        XCTAssertNil(PlaybackTrack(["id":1,"type":"video"]))
    }
    func testHourTimecode() {
        XCTAssertEqual(playbackTime(3671),"1:01:11")
        XCTAssertEqual(playbackTime(.nan),"0:00")
    }
}
