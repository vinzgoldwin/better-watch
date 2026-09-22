package local.kego.betterwatch

import android.app.Application
import androidx.compose.runtime.*
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.*
import kotlinx.coroutines.channels.Channel
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

fun JSONArray.strings(): List<String> = (0 until length()).map { getString(it) }
private fun JSONObject.text(key: String) = if (isNull(key)) "" else optString(key)
data class Movie(val id: String, val title: String, val folder: String, val topFolder: String,
    val duration: Double, val size: Double, val modified: Double, val release: String,
    val height: Int, val description: String, val thumbnail: String,
    val categories: List<String>, val artists: List<String>, val english: Boolean) {
    val facts get() = listOf(release.take(4), if (duration > 0) "${(duration / 60).toInt().coerceAtLeast(1)}m" else "", if (height > 0) "${height}p" else "").filter { it.isNotEmpty() }.joinToString(" · ")
    companion object {
        fun parse(j: JSONObject) = Movie(j.getString("id"), j.getString("title").replace(Regex("\\s*\\[HD]\\s*$"), ""), j.optString("folder"), j.optString("topFolder"),
            j.optDouble("duration", 0.0), j.optDouble("size", 0.0), j.optDouble("modified", 0.0), j.text("releaseDate"), j.optInt("height"), j.text("description"), j.text("thumbnail"),
            j.optJSONArray("categories")?.strings() ?: emptyList(), j.optJSONArray("artists")?.strings() ?: emptyList(), j.optBoolean("hasEnglishSub"))
    }
}
data class Marks(val favorite: Boolean = false, val watchLater: Boolean = false, val watched: Boolean = false) {
    fun get(field: String) = when (field) { "favorite" -> favorite; "watchLater" -> watchLater; else -> watched }
    fun toggled(field: String) = when (field) { "favorite" -> copy(favorite = !favorite); "watchLater" -> copy(watchLater = !watchLater); else -> copy(watched = !watched) }
    companion object { fun parse(j: JSONObject) = Marks(j.optBoolean("favorite"), j.optBoolean("watchLater"), j.optBoolean("watched")) }
}
data class Position(val seconds: Double, val duration: Double) {
    val resume get() = if (seconds >= 5 && seconds < duration - 10) seconds else 0.0
}
enum class SavedList(val label: String) { ALL("All Films"), FAVORITE("Favorites"), LATER("Watch Later"), UNWATCHED("Unwatched"), WATCHED("Watched") }
enum class Sort(val label: String) { NAME("Name"), FOLDER("Folder"), DURATION("Duration"), SIZE("Size"), MODIFIED("Newest"), RELEASE_NEW("Newest release"), RELEASE_OLD("Oldest release") }

