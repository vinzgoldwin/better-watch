package local.kego.betterwatch

import android.content.Context
import android.content.pm.ActivityInfo
import android.graphics.Bitmap
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.platform.app.InstrumentationRegistry
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import org.junit.*
import java.io.File

class LibraryTest {
    @get:Rule val compose = createEmptyComposeRule()
    private lateinit var activity: ActivityScenario<MainActivity>
    private val base = InstrumentationRegistry.getArguments().getString("server") ?: "http://10.0.2.2:3399"
    @Before fun launch() {
        ApplicationProvider.getApplicationContext<Context>().getSharedPreferences("library", 0).edit().putString("server", base).commit()
        activity = ActivityScenario.launch(MainActivity::class.java)
        activity.onActivity { it.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT }
        awaitTag("movie-compatible")
    }
    @After fun close() { activity.close() }
    private fun awaitTag(tag: String, timeout: Long = 40_000) {
        // Launch and rotation can briefly leave no registered Compose root.
        compose.waitUntil(timeout) { compose.onAllNodesWithTag(tag, useUnmergedTree = true).fetchSemanticsNodes(atLeastOneRootRequired = false).isNotEmpty() }
    }
    private fun ready() {
        awaitTag("player-surface")
        compose.waitUntil(60_000) { compose.onAllNodesWithTag("player-loading", useUnmergedTree = true).fetchSemanticsNodes().isEmpty() }
        if (compose.onAllNodesWithTag("playback-time", useUnmergedTree = true).fetchSemanticsNodes().isEmpty()) compose.onNodeWithTag("player-surface").performTouchInput { click(center) }
        awaitTag("playback-time")
        compose.onNodeWithTag("player-error", useUnmergedTree = true).assertDoesNotExist()
    }
    private fun capture(name: String) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        instrumentation.uiAutomation.waitForIdle(750, 5000)
        val screenshot = instrumentation.uiAutomation.takeScreenshot()
        File(instrumentation.targetContext.getExternalFilesDir(null), "$name.png").outputStream().use { screenshot.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }
    private fun profile(): JSONObject = OkHttpClient().newCall(Request.Builder().url("$base/api/profile").build()).execute().use { JSONObject(it.body!!.string()) }
    @Test fun previewMarksSearchAndRotation() {
        compose.onNodeWithTag("movie-compatible").performClick()
        awaitTag("play-film")
        val before = compose.onNodeWithTag("mark-favorite").fetchSemanticsNode().config[SemanticsProperties.StateDescription]
        compose.onNodeWithTag("mark-favorite").performScrollTo().performClick()
        compose.waitUntil(10_000) { profile().getJSONObject("marks").optJSONObject("compatible")?.optBoolean("favorite") == (before != "On") }
        compose.waitUntil(5000) { compose.onNodeWithTag("mark-favorite").fetchSemanticsNode().config[SemanticsProperties.StateDescription] == (if (before == "On") "Off" else "On") }
        compose.onNodeWithTag("preview-moment-1").performScrollTo().performClick()
        capture("android-quick-look-portrait")
        compose.onNodeWithContentDescription("Close").performClick()
        activity.onActivity { it.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE }
        awaitTag("film-search")
        compose.onNodeWithTag("film-search").performTextInput("Direct")
        awaitTag("movie-direct")
        compose.waitUntil(5000) { compose.onAllNodesWithTag("movie-compatible").fetchSemanticsNodes().isEmpty() }
        capture("android-library-landscape")
    }
    @Test fun compatiblePlaybackSeekResumeAndAudio() {
        compose.onNodeWithTag("movie-compatible").performClick(); awaitTag("play-film"); compose.onNodeWithTag("play-film").performScrollTo().performClick(); ready()
        compose.onNodeWithTag("player-toggle").performClick()
        compose.onNodeWithTag("playback-position").performTouchInput { click(Offset(width * 0.4f, height / 2f)) }
        ready()
        compose.waitUntil(15_000) { val p = profile().getJSONObject("positions").optJSONObject("compatible"); p != null && p.getDouble("seconds") in 25.0..45.0 }
        compose.onNodeWithContentDescription("Audio and subtitles").performClick()
        compose.onNodeWithText("Alternate", substring = true).performClick(); ready()
        activity.onActivity { it.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE }
        awaitTag("playback-position"); capture("android-player-landscape")
        compose.onNodeWithContentDescription("Back to library").performClick()
        awaitTag("movie-compatible"); compose.onNodeWithTag("movie-compatible").performClick(); awaitTag("play-film"); compose.onNodeWithTag("play-film").performScrollTo().performClick(); ready()
        compose.onNodeWithTag("playback-time", useUnmergedTree = true).assertTextContains("0:3", substring = true)
        compose.onNodeWithContentDescription("Back to library").performClick()
    }
    @Test fun directPlayback() {
        compose.onNodeWithTag("film-search").performTextInput("Direct"); awaitTag("movie-direct")
        compose.onNodeWithTag("movie-direct").performClick(); awaitTag("play-film"); compose.onNodeWithTag("play-film").performScrollTo().performClick(); ready()
        compose.onNodeWithTag("player-toggle").performClick()
        compose.onNodeWithTag("playback-position").performTouchInput { click(Offset(width * 0.6f, height / 2f)) }; ready()
        compose.waitUntil(15_000) { val p = profile().getJSONObject("positions").optJSONObject("direct"); p != null && p.getDouble("seconds") in 40.0..65.0 }
        compose.onNodeWithContentDescription("Back to library").performClick()
    }
    @Test fun descriptionDuringPlaybackAndRotation() {
        compose.onNodeWithTag("movie-compatible").performClick(); awaitTag("play-film"); compose.onNodeWithTag("play-film").performScrollTo().performClick(); ready()
        val before = compose.onNodeWithTag("playback-time", useUnmergedTree = true).fetchSemanticsNode().config[SemanticsProperties.Text].first().text
        compose.onNodeWithContentDescription("Movie Description").performClick()
        compose.onNodeWithTag("movie-description-text").assertTextContains("generated test film", substring = true)
        compose.waitUntil(10_000) { compose.onNodeWithTag("playback-time", useUnmergedTree = true).fetchSemanticsNode().config[SemanticsProperties.Text].first().text != before }
        activity.onActivity { it.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE }
        awaitTag("movie-description-text")
        compose.onNodeWithTag("movie-description-text").assertTextContains("generated test film", substring = true)
        compose.onNodeWithContentDescription("Close description").performClick()
        compose.onNodeWithTag("player-toggle").performClick()
        compose.onNodeWithContentDescription("Back to library").performClick()
    }

