package local.kego.betterwatch

import android.app.UiModeManager
import android.content.Context
import android.content.res.Configuration
import android.graphics.Bitmap
import android.view.KeyEvent
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

/** Physical-key and decoder checks. Requires the synthetic fixture, never a personal library. */
class TvDeviceTest {
    @get:Rule val compose = createEmptyComposeRule()
    private lateinit var activity: ActivityScenario<TvActivity>
    private var oldServer: String? = null
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val args = InstrumentationRegistry.getArguments()
    private val base = args.getString("server") ?: "http://127.0.0.1:3399"
    private val context get() = ApplicationProvider.getApplicationContext<Context>()

    @Before fun launch() {
        val tv = context.getSystemService(UiModeManager::class.java).currentModeType == Configuration.UI_MODE_TYPE_TELEVISION
        Assume.assumeTrue("Run on a TV or explicitly opt in with -e tv true", tv || args.getString("tv") == "true")
        val library = json("/api/library").getJSONArray("movies")
        require(library.length() == 36 && library.getJSONObject(0).getString("id") == "compatible" &&
            library.getJSONObject(0).getString("description") == "A generated test film.") { "TV tests require scripts/mobile-fixture.js" }
        val prefs = context.getSharedPreferences("library", 0)
        oldServer = prefs.getString("server", null)
        prefs.edit().putString("server", base).commit()
        activity = ActivityScenario.launch(TvActivity::class.java)
        await("tv-movie-compatible")
        compose.onNodeWithTag("tv-movie-compatible").assertIsFocused()
    }
    @After fun close() {
        if (::activity.isInitialized) {
            activity.close()
            context.getSharedPreferences("library", 0).edit().apply {
                if (oldServer == null) remove("server") else putString("server", oldServer)
            }.commit()
        }
    }
    private fun json(path: String) = OkHttpClient().newCall(Request.Builder().url(base + path).build()).execute().use { JSONObject(it.body!!.string()) }
    private fun key(code: Int) { instrumentation.sendKeyDownUpSync(code); compose.waitForIdle() }
    private fun await(tag: String, timeout: Long = 40_000) {
        compose.waitUntil(timeout) { compose.onAllNodesWithTag(tag).fetchSemanticsNodes(atLeastOneRootRequired = false).isNotEmpty() }
    }
    private fun ready() {
        await("tv-player")
        compose.waitUntil(60_000) { compose.onAllNodesWithTag("tv-player-loading").fetchSemanticsNodes().isEmpty() }
        compose.onNodeWithTag("tv-player-error").assertDoesNotExist()
    }
    private fun reveal() {
        if (compose.onAllNodesWithTag("tv-player-toggle").fetchSemanticsNodes().isEmpty()) key(KeyEvent.KEYCODE_DPAD_CENTER)
        await("tv-player-toggle")
    }
    private fun seconds(): Int {
        val text = compose.onNodeWithTag("tv-playback-time").fetchSemanticsNode().config[SemanticsProperties.Text].first().text.split(':')
        return text[0].toInt() * 60 + text[1].toInt()
    }
    private fun capture(name: String) {
        instrumentation.uiAutomation.takeScreenshot()?.let { bitmap ->
            File(instrumentation.targetContext.getExternalFilesDir(null), "$name.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        }
    }
    @Test fun remoteNavigationAndSharedMarks() {
        key(KeyEvent.KEYCODE_DPAD_RIGHT)
        compose.onNodeWithTag("tv-movie-direct").assertIsFocused()
        key(KeyEvent.KEYCODE_DPAD_CENTER)
        await("tv-play")
        key(KeyEvent.KEYCODE_DPAD_DOWN)
        if (compose.onAllNodesWithTag("tv-play-start").fetchSemanticsNodes().isNotEmpty()) key(KeyEvent.KEYCODE_DPAD_DOWN)
        compose.onNodeWithTag("tv-mark-favorite").assertIsFocused()
        val before = json("/api/profile").getJSONObject("marks").optJSONObject("direct")?.optBoolean("favorite") ?: false
        key(KeyEvent.KEYCODE_DPAD_CENTER)
        compose.waitUntil(10_000) { json("/api/profile").getJSONObject("marks").optJSONObject("direct")?.optBoolean("favorite") == !before }
        capture("tv-details")
        key(KeyEvent.KEYCODE_BACK)
        await("tv-movie-direct")
        compose.onNodeWithTag("tv-movie-direct").assertIsFocused()
        repeat(6) { key(KeyEvent.KEYCODE_DPAD_DOWN) }
        compose.onNode(isFocused()).assertIsDisplayed()
        capture("tv-grid-scrolled")
        key(KeyEvent.KEYCODE_BACK)
        compose.onNodeWithTag("tv-nav-ALL").assertIsFocused()
    }

    @Test fun directAndHlsPlaybackWithRemoteSeekDescriptionTracksAndResume() {
        for (id in listOf("compatible", "direct")) {
            if (id == "direct") key(KeyEvent.KEYCODE_DPAD_RIGHT)
            compose.onNodeWithTag("tv-movie-$id").assertIsFocused()
            key(KeyEvent.KEYCODE_DPAD_CENTER); await("tv-play")
            key(KeyEvent.KEYCODE_DPAD_CENTER); ready(); reveal()
            val start = seconds()
            compose.waitUntil(3500) { seconds() > start }
            // Auto-hide must hand focus back to the video surface for remote seeking.
            compose.waitUntil(8000) { compose.onAllNodesWithTag("tv-player-toggle").fetchSemanticsNodes().isEmpty() }
            key(KeyEvent.KEYCODE_DPAD_RIGHT)
            key(KeyEvent.KEYCODE_MEDIA_PAUSE)
            reveal()
            compose.onNodeWithTag("tv-player-toggle").assertTextContains("Play")
            key(KeyEvent.KEYCODE_DPAD_UP)
            compose.onNodeWithTag("tv-timeline").assertIsFocused()
            repeat(6) { key(KeyEvent.KEYCODE_DPAD_RIGHT) }
            ready()
            val pausedAt = seconds()
            key(KeyEvent.KEYCODE_DPAD_RIGHT); ready()
            compose.waitUntil(5000) { seconds() == pausedAt + 5 }
            key(KeyEvent.KEYCODE_DPAD_LEFT); ready()
            compose.waitUntil(5000) { seconds() == pausedAt }
            key(KeyEvent.KEYCODE_DPAD_DOWN)
            compose.onNodeWithTag("tv-player-toggle").assertIsFocused()
            repeat(3) { key(KeyEvent.KEYCODE_DPAD_RIGHT) }
            compose.onNodeWithTag("tv-info").assertIsFocused()
            key(KeyEvent.KEYCODE_DPAD_CENTER)
            compose.onNode(hasText("A generated test film.") and hasAnyAncestor(hasTestTag("tv-description"))).assertIsDisplayed()
            capture("tv-$id-description")
            key(KeyEvent.KEYCODE_BACK)
            compose.onNodeWithTag("tv-info").assertIsFocused()
            key(KeyEvent.KEYCODE_DPAD_RIGHT); key(KeyEvent.KEYCODE_DPAD_CENTER)
            if (id == "compatible") {
                key(KeyEvent.KEYCODE_DPAD_DOWN); key(KeyEvent.KEYCODE_DPAD_CENTER)
                ready()
                key(KeyEvent.KEYCODE_DPAD_CENTER)
            }
            compose.onNodeWithText("Subtitles off").assertExists()
            key(KeyEvent.KEYCODE_BACK)
            compose.waitUntil(10_000) {
                val position = json("/api/profile").getJSONObject("positions").optJSONObject(id)
                position != null && kotlin.math.abs(position.getDouble("seconds") - pausedAt) < 1.5
            }
            capture("tv-$id-controls")
            key(KeyEvent.KEYCODE_BACK); key(KeyEvent.KEYCODE_BACK)
            await("tv-movie-$id")
            compose.onNodeWithTag("tv-movie-$id").assertIsFocused()
            key(KeyEvent.KEYCODE_DPAD_CENTER); await("tv-play")
            compose.onNodeWithTag("tv-play").assertTextContains("Resume", substring = true)
            key(KeyEvent.KEYCODE_DPAD_CENTER); ready(); reveal()
            Assert.assertTrue("Playback must resume near the saved point", kotlin.math.abs(seconds() - pausedAt) < 4)
            key(KeyEvent.KEYCODE_MEDIA_PAUSE)
            reveal(); key(KeyEvent.KEYCODE_BACK); key(KeyEvent.KEYCODE_BACK)
            await("tv-movie-$id")
        }
    }
}
