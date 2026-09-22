import XCTest
@testable import BetterWatch

final class PlaybackTests: XCTestCase {
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
