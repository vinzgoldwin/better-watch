package local.kego.betterwatch

import android.icu.text.Collator
import android.icu.text.RuleBasedCollator
import java.text.Normalizer
import java.util.Locale

private val accents = Regex("\\p{M}+")
private fun String.searchKey() = Normalizer.normalize(this, Normalizer.Form.NFD).replace(accents, "").lowercase(Locale.ROOT)
fun naturalOrder(): Comparator<String> = (Collator.getInstance() as RuleBasedCollator).apply {
    strength = Collator.PRIMARY
    numericCollation = true
}.let { collator -> Comparator { a, b -> collator.compare(a, b) } }

// Mirrors the FilmQuery contract shared by Mac and iPad.
data class FilmQuery(
    val folder: String = "", val subfolder: String = "", val search: String = "", val artist: String = "",
    val categories: Set<String> = emptySet(), val list: SavedList = SavedList.ALL, val sort: Sort = Sort.NAME
) {
    fun matchesCategories(movie: Movie) = categories.isEmpty() ||
        if (movie.categories.isEmpty()) "__uncategorized" in categories else movie.categories.any { it.lowercase(Locale.ROOT) in categories }

    fun apply(movies: List<Movie>, marks: Map<String, Marks>, positions: Map<String, Position> = emptyMap()): List<Movie> {
        val text = search.trim().searchKey()
        val natural = naturalOrder()
        val titles = compareBy<Movie, String>(natural) { it.title }.thenBy { it.id }
        val order = when (sort) {
            Sort.NAME -> titles
            Sort.FOLDER -> compareBy<Movie, String>(natural) { it.folder }.then(titles)
            Sort.DURATION -> compareByDescending<Movie> { it.duration }.then(titles)
            Sort.SIZE -> compareByDescending<Movie> { it.size }.then(titles)
            Sort.MODIFIED -> compareByDescending<Movie> { it.modified }.then(titles)
            Sort.RELEASE_NEW -> compareBy<Movie> { it.release.isEmpty() }.thenByDescending { it.release }.then(titles)
            Sort.RELEASE_OLD -> compareBy<Movie> { it.release.isEmpty() }.thenBy { it.release }.then(titles)
        }
        return movies.filter { m ->
            val mark = marks[m.id] ?: Marks()
            (folder.isEmpty() || m.topFolder == folder) && (subfolder.isEmpty() || m.folder == subfolder || m.folder.startsWith("$subfolder/")) &&
            (artist.isEmpty() || artist in m.artists) && (text.isEmpty() || m.title.searchKey().contains(text) || m.relativePath.searchKey().contains(text)) &&
            matchesCategories(m) &&
            when (list) { SavedList.ALL -> true; SavedList.CONTINUING -> !mark.watched && (positions[m.id]?.resume ?: 0.0) > 0; SavedList.FAVORITE -> mark.favorite; SavedList.LATER -> mark.watchLater; SavedList.WATCHED -> mark.watched; SavedList.UNWATCHED -> !mark.watched }
        }.sortedWith(order)
    }
}

data class LibraryResults(val movies: List<Movie> = emptyList(), val categories: List<Pair<String, String>> = emptyList(), val query: FilmQuery? = null, val ready: Boolean = false)

// Input is the current filtered view. Reroll repeats only when it is the sole match.
fun pickMovie(movies: List<Movie>, marks: Map<String, Marks>, excluding: String? = null): Movie? {
    val candidates = movies.filter { marks[it.id]?.watched != true }
    val alternatives = candidates.filter { it.id != excluding }
    return alternatives.ifEmpty { candidates }.randomOrNull()
}

fun categoryOptions(movies: List<Movie>): List<Pair<String, String>> = movies
    .flatMap { it.categories.ifEmpty { listOf("__uncategorized") } }
    .distinctBy { it.lowercase(Locale.ROOT) }
    .map { it.lowercase(Locale.ROOT) to if (it == "__uncategorized") "Uncategorized" else it }
    .sortedWith(compareBy(naturalOrder()) { it.second })
