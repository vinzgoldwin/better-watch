package local.kego.betterwatch

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.ConscryptMode
import java.io.File

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28])
@ConscryptMode(ConscryptMode.Mode.OFF)
class LibraryContractTest {
    @Test fun sharedNativeLibraryContract() {
        val fixture = JSONObject(File("../../../tests/fixtures/native-library-contract.json").readText())
        val movies = fixture.getJSONArray("movies").let { rows -> (0 until rows.length()).map { Movie.parse(rows.getJSONObject(it)) } }
        val marks = fixture.getJSONObject("marks").let { rows -> rows.keys().asSequence().associateWith { Marks.parse(rows.getJSONObject(it)) } }
        val lists = mapOf("favorite" to SavedList.FAVORITE, "watchLater" to SavedList.LATER, "unwatched" to SavedList.UNWATCHED, "watched" to SavedList.WATCHED)
        val sorts = mapOf("folder" to Sort.FOLDER, "duration" to Sort.DURATION, "size" to Sort.SIZE, "modified" to Sort.MODIFIED, "releaseNewest" to Sort.RELEASE_NEW, "releaseOldest" to Sort.RELEASE_OLD)
        val cases = fixture.getJSONArray("cases")
        val failures = mutableListOf<String>()
        for (index in 0 until cases.length()) {
            val case = cases.getJSONObject(index); val q = case.getJSONObject("query")
            val query = FilmQuery(q.optString("folder"), q.optString("subfolder"), q.optString("search"), q.optString("artist"),
                q.optJSONArray("categories")?.strings()?.toSet() ?: emptySet(), lists[q.optString("list")] ?: SavedList.ALL, sorts[q.optString("sort")] ?: Sort.NAME)
            val expected = case.getJSONArray("expected").strings()
            val actual = query.apply(movies, marks).map { it.id }
            if (actual != expected) failures += "${case.getString("name")}: expected $expected, got $actual"
        }
        assertEquals(failures.joinToString("\n"), emptyList<String>(), failures)
    }
}
