package local.kego.betterwatch

import android.content.Context
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.platform.app.InstrumentationRegistry
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import org.junit.*

class LiveLibraryTest {
    @get:Rule val compose = createEmptyComposeRule()
    @Test fun playbackOverTailscale() {
        Assume.assumeTrue("Requires an explicitly connected personal device", InstrumentationRegistry.getArguments().getString("live") == "true")
        val base = "https://m1-asahi.taila125ad.ts.net:8449"
        val context = ApplicationProvider.getApplicationContext<Context>()
        context.getSharedPreferences("library", 0).edit().putString("server", base).commit()
        val client = OkHttpClient()
        fun json(path: String): JSONObject = client.newCall(Request.Builder().url(base + path).build()).execute().use { response ->
            Assert.assertTrue(response.isSuccessful); JSONObject(response.body!!.string())
        }
        val previous = json("/api/profile").getJSONObject("positions")
        val activity = ActivityScenario.launch(MainActivity::class.java)
        var movieId: String? = null
        try {
            val films = SemanticsMatcher("Film tile") { it.config.getOrNull(SemanticsProperties.TestTag)?.startsWith("movie-") == true }
            // Activity startup can briefly precede registration of its Compose root.
            compose.waitUntil(45_000) { compose.onAllNodes(films).fetchSemanticsNodes(atLeastOneRootRequired = false).isNotEmpty() }
            val tag = compose.onAllNodes(films).fetchSemanticsNodes().first().config[SemanticsProperties.TestTag]
            movieId = tag.removePrefix("movie-")
            compose.onNodeWithTag(tag).performClick()
            compose.waitUntil(10_000) { compose.onAllNodesWithTag("play-film").fetchSemanticsNodes().isNotEmpty() }
            compose.onNodeWithTag("play-film").performScrollTo().performClick()
            compose.waitUntil(10_000) { compose.onAllNodesWithTag("player-surface").fetchSemanticsNodes().isNotEmpty() }
            compose.waitUntil(90_000) { compose.onAllNodesWithTag("player-loading", useUnmergedTree = true).fetchSemanticsNodes().isEmpty() }
            compose.onNodeWithTag("player-error", useUnmergedTree = true).assertDoesNotExist()
            fun time(): String {
                if (compose.onAllNodesWithTag("playback-time", useUnmergedTree = true).fetchSemanticsNodes().isEmpty()) {
                    compose.onNodeWithTag("player-surface").performTouchInput { click(center) }
                    // Single taps resolve after the double-tap detection interval.
                    compose.waitUntil(5000) { compose.onAllNodesWithTag("playback-time", useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty() }
                }
                return compose.onNodeWithTag("playback-time", useUnmergedTree = true).fetchSemanticsNode().config[SemanticsProperties.Text].first().text
            }
            val start = time()
            compose.waitUntil(30_000) { time() != start }
            time(); compose.onNodeWithTag("player-toggle").performClick()
            compose.onNodeWithContentDescription("Back to library").performClick()
            compose.waitUntil(10_000) { compose.onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty() }
        } finally {
            activity.close()
            movieId?.let { id ->
                val current = json("/api/profile").getJSONObject("positions").optJSONObject(id)
                if (current != null) {
                    val restore = previous.optJSONObject(id) ?: JSONObject().put("seconds", 0).put("duration", current.getDouble("duration"))
                    client.newCall(Request.Builder().url("$base/api/profile/positions/$id").post(restore.toString().toRequestBody("application/json".toMediaType())).build()).execute().close()
                }
            }
        }
    }
}
