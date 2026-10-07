package local.kego.betterwatch

import android.content.Context
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.input.key.Key
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
@OptIn(ExperimentalTestApi::class)
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

    @Test fun pausedControlsHideAndQuickSeekingKeepsThemHidden() {
        ApplicationProvider.getApplicationContext<Context>().getSharedPreferences("library", 0).edit()
            .putString("server", "http://127.0.0.1:3399").commit()
        ActivityScenario.launch(MainActivity::class.java).use {
            compose.waitUntil(20_000) { compose.onAllNodesWithTag("movie-direct").fetchSemanticsNodes(atLeastOneRootRequired = false).isNotEmpty() }
            compose.onNodeWithTag("movie-direct").performClick()
            compose.onNodeWithTag("play-film").performClick()
            compose.waitUntil(10_000) { compose.onAllNodesWithTag("player-surface").fetchSemanticsNodes().isNotEmpty() }
            compose.waitUntil(10_000) { compose.onAllNodesWithText(" / 1:30", substring = true).fetchSemanticsNodes().isNotEmpty() }
            compose.waitUntil(10_000) { compose.onAllNodesWithContentDescription("Pause").fetchSemanticsNodes().isNotEmpty() }
            compose.onNodeWithTag("player-surface").performKeyInput { pressKey(Key.MediaPause) }
            compose.onNodeWithContentDescription("Play").assertExists()
            compose.mainClock.advanceTimeBy(3200)
            compose.onNodeWithTag("player-toggle").assertDoesNotExist()
            compose.onNodeWithTag("player-surface").performKeyInput { pressKey(Key.DirectionRight); pressKey(Key.DirectionLeft) }
            compose.onNodeWithTag("player-toggle").assertDoesNotExist()
            compose.onNodeWithTag("player-gestures").performTouchInput { doubleClick(centerRight) }
            compose.onNodeWithTag("player-toggle").assertDoesNotExist()
            compose.onNodeWithTag("player-gestures").performTouchInput { click(center) }
            compose.mainClock.advanceTimeBy(500)
            compose.onNodeWithTag("player-toggle").assertExists()
            compose.onNodeWithContentDescription("Movie Description").performClick()
            compose.mainClock.advanceTimeBy(3200)
            compose.onNodeWithTag("movie-description-text").assertExists()
        }
    }
}