class LibraryModel(application: Application) : AndroidViewModel(application) {
    private val preferences = application.getSharedPreferences("library", 0)
    var server by mutableStateOf(preferences.getString("server", null) ?: "https://m1-asahi.taila125ad.ts.net:8449"); private set
    val http = OkHttpClient.Builder().connectTimeout(15, TimeUnit.SECONDS).readTimeout(90, TimeUnit.SECONDS).build()
    private val eventsHttp = http.newBuilder().readTimeout(0, TimeUnit.SECONDS).build()
    var movies by mutableStateOf(emptyList<Movie>()); private set
    var marks by mutableStateOf<Map<String, Marks>>(emptyMap()); private set
    // Progress events never invalidate the gallery's Compose state.
    private var positions = mutableMapOf<String, Position>()
    var directories by mutableStateOf(emptyList<String>()); private set
    var loading by mutableStateOf(false); private set
    var error by mutableStateOf<String?>(null)
    var list by mutableStateOf(SavedList.ALL)
    var folder by mutableStateOf("")
    var subfolder by mutableStateOf("")
    var search by mutableStateOf("")
    var category by mutableStateOf<Set<String>>(emptySet())
    var sort by mutableStateOf(Sort.NAME)
    var artist by mutableStateOf("")
    var artistsVisible by mutableStateOf(false)
    var selected by mutableStateOf<Movie?>(null)
    var playing by mutableStateOf<Movie?>(null)
    private var events: Job? = null
    private var eventsCall: Call? = null
    private data class Write(val base: String, val path: String, val body: JSONObject?, val completion: CompletableDeferred<Unit>? = null)
    private val writes = Channel<Write>(Channel.UNLIMITED)
    init {
        viewModelScope.launch {
            for (write in writes) {
                try { if (write.body != null) request(write.path, write.body, write.base) }
                catch (e: Exception) { if (e is CancellationException) throw e; error = "Could not sync with your other devices. Reconnect and try again." }
                finally { write.completion?.complete(Unit) }
            }
        }
    }
    fun url(path: String) = server.trimEnd('/') + "/" + path.trimStart('/')
    suspend fun request(path: String, body: JSONObject? = null, base: String = server): JSONObject = withContext(Dispatchers.IO) {
        val request = Request.Builder().url(base.trimEnd('/') + "/" + path.trimStart('/')).apply {
            if (body != null) post(body.toString().toRequestBody("application/json".toMediaType()))
        }.build()
        http.newCall(request).execute().use {
            if (!it.isSuccessful) throw IOException("Server returned ${it.code}")
            JSONObject(it.body?.string() ?: throw IOException("Empty response"))
        }
    }
    fun configure(address: String) {
        val normalized = address.trim().trimEnd('/')
        require(normalized.startsWith("https://") || normalized.startsWith("http://"))
        disconnect(); server = normalized; preferences.edit().putString("server", normalized).apply()
        movies = emptyList(); marks = emptyMap(); positions.clear(); connect()
    }
    fun connect() {
        if (loading) return
        viewModelScope.launch {
            loading = true; error = null
            try {
                val library = request("/api/library")
                val parsed = withContext(Dispatchers.Default) { val data = library.getJSONArray("movies"); (0 until data.length()).map { Movie.parse(data.getJSONObject(it)) } }
                movies = parsed; directories = library.optJSONArray("directories")?.strings() ?: emptyList()
                refreshProfile(); subscribe()
            } catch (e: Exception) { if (e is CancellationException) throw e; error = "Could not connect. Check Tailscale and your server." }
            finally { loading = false }
        }
    }
    private fun snapshot(j: JSONObject) {
        val data = j.getJSONObject("marks")
        marks = data.keys().asSequence().associateWith { Marks.parse(data.getJSONObject(it)) }
        val progress = j.getJSONObject("positions")
        positions = progress.keys().asSequence().associateWith { val p = progress.getJSONObject(it); Position(p.getDouble("seconds"), p.getDouble("duration")) }.toMutableMap()
    }
    suspend fun flush() { val done = CompletableDeferred<Unit>(); writes.send(Write(server, "", null, done)); done.await() }
    suspend fun refreshProfile() { flush(); snapshot(request("/api/profile")) }
    fun position(id: String) = positions[id]?.resume ?: 0.0
    fun toggle(movie: Movie, field: String) {
        val next = (marks[movie.id] ?: Marks()).toggled(field)
        marks = marks + (movie.id to next)
        writes.trySend(Write(server, "/api/profile/marks/${movie.id}", JSONObject().put(field, next.get(field))))
    }
    fun save(id: String, seconds: Double, duration: Double) {
        if (!seconds.isFinite() || !duration.isFinite() || duration <= 0) return
        val position = Position(seconds.coerceIn(0.0, duration), duration); positions[id] = position
        writes.trySend(Write(server, "/api/profile/positions/$id", JSONObject().put("seconds", position.seconds).put("duration", duration)))
    }
    private fun subscribe() {
        if (events?.isActive == true) return
        events = viewModelScope.launch(Dispatchers.IO) {
            while (isActive) {
                try {
                    val call = eventsHttp.newCall(Request.Builder().url(url("/api/profile/events")).build()); eventsCall = call
                    call.execute().use { response ->
                        if (!response.isSuccessful) throw IOException("Events unavailable")
                        val source = response.body!!.source()
                        while (isActive) {
                            val line = source.readUtf8Line() ?: break
                            if (!line.startsWith("data: ")) continue
                            val event = JSONObject(line.drop(6))
                            withContext(Dispatchers.Main) {
                                when (event.optString("type")) {
                                    "snapshot" -> snapshot(event)
                                    "marks" -> { marks = marks + (event.getString("id") to Marks.parse(event.getJSONObject("value"))) }
                                    "positions" -> { val p = event.getJSONObject("value"); positions[event.getString("id")] = Position(p.getDouble("seconds"), p.getDouble("duration")) }
                                }
                            }
                        }
                    }
                } catch (e: Exception) { if (!isActive) return@launch }
                delay(5000)
            }
        }
    }
    fun disconnect() { eventsCall?.cancel(); eventsCall = null; events?.cancel(); events = null }
    fun choose(value: SavedList) { list = value; folder = ""; subfolder = ""; artist = ""; category = emptySet(); search = ""; artistsVisible = false }
    fun chooseFolder(value: String) { folder = value; subfolder = ""; artist = ""; category = emptySet(); artistsVisible = false }
    override fun onCleared() { disconnect(); writes.close() }
}

// Phone and TV use the same filtering rules; large libraries stay off the UI thread.
@Composable
fun rememberFilteredMovies(model: LibraryModel): List<Movie> {
    val movies = model.movies; val marks = model.marks; val search = model.search; val folder = model.folder; val subfolder = model.subfolder; val artist = model.artist; val categories = model.category; val list = model.list; val sort = model.sort
    val filtered by produceState(emptyList<Movie>(), movies, marks, search, folder, subfolder, artist, categories, list, sort) {
        delay(120)
        value = withContext(Dispatchers.Default) {
            movies.filter { m ->
                val mark = marks[m.id] ?: Marks()
                (folder.isEmpty() || m.topFolder == folder) && (subfolder.isEmpty() || m.folder == subfolder || m.folder.startsWith("$subfolder/")) &&
                (artist.isEmpty() || artist in m.artists) && (search.isBlank() || m.title.contains(search.trim(), true) || m.folder.contains(search.trim(), true)) &&
                (categories.isEmpty() || m.categories.any { it in categories }) &&
                when (list) { SavedList.ALL -> true; SavedList.FAVORITE -> mark.favorite; SavedList.LATER -> mark.watchLater; SavedList.WATCHED -> mark.watched; SavedList.UNWATCHED -> !mark.watched }
            }.sortedWith(when (sort) {
                Sort.NAME -> compareBy(String.CASE_INSENSITIVE_ORDER) { it.title }
                Sort.FOLDER -> compareBy<Movie> { it.folder }.thenBy { it.title }
                Sort.DURATION -> compareByDescending<Movie> { it.duration }.thenBy { it.title }
                Sort.SIZE -> compareByDescending<Movie> { it.size }.thenBy { it.title }
                Sort.MODIFIED -> compareByDescending<Movie> { it.modified }.thenBy { it.title }
                Sort.RELEASE_NEW -> compareByDescending<Movie> { it.release }.thenBy { it.title }
                Sort.RELEASE_OLD -> compareBy<Movie> { it.release.ifEmpty { "9999" } }.thenBy { it.title }
            })
        }
    }
    return filtered
}
