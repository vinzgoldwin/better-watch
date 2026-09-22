package local.kego.betterwatch

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.lazy.grid.*
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.*
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.key.*
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.media3.ui.PlayerView
import coil.compose.AsyncImage
import coil.request.ImageRequest
import kotlinx.coroutines.*

private val TvBackground = Color(0xFF18191B)
private val TvSurface = Color(0xFF222325)
private val TvSecondary = Color(0xFFB6B6BC)

class TvActivity : ComponentActivity() {
    private val model: LibraryModel by viewModels()
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.getInsetsController(window, window.decorView).hide(WindowInsetsCompat.Type.systemBars())
        setContent {
            MaterialTheme(colorScheme = darkColorScheme(primary = Coral, onPrimary = Color.Black, background = TvBackground, surface = TvSurface)) {
                CompositionLocalProvider(LocalContentColor provides Color.White) { TvApp(model) }
            }
        }
    }
    override fun onStart() { super.onStart(); model.connect() }
    override fun onStop() { model.disconnect(); super.onStop() }
}

/** One focus treatment for every remote action, including marks and dialog rows. */
@Composable
internal fun TvAction(label: String, onClick: () -> Unit, modifier: Modifier = Modifier,
    selected: Boolean = false, icon: ImageVector? = null) {
    var focused by remember { mutableStateOf(false) }
    Row(modifier.onFocusChanged { focused = it.isFocused }
        .background(if (focused) Color(0xFF3D3232) else Color.Transparent)
        .border(2.dp, if (focused) Coral else Color.Transparent)
        .clickable(role = Role.Button, onClick = onClick)
        .semantics { this.selected = selected }
        .padding(horizontal = 12.dp, vertical = 11.dp), verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        icon?.let { Icon(it, null, Modifier.size(22.dp), tint = if (focused || selected) Coral else Color.White) }
        Text((if (selected) "✓ " else "") + label, color = if (focused || selected) Coral else Color.White,
            fontSize = 16.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
internal fun TvApp(model: LibraryModel) {
    var settings by remember { mutableStateOf(false) }
    var focusedMovie by remember { mutableStateOf<String?>(null) }
    val grid = rememberLazyGridState()
    val sidebar = remember { FocusRequester() }
    val films = rememberFilteredMovies(model)
    Box(Modifier.fillMaxSize().background(TvBackground).testTag("tv-app")) {
        when {
            model.playing != null -> TvPlayer(model, model.playing!!) { model.playing = null }
            model.selected != null -> TvDetails(model, model.selected!!, { model.selected = null }) { fromStart ->
                val movie = model.selected!!
                if (fromStart) model.save(movie.id, 0.0, movie.duration)
                model.selected = null; model.playing = movie
            }
            else -> TvLibrary(model, films, grid, sidebar, focusedMovie, { focusedMovie = it }, { settings = true })
        }
    }
    if (settings) TvServerSettings(model) { settings = false }
    model.error?.let { error ->
        TvDialog("Connection", { model.error = null }) {
            Text(error, fontSize = 18.sp)
            val retry = remember { FocusRequester() }
            TvAction("Reconnect", { model.error = null; model.connect() }, Modifier.focusRequester(retry).testTag("tv-reconnect"))
            TvAction("Server", { model.error = null; settings = true })
            TvAction("Close", { model.error = null })
            LaunchedEffect(Unit) { retry.requestFocus() }
        }
    }
}

@Composable
private fun TvLibrary(model: LibraryModel, films: List<Movie>, grid: LazyGridState, sidebar: FocusRequester,
    focusedId: String?, rememberFocus: (String) -> Unit, settings: () -> Unit) {
    val focusFilm = remember { FocusRequester() }
    val searchFocus = remember { FocusRequester() }
    var sideFocused by remember { mutableStateOf(false) }
    var panel by remember { mutableStateOf<String?>(null) }
    var focusGeneration by remember { mutableIntStateOf(0) }
    val sideList = rememberLazyListState()
    val scope = rememberCoroutineScope()
    fun focusSidebar() {
        scope.launch {
            // The All Films row may have been recycled after browsing many folders.
            sideList.scrollToItem(0)
            withFrameNanos { }
            sidebar.requestFocus()
        }
    }
    val folders = remember(model.movies) { model.movies.map { it.topFolder }.distinct().sorted() }
    val artists = remember(model.movies) { model.movies.flatMap { it.artists }.distinct().sorted() }
    val categories = remember(model.movies) { model.movies.flatMap { it.categories }.distinct().sorted() }
    val chosen = films.firstOrNull { it.id == focusedId } ?: films.firstOrNull()
    // Retain the lazy-grid state and stable movie ID across details and playback.
    // Filter updates return to a real item even if a removed favorite disappeared.
    LaunchedEffect(films, focusGeneration) {
        if (model.artistsVisible || films.isEmpty()) { searchFocus.requestFocus(); return@LaunchedEffect }
        val index = films.indexOfFirst { it.id == focusedId }.coerceAtLeast(0)
        withFrameNanos { }
        if (grid.layoutInfo.visibleItemsInfo.none { it.key == films[index].id }) {
            grid.scrollToItem(index)
            withFrameNanos { }
        }
        focusFilm.requestFocus()
    }
    BackHandler(!sideFocused) { focusSidebar() }
    Row(Modifier.fillMaxSize().padding(horizontal = 24.dp, vertical = 20.dp)) {
        Column(Modifier.width(164.dp).fillMaxHeight().background(TvSurface)
            .onFocusChanged { sideFocused = it.hasFocus }.padding(8.dp)) {
            Row(Modifier.padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                Image(painterResource(R.drawable.ic_launcher), null, Modifier.size(32.dp))
                Text("Better Watch", fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
            }
            LazyColumn(Modifier.weight(1f), state = sideList, verticalArrangement = Arrangement.spacedBy(2.dp)) {
            items(SavedList.entries) { list ->
                TvAction(list.label, { model.choose(list); focusGeneration++ }, Modifier.fillMaxWidth()
                    .then(if (list == SavedList.ALL) Modifier.focusRequester(sidebar) else Modifier)
                    .focusProperties { right = if (films.isEmpty() || model.artistsVisible) searchFocus else focusFilm }
                    .testTag("tv-nav-${list.name}"), selected = model.list == list && model.folder.isEmpty() && !model.artistsVisible)
            }
            item { TvAction("Artists", { model.choose(SavedList.ALL); model.artistsVisible = true }, Modifier.fillMaxWidth(), selected = model.artistsVisible) }
            item { Text("Folders", Modifier.padding(start = 12.dp, top = 20.dp, bottom = 6.dp), color = TvSecondary, fontSize = 14.sp) }
            items(folders, key = { "folder:$it" }) { folder ->
                TvAction(folder.ifBlank { "Library root" }, { model.choose(SavedList.ALL); model.chooseFolder(folder); focusGeneration++ }, Modifier.fillMaxWidth(), selected = model.folder == folder && folder.isNotEmpty())
            }
            }
            TvAction("Server", settings, Modifier.padding(top = 8.dp).fillMaxWidth().testTag("tv-server"))
        }
        Column(Modifier.weight(1f).fillMaxHeight().padding(start = 26.dp)) {
            Row(Modifier.fillMaxWidth().padding(bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(if (model.artistsVisible) "Artists" else model.artist.ifEmpty { model.folder.ifEmpty { model.list.label } },
                    Modifier.weight(1f), fontSize = 28.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text("${films.size} films", color = TvSecondary, fontSize = 14.sp)
            }
            Row(Modifier.fillMaxWidth().padding(bottom = 12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                TvAction(model.search.ifBlank { if (model.artistsVisible) "Search artists" else "Search films" }, { panel = "search" },
                    Modifier.weight(1f).focusRequester(searchFocus).testTag("tv-search"), icon = Icons.Outlined.Search)
                if (!model.artistsVisible) {
                    TvAction(if (model.category.isEmpty()) "All categories" else "${model.category.size} categories", { panel = "categories" }, Modifier.testTag("tv-categories"))
                    TvAction(model.sort.label, { panel = "sort" }, Modifier.testTag("tv-sort"))
                    if (model.folder.isNotEmpty()) TvAction("Subfolders", { panel = "folders" })
                }
            }
            if (model.artistsVisible) {
                LazyColumn(Modifier.weight(1f)) {
                    items(artists.filter { it.contains(model.search, true) }, key = { it }) { name ->
                        TvAction(name, { model.artist = name; model.search = ""; model.artistsVisible = false; focusGeneration++ }, Modifier.fillMaxWidth())
                    }
                }
            } else if (films.isEmpty()) {
                Text(if (model.loading) "Connecting to your library…" else "No films found", Modifier.weight(1f).padding(top = 24.dp), color = TvSecondary, fontSize = 18.sp)
            } else {
                LazyVerticalGrid(GridCells.Fixed(4), state = grid, modifier = Modifier.weight(1f).testTag("tv-grid"),
                    contentPadding = PaddingValues(5.dp), horizontalArrangement = Arrangement.spacedBy(16.dp), verticalArrangement = Arrangement.spacedBy(22.dp)) {
                    itemsIndexed(films, key = { _, movie -> movie.id }) { index, movie ->
                        var focused by remember { mutableStateOf(false) }
                        Column(Modifier.then(if (movie.id == chosen?.id) Modifier.focusRequester(focusFilm) else Modifier)
                            .onPreviewKeyEvent {
                                if (index % 4 == 0 && it.key == Key.DirectionLeft && it.type == KeyEventType.KeyDown) { focusSidebar(); true } else false
                            }
                            .onFocusChanged { focused = it.isFocused; if (it.isFocused) rememberFocus(movie.id) }
                            .border(2.dp, if (focused) Coral else Color.Transparent)
                            .clickable(role = Role.Button) { rememberFocus(movie.id); model.selected = movie }
                            .padding(4.dp).testTag("tv-movie-${movie.id}")) {
                            TvCover(model, movie, Modifier.fillMaxWidth().aspectRatio(16f / 9))
                            Text(movie.title, Modifier.padding(top = 8.dp), color = if (focused) Coral else Color.White,
                                fontSize = 15.sp, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            Text(movie.facts, Modifier.padding(top = 3.dp), color = TvSecondary, fontSize = 12.sp, maxLines = 1)
                        }
                    }
                }
                chosen?.let { movie ->
                    HorizontalDivider(Modifier.padding(top = 12.dp, bottom = 10.dp), color = Color(0xFF414145))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(movie.title, Modifier.weight(1f), fontSize = 20.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(movie.facts, fontSize = 14.sp, color = TvSecondary)
                    }
                    Text(movie.description.ifBlank { "No description available." }, Modifier.padding(top = 6.dp), fontSize = 14.sp, color = TvSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text("OK  Details     Back  Collections", Modifier.padding(top = 10.dp), fontSize = 12.sp, color = TvSecondary)
                }
            }
        }
    }
    when (panel) {
        "search" -> TvInput(if (model.artistsVisible) "Search artists" else "Search films", model.search, "Search", { panel = null }) { model.search = it; panel = null; focusGeneration++ }
        "sort" -> TvChoices("Sort", Sort.entries.map { it.name to it.label }, setOf(model.sort.name), { panel = null }) { model.sort = Sort.valueOf(it); panel = null; focusGeneration++ }
        "categories" -> TvChoices("Categories", listOf("" to "All categories") + categories.map { it to it }, model.category, { panel = null }) {
            model.category = if (it.isEmpty()) emptySet() else if (it in model.category) model.category - it else model.category + it
        }
        "folders" -> TvChoices("Subfolders", listOf("" to "All subfolders") + model.directories.filter { it.startsWith(model.folder + "/") }.map { it to it.removePrefix(model.folder + "/") }, setOf(model.subfolder), { panel = null }) { model.subfolder = it; panel = null; focusGeneration++ }
    }
}

@Composable
private fun TvCover(model: LibraryModel, movie: Movie, modifier: Modifier) {
    Box(modifier.background(TvSurface), contentAlignment = Alignment.Center) {
        Icon(Icons.Outlined.Movie, null, Modifier.size(36.dp), tint = TvSecondary)
        if (movie.thumbnail.isNotBlank()) AsyncImage(ImageRequest.Builder(LocalContext.current).data(model.url(movie.thumbnail)).crossfade(false).build(),
            null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
    }
}

@Composable
private fun TvDetails(model: LibraryModel, movie: Movie, close: () -> Unit, play: (Boolean) -> Unit) {
    val resume = remember { FocusRequester() }
    val seconds = model.position(movie.id)
    BackHandler(onBack = close)
    LaunchedEffect(Unit) { resume.requestFocus() }
    Row(Modifier.fillMaxSize().padding(36.dp), horizontalArrangement = Arrangement.spacedBy(32.dp)) {
        Column(Modifier.weight(0.9f).verticalScroll(rememberScrollState())) {
            TvCover(model, movie, Modifier.fillMaxWidth().aspectRatio(16f / 9))
            Spacer(Modifier.height(18.dp))
            TvAction(if (seconds > 0) "Resume ${timestamp(seconds)}" else "Play", { play(false) },
                Modifier.fillMaxWidth().focusRequester(resume).testTag("tv-play"), icon = Icons.Outlined.PlayArrow)
            if (seconds > 0) TvAction("Play from start", { play(true) }, Modifier.fillMaxWidth().testTag("tv-play-start"))
            listOf("favorite" to "Favorite", "watchLater" to "Watch Later", "watched" to "Watched").forEach { (field, label) ->
                TvAction(label, { model.toggle(movie, field) }, Modifier.fillMaxWidth().testTag("tv-mark-$field"), selected = (model.marks[movie.id] ?: Marks()).get(field))
            }
        }
        Column(Modifier.weight(1.1f).fillMaxHeight()) {
            Text(movie.title, fontSize = 30.sp, fontWeight = FontWeight.Bold, maxLines = 3, overflow = TextOverflow.Ellipsis)
            Text(movie.facts, Modifier.padding(vertical = 14.dp), color = TvSecondary, fontSize = 17.sp)
            TvScrollableText(movie.description.ifBlank { "No description available." } +
                if (movie.artists.isNotEmpty()) "\n\nArtists\n${movie.artists.joinToString(" · ")}" else "",
                Modifier.weight(1f).testTag("tv-detail-description"))
            Text("Back  Library", Modifier.padding(top = 12.dp), color = TvSecondary, fontSize = 14.sp)
        }
    }
}

@Composable
internal fun TvScrollableText(text: String, modifier: Modifier = Modifier) {
    val scroll = rememberScrollState(); val scope = rememberCoroutineScope()
    var focused by remember { mutableStateOf(false) }
    Box(modifier.onFocusChanged { focused = it.isFocused }
        .border(2.dp, if (focused) Coral else Color.Transparent)
        .onKeyEvent { event ->
            if (event.type == KeyEventType.KeyDown && event.key in listOf(Key.DirectionDown, Key.DirectionUp)) {
                val down = event.key == Key.DirectionDown
                if ((down && scroll.canScrollForward) || (!down && scroll.canScrollBackward)) {
                    scope.launch { scroll.scrollTo((scroll.value + if (down) 90 else -90).coerceIn(0, scroll.maxValue)) }; true
                } else false
            } else false
        }.focusable().padding(10.dp).verticalScroll(scroll)) {
        Text(text, fontSize = 18.sp, lineHeight = 28.sp)
    }
}

@Composable
private fun TvDialog(title: String, close: () -> Unit, alignEnd: Boolean = false, content: @Composable ColumnScope.() -> Unit) {
    Dialog(onDismissRequest = close, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        CompositionLocalProvider(LocalContentColor provides Color.White) {
            Box(if (alignEnd) Modifier.fillMaxSize() else Modifier, contentAlignment = Alignment.CenterEnd) {
                Column(Modifier.width(if (alignEnd) 370.dp else 540.dp).fillMaxHeight(if (alignEnd) 1f else 0.88f).background(TvSurface).padding(26.dp).testTag("tv-dialog"), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(title, fontSize = 24.sp, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    content()
                }
            }
        }
    }
}

@Composable
private fun TvChoices(title: String, choices: List<Pair<String, String>>, selected: Set<String>, close: () -> Unit, notice: String? = null, choose: (String) -> Unit) {
    val first = remember { FocusRequester() }
    TvDialog(title, close) {
        notice?.let { Text(it, fontSize = 14.sp, color = TvSecondary) }
        LazyColumn(Modifier.weight(1f)) {
            items(choices.size) { i ->
                val (value, label) = choices[i]
                TvAction(label, { choose(value) }, Modifier.fillMaxWidth().then(if (i == 0) Modifier.focusRequester(first) else Modifier).testTag("tv-choice-$value"), selected = value in selected)
                if (i == 0) LaunchedEffect(Unit) { first.requestFocus() }
            }
        }
        TvAction("Done", close, Modifier.testTag("tv-choices-done"))
    }
}

@Composable
private fun TvInput(title: String, initial: String, action: String, close: () -> Unit, submit: (String) -> Unit) {
    var text by remember { mutableStateOf(initial) }
    val field = remember { FocusRequester() }
    val confirm = remember { FocusRequester() }
    val keyboard = LocalSoftwareKeyboardController.current
    val send = { keyboard?.hide(); submit(text) }
    TvDialog(title, close) {
        OutlinedTextField(text, { text = it }, Modifier.fillMaxWidth().focusRequester(field).onPreviewKeyEvent {
            if (it.key == Key.DirectionDown && it.type == KeyEventType.KeyDown) { keyboard?.hide(); confirm.requestFocus(); true } else false
        }.testTag("tv-input"), singleLine = true, keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done), keyboardActions = KeyboardActions(onDone = { send() }))
        TvAction(action, send, Modifier.fillMaxWidth().focusRequester(confirm).testTag("tv-input-submit"))
        TvAction("Clear", { text = ""; field.requestFocus() }, Modifier.fillMaxWidth())
        TvAction("Cancel", close, Modifier.fillMaxWidth())
        LaunchedEffect(Unit) { field.requestFocus() }
    }
}

@Composable
private fun TvServerSettings(model: LibraryModel, close: () -> Unit) {
    var invalid by remember { mutableStateOf(false) }
    TvInput(if (invalid) "Enter a valid http:// or https:// address" else "Server address", model.server, "Connect", close) { address ->
        val uri = android.net.Uri.parse(address.trim())
        if (uri.scheme !in listOf("http", "https") || uri.host.isNullOrEmpty()) invalid = true
        else { model.configure(address); close() }
    }
}

@androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
@Composable
private fun TvPlayer(model: LibraryModel, movie: Movie, close: () -> Unit) {
    val context = LocalContext.current; val scope = rememberCoroutineScope()
    val session = remember(movie.id) { PlaybackSession(context, movie, model, scope) }
    var controls by remember { mutableStateOf(true) }
    var panel by remember { mutableStateOf<String?>(null) }
    var interaction by remember { mutableIntStateOf(0) }
    var seekNotice by remember { mutableStateOf<String?>(null) }
    val surface = remember { FocusRequester() }; val play = remember { FocusRequester() }
    val lifecycle = LocalLifecycleOwner.current
    DisposableEffect(session, lifecycle) {
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_STOP) session.pause() }
        lifecycle.lifecycle.addObserver(observer)
        onDispose { lifecycle.lifecycle.removeObserver(observer); session.close() }
    }
    val preparing = session.loading || (!session.videoReady && session.error == null)
    val show = controls || preparing || session.error != null
    LaunchedEffect(session.paused) { if (session.paused) controls = true }
    LaunchedEffect(interaction, session.paused, preparing, panel, session.error) {
        if (!session.paused && !preparing && panel == null && session.error == null) { delay(4000); controls = false }
    }
    LaunchedEffect(show) { if (show) play.requestFocus() else surface.requestFocus() }
    LaunchedEffect(seekNotice) { if (seekNotice != null) { delay(1000); seekNotice = null } }
    BackHandler { if (show && session.error == null && !preparing) { controls = false } else close() }
    fun skip(seconds: Double) { session.seek(session.position + seconds); seekNotice = (if (seconds > 0) "+5" else "−5") + " seconds" }
    Box(Modifier.fillMaxSize().background(Color.Black).focusRequester(surface).focusProperties { canFocus = !show }
        .onPreviewKeyEvent { event ->
            if (panel != null) return@onPreviewKeyEvent false
            if (event.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false
            interaction++
            when (event.key) {
                Key.MediaPlayPause -> { if (event.nativeKeyEvent.repeatCount == 0) session.toggle(); true }
                Key.MediaPlay -> { session.player.play(); true }
                Key.MediaPause -> { session.pause(); true }
                Key.MediaRewind -> { skip(-5.0); true }
                Key.MediaFastForward -> { skip(5.0); true }
                Key.DirectionLeft, Key.DirectionRight -> if (!show) { skip(if (event.key == Key.DirectionLeft) -5.0 else 5.0); true } else false
                Key.DirectionCenter, Key.Enter, Key.NumPadEnter, Key.DirectionUp, Key.DirectionDown -> if (!show) { controls = true; true } else false
                else -> false
            }
        }.focusable().testTag("tv-player")) {
        AndroidView(factory = { PlayerView(it).apply { player = session.player; useController = false; isFocusable = false; descendantFocusability = android.view.ViewGroup.FOCUS_BLOCK_DESCENDANTS } },
            update = { it.keepScreenOn = !session.paused; it.subtitleView?.setBottomPaddingFraction(if (show) 0.25f else 0.08f) }, modifier = Modifier.fillMaxSize())
        if (show) {
            if (preparing) Text("Preparing playback…", Modifier.align(Alignment.Center).testTag("tv-player-loading"), fontSize = 20.sp)
            Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth().background(Color.Black.copy(alpha = 0.9f)).padding(horizontal = 36.dp, vertical = 20.dp)) {
                Text(movie.title, fontSize = 22.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                session.error?.let { Text(it, Modifier.testTag("tv-player-error").padding(vertical = 8.dp), color = Coral, fontSize = 16.sp) }
                TvTimeline(session.position, session.media?.duration ?: movie.duration) { delta -> session.seek(session.position + delta); interaction++ }
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TvAction(if (session.paused) "Play" else "Pause", { session.toggle(); interaction++ }, Modifier.focusRequester(play).testTag("tv-player-toggle"), icon = if (session.paused) Icons.Outlined.PlayArrow else Icons.Outlined.Pause)
                    TvAction("5s", { skip(-5.0); interaction++ }, Modifier.testTag("tv-seek-back"), icon = Icons.Outlined.Replay5)
                    TvAction("5s", { skip(5.0); interaction++ }, Modifier.testTag("tv-seek-forward"), icon = Icons.Outlined.Forward5)
                    Spacer(Modifier.weight(1f))
                    TvAction("Info", { panel = "description" }, Modifier.testTag("tv-info"), icon = Icons.Outlined.Info)
                    TvAction("Audio / CC", { panel = "tracks" }, Modifier.testTag("tv-tracks"), icon = Icons.Outlined.ClosedCaption)
                    if (session.error != null) TvAction("Library", close)
                }
            }
        }
        seekNotice?.let { Text(it, Modifier.align(Alignment.Center).background(Color.Black.copy(alpha = 0.8f)).padding(20.dp), fontSize = 24.sp) }
    }
    if (panel == "description") TvDescription(movie) { panel = null; interaction++; controls = true }
    if (panel == "tracks") {
        val media = session.media
        val choices = (media?.audioTracks?.map { "audio:${it.id}" to "Audio: ${it.title}" } ?: emptyList()) +
            listOf("sub:off" to "Subtitles off") + (media?.subtitles?.map { "sub:${it.id}" to "Subtitles: ${it.title}" } ?: emptyList())
        TvChoices("Audio and subtitles", choices, setOf("audio:${media?.audio}", "sub:${session.subtitle}"), { panel = null; interaction++ }, notice = media?.notice) {
            if (it.startsWith("audio:")) session.selectAudio(it.removePrefix("audio:").toInt()) else session.selectSubtitle(it.removePrefix("sub:"))
            panel = null; interaction++
        }
    }
}

@Composable
internal fun TvTimeline(position: Double, duration: Double, seek: (Double) -> Unit) {
    var focused by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth().padding(vertical = 8.dp).onFocusChanged { focused = it.isFocused }
        .border(2.dp, if (focused) Coral else Color.Transparent)
        .onKeyEvent { event ->
            if (event.type == KeyEventType.KeyDown && event.key in listOf(Key.DirectionLeft, Key.DirectionRight)) {
                seek(if (event.key == Key.DirectionLeft) -5.0 else 5.0); true
            } else false
        }.focusable().semantics { contentDescription = "Playback position"; progressBarRangeInfo = ProgressBarRangeInfo(position.toFloat().coerceIn(0f, duration.toFloat().coerceAtLeast(1f)), 0f..duration.toFloat().coerceAtLeast(1f)) }
        .testTag("tv-timeline").padding(8.dp)) {
        LinearProgressIndicator(progress = { (position / duration.coerceAtLeast(1.0)).toFloat().coerceIn(0f, 1f) }, modifier = Modifier.fillMaxWidth().height(4.dp), color = Coral, trackColor = Color(0xFF65616E))
        Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(timestamp(position), fontSize = 14.sp, modifier = Modifier.testTag("tv-playback-time"))
            Text(timestamp(duration), color = TvSecondary, fontSize = 14.sp)
        }
    }
}

@Composable
internal fun TvDescription(movie: Movie, close: () -> Unit) {
    val done = remember { FocusRequester() }
    TvDialog(movie.title, close, alignEnd = true) {
        Text(movie.facts, fontSize = 16.sp, color = TvSecondary)
        TvScrollableText(movie.description.ifBlank { "No description available." }, Modifier.weight(1f).fillMaxWidth().testTag("tv-description"))
        TvAction("Close description", close, Modifier.focusRequester(done).testTag("tv-description-close"))
        LaunchedEffect(Unit) { done.requestFocus() }
    }
}
