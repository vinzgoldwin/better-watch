import XCTest

#if targetEnvironment(simulator)
final class LibraryUITests: XCTestCase {
    private var app: XCUIApplication!
    override func setUp() {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchEnvironment["BW_SERVER_URL"] = "http://localhost:3399"
        XCUIDevice.shared.orientation = .portrait
        app.launch()
    }
    private func revealControls() {
        let center = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
        if !app.buttons["player-toggle"].exists { center.tap() }
        XCTAssertTrue(app.buttons["player-toggle"].waitForExistence(timeout: 5))
    }
    func testLibraryPreviewListsAndRotation() {
        let movie = app.buttons["movie-compatible"]
        XCTAssertTrue(movie.waitForExistence(timeout: 30))
        movie.tap()
        XCTAssertTrue(app.buttons["play-film"].waitForExistence(timeout: 10))
        let favorite = app.buttons["Favorite"]
        let before = favorite.value as? String
        favorite.tap()
        XCTAssertNotEqual(favorite.value as? String, before)
        app.buttons["preview-moment-1"].tap()
        let attachment = XCTAttachment(screenshot: app.screenshot()); attachment.name = "iPad Quick Look"; attachment.lifetime = .keepAlways; add(attachment)
        app.buttons["Close"].tap()
        XCUIDevice.shared.orientation = .landscapeLeft
        XCTAssertTrue(movie.waitForExistence(timeout: 10))
        let search = app.textFields["film-search"]
        search.tap(); search.typeText("Direct")
        XCTAssertTrue(app.buttons["movie-direct"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["movie-compatible"].exists)
    }
    func testCompatiblePlaybackSeekAndResume() {
        let movie = app.buttons["movie-compatible"]
        XCTAssertTrue(movie.waitForExistence(timeout: 30)); movie.tap()
        app.buttons["play-film"].tap()
        XCTAssertTrue(app.buttons["Back to library"].waitForExistence(timeout: 20))
        let ready = NSPredicate(format: "exists == false")
        expectation(for: ready, evaluatedWith: app.staticTexts["Preparing playback…"])
        waitForExpectations(timeout: 30)
        revealControls()
        let toggle = app.buttons["player-toggle"]
        XCTAssertTrue(toggle.exists)
        if toggle.label == "Pause" { toggle.tap() }
        let slider = app.sliders["playback-position"]
        slider.adjust(toNormalizedSliderPosition: 0.4)
        expectation(for: ready, evaluatedWith: app.staticTexts["Preparing playback…"])
        waitForExpectations(timeout: 30)
        XCUIDevice.shared.orientation = .landscapeLeft
        XCTAssertTrue(slider.waitForExistence(timeout: 10))
        let attachment = XCTAttachment(screenshot: app.screenshot()); attachment.name = "iPad native player landscape"; attachment.lifetime = .keepAlways; add(attachment)
        app.buttons["Back to library"].tap()
        XCTAssertTrue(movie.waitForExistence(timeout: 10)); movie.tap(); app.buttons["play-film"].tap()
        XCTAssertTrue(app.buttons["Back to library"].waitForExistence(timeout: 20))
        expectation(for: ready, evaluatedWith: app.staticTexts["Preparing playback…"])
        waitForExpectations(timeout: 30)
        revealControls()
        XCTAssertTrue(app.staticTexts["playback-time"].exists)
        XCTAssertFalse(app.staticTexts["playback-time"].label.hasPrefix("0:00"))
        app.buttons["Back to library"].tap()
    }
    func testDescriptionDuringPlaybackAndRotation() {
        let movie = app.buttons["movie-compatible"]
        XCTAssertTrue(movie.waitForExistence(timeout: 30)); movie.tap(); app.buttons["play-film"].tap()
        XCTAssertTrue(app.buttons["Back to library"].waitForExistence(timeout: 20))
        expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: app.staticTexts["Preparing playback…"])
        waitForExpectations(timeout: 30)
        revealControls()
        let before = app.staticTexts["playback-time"].label
        app.buttons["Movie Description"].tap()
        let description = app.staticTexts["movie-description-text"]
        XCTAssertTrue(description.waitForExistence(timeout: 5)); XCTAssertTrue(description.label.contains("generated test film"))
        XCUIDevice.shared.orientation = .landscapeLeft
        XCTAssertTrue(description.waitForExistence(timeout: 5))
        let attachment = XCTAttachment(screenshot: app.screenshot()); attachment.name = "iPad playback description"; attachment.lifetime = .keepAlways; add(attachment)
        app.buttons["Close description"].tap()
        XCTAssertNotEqual(app.staticTexts["playback-time"].label, before)
        app.buttons["Back to library"].tap()
    }
    func testPlayerTouchesInBothOrientations() {
        let movie = app.buttons["movie-compatible"]
        XCTAssertTrue(movie.waitForExistence(timeout: 30)); movie.tap(); app.buttons["play-film"].tap()
        let toggle = app.buttons["player-toggle"]
        XCTAssertTrue(toggle.waitForExistence(timeout: 20))
        expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: app.staticTexts["Preparing playback…"])
        waitForExpectations(timeout: 30)
        expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: toggle)
        waitForExpectations(timeout: 8)
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        XCTAssertTrue(toggle.waitForExistence(timeout: 5)); XCTAssertEqual(toggle.label, "Pause")
        toggle.tap(); XCTAssertEqual(toggle.label, "Play")
        app.sliders["playback-position"].adjust(toNormalizedSliderPosition: 0.4)
        expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: app.staticTexts["Preparing playback…"])
        waitForExpectations(timeout: 30)
        func seconds() -> Int {
            let time = app.staticTexts["playback-time"].label.components(separatedBy: " / ")[0].split(separator: ":")
            return (Int(time[0]) ?? 0) * 60 + (Int(time[1]) ?? 0)
        }
        for orientation in [UIDeviceOrientation.portrait, .landscapeLeft] {
            XCUIDevice.shared.orientation = orientation
            expectation(for: NSPredicate { _, _ in
                (self.app.frame.width > self.app.frame.height) == (orientation == .landscapeLeft)
            }, evaluatedWith: app)
            waitForExpectations(timeout: 10)
            let start = seconds()
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.8, dy: 0.5)).doubleTap()
            expectation(for: NSPredicate { _, _ in seconds() == start + 5 }, evaluatedWith: app)
            waitForExpectations(timeout: 10)
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.2, dy: 0.5)).doubleTap()
            expectation(for: NSPredicate { _, _ in seconds() == start }, evaluatedWith: app)
            waitForExpectations(timeout: 10)
            let screenshot = XCTAttachment(screenshot: app.screenshot()); screenshot.name = "iPad controls \(orientation.rawValue)"; screenshot.lifetime = .keepAlways; add(screenshot)
            XCTAssertTrue(app.buttons["Movie Description"].isHittable)
            app.buttons["Movie Description"].tap()
            XCTAssertTrue(app.staticTexts["movie-description-text"].waitForExistence(timeout: 5))
            app.buttons["Close description"].tap()
            XCTAssertFalse(app.staticTexts["movie-description-text"].exists)
        }
        toggle.tap(); XCTAssertEqual(toggle.label, "Pause")
        app.buttons["Back to library"].tap()
    }
}
#else
final class LiveLibraryUITests: XCTestCase {
    func testRealLibraryOverTailscale() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launch()
        let movie = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'movie-'")).firstMatch
        XCTAssertTrue(movie.waitForExistence(timeout: 45))
        let film = XCTAttachment(string: movie.identifier); film.name = "Played movie ID"; film.lifetime = .keepAlways; add(film)
        print("BW_TEST_MOVIE_ID=\(movie.identifier.replacingOccurrences(of: "movie-", with: ""))")
        movie.tap()
        XCTAssertTrue(app.buttons["play-film"].waitForExistence(timeout: 15))
        app.buttons["play-film"].tap()
        XCTAssertTrue(app.buttons["Back to library"].waitForExistence(timeout: 30))
        let ready = NSPredicate(format: "exists == false")
        expectation(for: ready, evaluatedWith: app.staticTexts["Preparing playback…"])
        waitForExpectations(timeout: 90)
        func reveal() {
            let center = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
            if !app.buttons["player-toggle"].exists { center.tap() }
            XCTAssertTrue(app.buttons["player-toggle"].waitForExistence(timeout: 5))
        }
        reveal()
        XCTAssertTrue(app.staticTexts["playback-time"].exists)
        let before = app.staticTexts["playback-time"].label
        expectation(for: NSPredicate { _, _ in
            reveal()
            return app.staticTexts["playback-time"].exists && app.staticTexts["playback-time"].label != before
        }, evaluatedWith: app)
        waitForExpectations(timeout: 30)
        reveal(); app.buttons["player-toggle"].tap()
        XCTAssertEqual(app.buttons["player-toggle"].label, "Play")
        func seconds() -> Int {
            let time = app.staticTexts["playback-time"].label.components(separatedBy: " / ")[0].split(separator: ":")
            return (Int(time[0]) ?? 0) * 60 + (Int(time[1]) ?? 0)
        }
        for orientation in [UIDeviceOrientation.portrait, .landscapeLeft] {
            XCUIDevice.shared.orientation = orientation
            expectation(for: NSPredicate { _, _ in
                (app.frame.width > app.frame.height) == (orientation == .landscapeLeft)
            }, evaluatedWith: app)
            waitForExpectations(timeout: 10)
            let start = seconds()
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.8, dy: 0.5)).doubleTap()
            expectation(for: NSPredicate { _, _ in seconds() == start + 5 }, evaluatedWith: app)
            waitForExpectations(timeout: 10)
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.2, dy: 0.5)).doubleTap()
            expectation(for: NSPredicate { _, _ in seconds() == start }, evaluatedWith: app)
            waitForExpectations(timeout: 10)
            XCTAssertTrue(app.buttons["Movie Description"].isHittable)
            app.buttons["Movie Description"].tap()
            XCTAssertTrue(app.staticTexts["movie-description-text"].waitForExistence(timeout: 5))
            app.buttons["Close description"].tap()
            XCTAssertFalse(app.staticTexts["movie-description-text"].exists)
        }
        XCTAssertTrue(app.buttons["Back to library"].waitForExistence(timeout: 10))
        let screenshot = XCTAttachment(screenshot: app.screenshot()); screenshot.name = "Physical iPad playback over Tailscale"; screenshot.lifetime = .keepAlways; add(screenshot)
        app.buttons["Back to library"].tap()
        XCTAssertTrue(movie.waitForExistence(timeout: 10))
    }
}
#endif
