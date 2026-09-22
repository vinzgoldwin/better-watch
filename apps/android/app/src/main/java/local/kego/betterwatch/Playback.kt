package local.kego.betterwatch

import android.content.Context
import androidx.compose.runtime.*
import androidx.media3.common.*
import androidx.media3.exoplayer.ExoPlayer
import kotlinx.coroutines.*
import org.json.JSONObject

data class AudioTrack(val id: Int, val title: String)
data class SubtitleTrack(val id: String, val title: String, val language: String, val url: String)
data class MediaDescription(val duration: Double, val audio: Int?, val direct: String?, val hls: String, val audioTracks: List<AudioTrack>, val subtitles: List<SubtitleTrack>, val notice: String?) {
    companion object {
        fun parse(j: JSONObject): MediaDescription {
            val audio = j.getJSONArray("audioTracks"); val subs = j.getJSONArray("subtitles")
            return MediaDescription(j.getDouble("duration"), if (j.isNull("audio")) null else j.getInt("audio"), if (j.isNull("direct")) null else j.getString("direct"), j.getString("hls"),
                (0 until audio.length()).map { val a = audio.getJSONObject(it); AudioTrack(a.getInt("id"), a.getString("title")) },
                (0 until subs.length()).map { val s = subs.getJSONObject(it); SubtitleTrack(s.getString("id"), s.getString("title"), s.getString("language"), s.getString("url")) },
                if (j.isNull("subtitleNotice")) null else j.getString("subtitleNotice"))
        }
    }
}

@androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
class PlaybackSession(context: Context, val movie: Movie, private val library: LibraryModel, private val scope: CoroutineScope) {
    val player = ExoPlayer.Builder(context).setSeekBackIncrementMs(5_000).setSeekForwardIncrementMs(5_000).build().apply {
        setAudioAttributes(AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build(), true)
        setHandleAudioBecomingNoisy(true)
    }
    var media by mutableStateOf<MediaDescription?>(null); private set
    var position by mutableDoubleStateOf(0.0); private set
    var paused by mutableStateOf(true); private set
    var loading by mutableStateOf(true); private set
    // TV preparation is complete only after a frame reaches the video surface.
    var videoReady by mutableStateOf(false); private set
    var error by mutableStateOf<String?>(null); private set
    var subtitle by mutableStateOf("off"); private set
    private var job: Job? = null
    private var timer: Job? = null
    private var fallback = false
    private var closed = false
    private var completed = false
    private var lastSave = 0L
    init {
        player.addListener(object : Player.Listener {
            override fun onRenderedFirstFrame() { videoReady = true }
            override fun onIsPlayingChanged(isPlaying: Boolean) { paused = !player.playWhenReady }
            override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) { paused = !playWhenReady; if (!playWhenReady) save() }
            override fun onPlaybackStateChanged(state: Int) {
                loading = state == Player.STATE_BUFFERING || state == Player.STATE_IDLE
                if (state == Player.STATE_ENDED) { completed = true; player.pause(); save() }
            }
            override fun onPlayerError(e: PlaybackException) {
                val description = media
                if (!fallback && description?.direct != null) { fallback = true; load(description.hls, position, player.playWhenReady) }
                else { loading = false; error = "Could not play this film. ${e.errorCodeName}" }
            }
        })
        // ExoPlayer must return to its application thread after network work.
        job = scope.launch(Dispatchers.Main.immediate) {
            try {
                library.refreshProfile()
                val result = MediaDescription.parse(library.request("/api/playback/${movie.id}"))
                ensureActive(); media = result
                subtitle = result.subtitles.firstOrNull { it.language in listOf("en", "eng") }?.id ?: "off"
                load(result.direct ?: result.hls, library.position(movie.id), true)
            } catch (e: Exception) { if (e is CancellationException) throw e; android.util.Log.e("BetterWatch", "Preparing playback failed", e); error = "Could not prepare playback. Check your connection."; loading = false }
        }
        timer = scope.launch(Dispatchers.Main.immediate) {
            while (isActive) {
                delay(250); position = player.currentPosition.coerceAtLeast(0) / 1000.0
                if (player.isPlaying && System.currentTimeMillis() - lastSave >= 15_000) save()
            }
        }
    }
    private fun load(path: String, start: Double, autoplay: Boolean) {
        if (closed) return
        loading = true; videoReady = false; error = null; completed = false
        val description = media ?: return
        val selected = description.subtitles.firstOrNull { it.id == subtitle }
        val subtitles = selected?.let { listOf(MediaItem.SubtitleConfiguration.Builder(android.net.Uri.parse(library.url(it.url))).setMimeType(MimeTypes.TEXT_VTT).setLanguage(it.language).setLabel(it.title).setSelectionFlags(C.SELECTION_FLAG_DEFAULT).build()) } ?: emptyList()
        player.setMediaItem(MediaItem.Builder().setUri(library.url(path)).setSubtitleConfigurations(subtitles).build(), (start * 1000).toLong())
        player.prepare(); player.playWhenReady = autoplay
    }
    fun toggle() { if (player.playWhenReady) player.pause() else { if (completed) seek(0.0); player.play() } }
    fun pause() { player.pause(); save() }
    fun seek(value: Double) {
        completed = false; position = value.coerceIn(0.0, media?.duration ?: 0.0)
        player.seekTo((position * 1000).toLong())
        // A paused seek can buffer without another play/pause event. Persist the
        // requested position now so another device can resume it immediately.
        media?.let { library.save(movie.id, position, it.duration); lastSave = System.currentTimeMillis() }
    }
    fun selectAudio(id: Int) {
        val start = position; val autoplay = player.playWhenReady; save(); job?.cancel()
        job = scope.launch(Dispatchers.Main.immediate) {
            try {
                val result = MediaDescription.parse(library.request("/api/playback/${movie.id}?audio=$id"))
                ensureActive(); media = result; fallback = false; load(result.direct ?: result.hls, start, autoplay)
            } catch (e: Exception) { if (e is CancellationException) throw e; error = "Could not change audio track." }
        }
    }
    fun selectSubtitle(id: String) { subtitle = id; val m = media ?: return; load(if (fallback) m.hls else m.direct ?: m.hls, position, player.playWhenReady) }
    private fun save(seconds: Double = player.currentPosition.coerceAtLeast(0) / 1000.0) {
        if (closed || loading || media == null) return
        library.save(movie.id, if (completed) 0.0 else seconds, media!!.duration); lastSave = System.currentTimeMillis()
    }
    fun close() { if (closed) return; pause(); closed = true; job?.cancel(); timer?.cancel(); player.release() }
}

fun timestamp(value: Double): String { val seconds = value.toInt().coerceAtLeast(0); return "%d:%02d".format(seconds / 60, seconds % 60) }