    @Test fun physicalPlayerTouchesInBothOrientations() {
        compose.onNodeWithTag("movie-compatible").performClick(); awaitTag("play-film")
        compose.onNodeWithTag("play-film").performScrollTo().performClick(); ready()
        // Let real auto-hide run, then inject a touch through the video surface.
        compose.waitUntil(8000) { compose.onAllNodesWithTag("player-toggle").fetchSemanticsNodes().isEmpty() }
        compose.onNodeWithTag("player-gestures").performTouchInput { click(center) }
        awaitTag("player-toggle")
        compose.onNodeWithTag("player-toggle").assertIsDisplayed().performTouchInput { click(center) }
        compose.onNodeWithContentDescription("Play", useUnmergedTree = true).assertIsDisplayed()
        compose.onNodeWithTag("playback-position").performTouchInput { click(Offset(width * 0.4f, height / 2f)) }
        ready()
        fun seconds(): Int {
            val time = compose.onNodeWithTag("playback-time", useUnmergedTree = true).fetchSemanticsNode().config[SemanticsProperties.Text].first().text.substringBefore(" / ").split(":")
            return time[0].toInt() * 60 + time[1].toInt()
        }
        for (orientation in listOf(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT, ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE)) {
            activity.onActivity { it.requestedOrientation = orientation }
            compose.waitUntil(5000) {
                val bounds = compose.onNodeWithTag("player-surface").fetchSemanticsNode().boundsInRoot
                (bounds.width > bounds.height) == (orientation == ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE)
            }
            val start = seconds()
            compose.onNodeWithTag("player-gestures").performTouchInput { doubleClick(Offset(width * 0.8f, height * 0.5f)) }
            compose.waitUntil(5000) { seconds() == start + 5 }
            compose.onNodeWithTag("player-gestures").performTouchInput { doubleClick(Offset(width * 0.2f, height * 0.5f)) }
            compose.waitUntil(5000) { seconds() == start }
            capture("android-touch-controls-$orientation")
            compose.onNodeWithContentDescription("Movie Description").assertIsDisplayed().performTouchInput { click(center) }
            compose.onNodeWithTag("movie-description-text").assertIsDisplayed()
            compose.onNodeWithContentDescription("Close description").performTouchInput { click(center) }
            compose.onNodeWithTag("movie-description-text").assertDoesNotExist()
        }
        compose.onNodeWithTag("player-toggle").performTouchInput { click(center) }
        compose.onNodeWithContentDescription("Pause", useUnmergedTree = true).assertIsDisplayed()
        compose.onNodeWithContentDescription("Back to library").performTouchInput { click(center) }
    }
}
