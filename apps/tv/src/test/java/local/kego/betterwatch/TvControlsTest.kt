package local.kego.betterwatch

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import org.junit.*
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.*

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28], qualifiers = "w960dp-h540dp-land-television-mdpi-notouch")
@GraphicsMode(GraphicsMode.Mode.LEGACY)
@ConscryptMode(ConscryptMode.Mode.OFF)
@OptIn(ExperimentalTestApi::class)
class TvControlsTest {
    @get:Rule val compose = createComposeRule()
    private fun movie(description: String) = Movie("test", "Test film", "Cinema", "Cinema", 90.0, 1.0, 0.0, "2025", 720,
        description, "", emptyList(), emptyList(), false)

    @Test fun remoteTimelineSeeksExactlyFiveSecondsAndLeavesByArrowDown() {
        var seconds by mutableDoubleStateOf(30.0)
        var paused by mutableStateOf(false)
        compose.setContent {
            MaterialTheme {
                val play = remember { FocusRequester() }
                Column(Modifier.fillMaxSize()) {
                    TvTimeline(seconds, 90.0) { seconds = (seconds + it).coerceIn(0.0, 90.0) }
                    TvAction(if (paused) "Play" else "Pause", { paused = !paused }, Modifier.focusRequester(play))
                }
                LaunchedEffect(Unit) { play.requestFocus() }
            }
        }
        compose.onRoot().performKeyInput { pressKey(Key.DirectionUp); pressKey(Key.DirectionRight) }
        Assert.assertEquals(35.0, seconds, 0.0)
        compose.onRoot().performKeyInput { pressKey(Key.DirectionLeft) }
        Assert.assertEquals(30.0, seconds, 0.0)
        compose.onRoot().performKeyInput { pressKey(Key.DirectionDown); pressKey(Key.DirectionCenter) }
        compose.onNodeWithText("Play").assertIsFocused()
        compose.onRoot().performKeyInput { pressKey(Key.DirectionCenter) }
        compose.onNodeWithText("Pause").assertIsFocused()
    }

    @Test fun missingDescriptionStillOpensAndClosesWithTheRemote() {
        var closed = false
        compose.setContent { MaterialTheme { TvDescription(movie("")) { closed = true } } }
        compose.onNodeWithText("No description available.").assertExists()
        compose.onNodeWithTag("tv-description-close").assertIsFocused().performKeyInput { pressKey(Key.DirectionCenter) }
        Assert.assertTrue(closed)
    }

    @Test fun longDescriptionCanScrollWithTheRemote() {
        compose.setContent { MaterialTheme { TvDescription(movie((1..100).joinToString("\n") { "Description line $it" })) {} } }
        compose.onNodeWithTag("tv-description-close").performKeyInput { pressKey(Key.DirectionUp) }
        compose.onNodeWithTag("tv-description").assertIsFocused()
        val before = compose.onNodeWithTag("tv-description").fetchSemanticsNode().config[androidx.compose.ui.semantics.SemanticsProperties.VerticalScrollAxisRange].value()
        compose.onNodeWithTag("tv-description").performKeyInput { repeat(4) { pressKey(Key.DirectionDown) } }
        val after = compose.onNodeWithTag("tv-description").fetchSemanticsNode().config[androidx.compose.ui.semantics.SemanticsProperties.VerticalScrollAxisRange].value()
        Assert.assertTrue("D-pad must scroll the description", after > before)
    }
}
