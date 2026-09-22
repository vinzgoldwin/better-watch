package local.kego.betterwatch

import android.content.Context
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import org.junit.*
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.*

/** Phone regression for the filtering source now shared with TV. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28], qualifiers = "w411dp-h891dp-port-mdpi")
@GraphicsMode(GraphicsMode.Mode.LEGACY)
@ConscryptMode(ConscryptMode.Mode.OFF)
class PhoneLibraryTest {
    @get:Rule val compose = createEmptyComposeRule()
    @Test fun sharedFilteringKeepsThePhoneSearchWorking() {
        ApplicationProvider.getApplicationContext<Context>().getSharedPreferences("library", 0).edit()
            .putString("server", "http://127.0.0.1:3399").commit()
        ActivityScenario.launch(MainActivity::class.java).use {
            compose.waitUntil(20_000) { compose.onAllNodesWithTag("movie-compatible").fetchSemanticsNodes(atLeastOneRootRequired = false).isNotEmpty() }
            compose.onNodeWithTag("film-search").performTextInput("Direct")
            compose.waitUntil(5000) { compose.onAllNodesWithTag("movie-compatible").fetchSemanticsNodes().isEmpty() }
            compose.onNodeWithTag("movie-direct").assertIsDisplayed()
            compose.onNodeWithTag("film-search").performTextReplacement("No matching film")
            compose.waitUntil(5000) { compose.onAllNodesWithText("No films found").fetchSemanticsNodes().isNotEmpty() }
        }
    }
}
