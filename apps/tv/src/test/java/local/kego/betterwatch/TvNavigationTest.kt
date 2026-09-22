package local.kego.betterwatch

import android.content.Context
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import org.junit.*
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.ConscryptMode
import org.robolectric.annotation.GraphicsMode

/** Native Compose + real fixture HTTP integration on Asahi, not a video-decoder test. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28], qualifiers = "w960dp-h540dp-land-television-mdpi-notouch")
@GraphicsMode(GraphicsMode.Mode.LEGACY)
@ConscryptMode(ConscryptMode.Mode.OFF)
@OptIn(ExperimentalTestApi::class)
class TvNavigationTest {
    @get:Rule val compose = createEmptyComposeRule()
    private lateinit var activity: ActivityScenario<TvActivity>
    @Before fun launch() {
        val fixture = OkHttpClient().newCall(Request.Builder().url("http://127.0.0.1:3399/api/library").build()).execute().use { JSONObject(it.body!!.string()) }.getJSONArray("movies")
        require(fixture.length() == 36 && fixture.getJSONObject(0).getString("id") == "compatible" &&
            fixture.getJSONObject(0).getString("description") == "A generated test film.") { "Start scripts/mobile-fixture.js before local TV tests" }
        ApplicationProvider.getApplicationContext<Context>().getSharedPreferences("library", 0).edit()
            .putString("server", "http://127.0.0.1:3399").commit()
        activity = ActivityScenario.launch(TvActivity::class.java)
        await("tv-movie-compatible")
    }
    @After fun close() { if (::activity.isInitialized) activity.close() }
    private fun await(tag: String) {
        compose.waitUntil(20_000) { compose.onAllNodesWithTag(tag).fetchSemanticsNodes(atLeastOneRootRequired = false).isNotEmpty() }
    }
    private fun key(key: Key) {
        val target = if (compose.onAllNodesWithTag("tv-dialog").fetchSemanticsNodes().isNotEmpty()) compose.onNodeWithTag("tv-dialog") else compose.onRoot()
        target.performKeyInput { pressKey(key) }; compose.waitForIdle()
    }
    private fun back() { activity.onActivity { it.onBackPressedDispatcher.onBackPressed() }; compose.waitForIdle() }
    private fun profile(): JSONObject = OkHttpClient().newCall(Request.Builder().url("http://127.0.0.1:3399/api/profile").build()).execute().use { JSONObject(it.body!!.string()) }

    @Test fun remoteOpensDetailsAndRestoresTheSelectedFilm() {
        compose.onNodeWithTag("tv-movie-compatible").assertIsFocused()
        key(Key.DirectionRight)
        compose.onNodeWithTag("tv-movie-direct").assertIsFocused()
        key(Key.DirectionCenter)
        compose.onNodeWithTag("tv-play").assertIsFocused()
        compose.onNodeWithTag("tv-detail-description").assertExists()
        key(Key.DirectionDown)
        compose.onNodeWithTag("tv-mark-favorite").assertIsFocused()
        val before = profile().getJSONObject("marks").optJSONObject("direct")?.optBoolean("favorite") ?: false
        key(Key.DirectionCenter)
        compose.waitUntil(10_000) { profile().getJSONObject("marks").optJSONObject("direct")?.optBoolean("favorite") == !before }
        back()
        await("tv-movie-direct")
        compose.onNodeWithTag("tv-movie-direct").assertIsFocused()
        key(Key.DirectionDown)
        compose.onNodeWithTag("tv-movie-film-05").assertIsFocused()
        repeat(5) { key(Key.DirectionDown) }
        compose.onNode(isFocused()).assertIsDisplayed()
        back()
        compose.onNodeWithTag("tv-nav-ALL").assertIsFocused()
    }

    @Test fun searchEmptyResultsAndSortAreReachableWithoutTouch() {
        key(Key.DirectionUp)
        compose.onNodeWithTag("tv-search").assertIsFocused()
        key(Key.DirectionCenter)
        compose.onNodeWithTag("tv-input").assertIsFocused().performTextReplacement("No such movie")
        key(Key.DirectionDown)
        compose.onNodeWithTag("tv-input-submit").assertIsFocused()
        key(Key.DirectionCenter)
        compose.waitUntil(5000) { compose.onAllNodesWithText("No films found").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithTag("tv-search").assertIsFocused()
        key(Key.DirectionCenter)
        compose.onNodeWithTag("tv-input").performTextReplacement("Direct")
        key(Key.DirectionDown); key(Key.DirectionCenter)
        await("tv-movie-direct")
        compose.onNodeWithTag("tv-movie-direct").assertIsFocused()
        key(Key.DirectionUp); key(Key.DirectionRight); key(Key.DirectionRight)
        compose.onNodeWithTag("tv-sort").assertIsFocused()
        key(Key.DirectionCenter)
        compose.onNodeWithTag("tv-choice-NAME").assertIsFocused()
        key(Key.DirectionDown); key(Key.DirectionCenter)
        await("tv-movie-direct")
        compose.onNodeWithTag("tv-sort").assertTextContains("Folder")
    }

    @Test fun categoriesHaveAnInitialRemoteFocusAndCanClose() {
        key(Key.DirectionUp); key(Key.DirectionRight)
        compose.onNodeWithTag("tv-categories").assertIsFocused()
        key(Key.DirectionCenter)
        compose.onNodeWithTag("tv-choice-").assertIsFocused()
        key(Key.DirectionDown); key(Key.DirectionCenter)
        compose.onNodeWithText("✓ Adventure").assertExists()
        key(Key.DirectionDown); key(Key.DirectionDown)
        compose.onNodeWithTag("tv-choices-done").assertIsFocused()
        key(Key.DirectionCenter)
        compose.onNodeWithTag("tv-dialog").assertDoesNotExist()
    }

    @Test fun sidebarRemainsReachableAfterScrollingItsRows() {
        back()
        repeat(6) { key(Key.DirectionDown) }
        key(Key.DirectionRight)
        back()
        compose.onNodeWithTag("tv-nav-ALL").assertIsFocused()
        // A second Back must exit rather than trapping the remote in a focus loop.
        back()
        activity.onActivity { Assert.assertTrue("Back from collections must finish the activity", it.isFinishing) }
    }

    @Test fun playerDescriptionAndTrackButtonsAreReachableByRemote() {
        key(Key.DirectionCenter)
        key(Key.DirectionCenter)
        await("tv-player-toggle")
        compose.onNodeWithTag("tv-player-toggle").assertIsFocused()
        key(Key.DirectionLeft)
        compose.onNodeWithTag("tv-player-toggle").assertIsFocused()
        repeat(3) { key(Key.DirectionRight) }
        compose.onNodeWithTag("tv-info").assertIsFocused()
        key(Key.DirectionCenter)
        compose.onNode(hasText("A generated test film.") and hasAnyAncestor(hasTestTag("tv-description"))).assertIsDisplayed()
        compose.onNodeWithTag("tv-description-close").assertIsFocused()
        key(Key.DirectionCenter)
        compose.onNodeWithTag("tv-dialog").assertDoesNotExist()
        compose.onNodeWithTag("tv-info").assertIsFocused()
        key(Key.DirectionRight); key(Key.DirectionCenter)
        await("tv-choice-audio:1")
        compose.onNodeWithTag("tv-choice-sub:off").assertExists()
        // This verifies metadata and focus, not decoding: Robolectric does not play video.
    }
}
