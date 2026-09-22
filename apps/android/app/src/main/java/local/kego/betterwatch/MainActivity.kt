package local.kego.betterwatch

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.*
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.grid.*
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import coil.compose.AsyncImage
import coil.request.ImageRequest
import kotlinx.coroutines.*
import org.json.JSONObject

val Coral = Color(0xFFFFA397)
private val palette = darkColorScheme(primary = Coral, onPrimary = Color.Black, background = Color(0xFF0C0C0C), surface = Color(0xFF151515), surfaceVariant = Color(0xFF202020))

class MainActivity : ComponentActivity() {
    private val model: LibraryModel by viewModels()
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState); enableEdgeToEdge()
        setContent { MaterialTheme(colorScheme = palette) { BetterWatch(model) } }
    }
    override fun onStart() { super.onStart(); model.connect() }
    override fun onStop() { model.disconnect(); super.onStop() }
}

@Composable
fun BetterWatch(model: LibraryModel) {
    var settings by remember { mutableStateOf(false) }
    val drawer = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    Surface(Modifier.fillMaxSize()) {
        BoxWithConstraints(Modifier.safeDrawingPadding()) {
            val wide = maxWidth >= 900.dp
            val side: @Composable () -> Unit = { Sidebar(model, { settings = true }) { scope.launch { drawer.close() } } }
            if (wide) Row { Box(Modifier.width(220.dp).fillMaxHeight()) { side() }; VerticalDivider(); Library(model, Modifier.weight(1f)) {} }
            else ModalNavigationDrawer(drawerState = drawer, drawerContent = { ModalDrawerSheet(Modifier.width(280.dp)) { side() } }) {
                Library(model, Modifier.fillMaxSize()) { scope.launch { drawer.open() } }
            }
        }
    }
    model.selected?.let { movie -> QuickLook(model, movie, { model.selected = null }) { model.selected = null; model.playing = movie } }
    model.playing?.let { movie -> NativePlayer(model, movie) { model.playing = null } }
    if (settings) ServerSettings(model) { settings = false }
    model.error?.let { message -> AlertDialog(onDismissRequest = { model.error = null }, title = { Text("Better Watch") }, text = { Text(message) }, confirmButton = { TextButton(onClick = { model.error = null; model.connect() }) { Text("Reconnect") } }, dismissButton = { TextButton(onClick = { model.error = null }) { Text("OK") } }) }
}

@Composable
private fun Sidebar(model: LibraryModel, settings: () -> Unit, close: () -> Unit) {
    val folders = remember(model.movies) { model.movies.groupingBy { it.topFolder }.eachCount().toSortedMap() }
    LazyColumn(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surface).padding(12.dp)) {
        item { Text("Better Watch", Modifier.padding(horizontal = 8.dp, vertical = 20.dp), fontSize = 20.sp, fontWeight = FontWeight.Bold) }
        items(SavedList.entries) { list ->
            val icon = when (list) { SavedList.ALL -> Icons.Outlined.GridView; SavedList.FAVORITE -> Icons.Outlined.FavoriteBorder; SavedList.LATER -> Icons.Outlined.Schedule; SavedList.UNWATCHED -> Icons.Outlined.RadioButtonUnchecked; SavedList.WATCHED -> Icons.Outlined.CheckCircle }
            TextButton(onClick = { model.choose(list); close() }, modifier = Modifier.fillMaxWidth().testTag("nav-${list.name}"), colors = ButtonDefaults.textButtonColors(contentColor = if (model.list == list && model.folder.isEmpty() && !model.artistsVisible) Coral else Color.White)) {
                Icon(icon, null, Modifier.size(19.dp)); Spacer(Modifier.width(12.dp)); Text(list.label, Modifier.weight(1f))
            }
        }
        item { TextButton(onClick = { model.artistsVisible = true; close() }) { Icon(Icons.Outlined.People, null, Modifier.size(19.dp)); Spacer(Modifier.width(12.dp)); Text("Artists") } }
        item { HorizontalDivider(Modifier.padding(vertical = 14.dp)); Text("Folders", Modifier.padding(8.dp), color = Color.Gray, fontSize = 12.sp) }
        items(folders.entries.toList(), key = { it.key }) { entry ->
            TextButton(onClick = { model.chooseFolder(entry.key); close() }, modifier = Modifier.fillMaxWidth()) { Icon(Icons.Outlined.Folder, null, Modifier.size(19.dp)); Spacer(Modifier.width(12.dp)); Text(entry.key, Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis); Text("${entry.value}", fontSize = 12.sp, color = Color.Gray) }
        }
        item { HorizontalDivider(Modifier.padding(vertical = 14.dp)); TextButton(onClick = { model.connect(); close() }) { Text("Reconnect") }; TextButton(onClick = settings) { Text("Server") } }
    }
}

@Composable
private fun Library(model: LibraryModel, modifier: Modifier, menu: () -> Unit) {
    val movies = model.movies; val marks = model.marks; val search = model.search; val folder = model.folder; val subfolder = model.subfolder; val artist = model.artist; val categories = model.category; val list = model.list; val sort = model.sort
    val filtered = rememberFilteredMovies(model)
    val availableCategories = remember(movies) { movies.flatMap { it.categories }.distinct().sorted() }
    val artists = remember(movies) { movies.flatMap { it.artists }.distinct().sorted() }
    var categoryMenu by remember { mutableStateOf(false) }; var sortMenu by remember { mutableStateOf(false) }; var folderMenu by remember { mutableStateOf(false) }
    Column(modifier) {
        Row(Modifier.fillMaxWidth().height(56.dp).padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = menu) { Icon(Icons.Outlined.Menu, "Library menu") }
            Text(if (model.artistsVisible) "Artists" else artist.ifEmpty { folder.ifEmpty { list.label } }, Modifier.weight(1f), fontSize = 20.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text("${filtered.size} films", Modifier.padding(end = 12.dp), color = Color.Gray, fontSize = 12.sp)
        }
        OutlinedTextField(model.search, { model.search = it }, Modifier.fillMaxWidth().padding(horizontal = 20.dp).testTag("film-search"), singleLine = true, placeholder = { Text(if (model.artistsVisible) "Search artists" else "Search films") }, leadingIcon = { Icon(Icons.Outlined.Search, null) })
        if (model.artistsVisible) {
            LazyColumn(Modifier.fillMaxSize().padding(20.dp)) {
                items(artists.filter { search.isEmpty() || it.contains(search, true) }, key = { it }) { name -> TextButton(onClick = { model.artist = name; model.search = ""; model.artistsVisible = false }, modifier = Modifier.fillMaxWidth()) { Text(name, Modifier.weight(1f)); Icon(Icons.Outlined.ChevronRight, null) } }
            }
        } else {
            Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                Box {
                    TextButton(onClick = { categoryMenu = true }) { Text(if (categories.isEmpty()) "All categories" else "${categories.size} categories", fontSize = 12.sp) }
                    DropdownMenu(categoryMenu, { categoryMenu = false }) {
                        DropdownMenuItem(text = { Text("All categories") }, onClick = { model.category = emptySet(); categoryMenu = false })
                        availableCategories.forEach { name -> DropdownMenuItem(text = { Text((if (name in categories) "✓ " else "") + name) }, onClick = { model.category = if (name in categories) categories - name else categories + name }) }
                    }
                }
                if (folder.isNotEmpty()) Box {
                    TextButton(onClick = { folderMenu = true }) { Icon(Icons.Outlined.Folder, "Subfolders", Modifier.size(20.dp)) }
                    DropdownMenu(folderMenu, { folderMenu = false }) {
                        DropdownMenuItem(text = { Text("All Subfolders") }, onClick = { model.subfolder = ""; folderMenu = false })
                        model.directories.filter { it.startsWith("$folder/") }.forEach { name -> DropdownMenuItem(text = { Text(name.removePrefix("$folder/")) }, onClick = { model.subfolder = name; folderMenu = false }) }
                    }
                }
                Spacer(Modifier.weight(1f))
                Box {
                    TextButton(onClick = { sortMenu = true }) { Text(sort.label, fontSize = 12.sp); Icon(Icons.Outlined.SwapVert, null, Modifier.size(18.dp)) }
                    DropdownMenu(sortMenu, { sortMenu = false }) { Sort.entries.forEach { value -> DropdownMenuItem(text = { Text(value.label) }, onClick = { model.sort = value; sortMenu = false }) } }
                }
            }
            HorizontalDivider()
            if (model.loading && movies.isEmpty()) Text("Connecting to your library…", Modifier.padding(20.dp), color = Color.Gray)
            else if (filtered.isEmpty()) Text("No films found", Modifier.padding(20.dp), color = Color.Gray)
            else BoxWithConstraints(Modifier.fillMaxSize()) {
                val columns = maxOf(2, ((maxWidth - 40.dp) / 240.dp).toInt())
                key(folder, subfolder, list, search, sort, categories, artist) {
                    LazyVerticalGrid(GridCells.Fixed(columns), contentPadding = PaddingValues(20.dp), horizontalArrangement = Arrangement.spacedBy(16.dp), verticalArrangement = Arrangement.spacedBy(24.dp), modifier = Modifier.testTag("film-grid")) {
                        items(filtered, key = { it.id }) { movie -> FilmTile(model, movie, marks[movie.id] ?: Marks()) }
                    }
                }
            }
        }
    }
}

@Composable
private fun Cover(model: LibraryModel, movie: Movie, modifier: Modifier = Modifier) {
    AsyncImage(ImageRequest.Builder(LocalContext.current).data(model.url(movie.thumbnail) + "?quality=cover&width=480").size(480, 270).build(), null, modifier.aspectRatio(16f / 9).background(Color(0xFF242424)), contentScale = ContentScale.Crop)
}

@Composable
private fun FilmTile(model: LibraryModel, movie: Movie, marks: Marks) {
    Column(Modifier.clickable { model.selected = movie }.testTag("movie-${movie.id}")) {
        Box {
            Cover(model, movie, Modifier.fillMaxWidth())
            if (movie.english) Text("English Sub", Modifier.align(Alignment.TopStart).padding(5.dp).background(Color.Black.copy(alpha = 0.85f)).padding(4.dp), fontSize = 10.sp)
            Text("${(movie.duration / 60).toInt().coerceAtLeast(1)}m", Modifier.align(Alignment.BottomEnd).padding(5.dp).background(Color.Black.copy(alpha = 0.85f)).padding(4.dp), fontSize = 10.sp)
        }
        Text(movie.title, Modifier.padding(top = 7.dp).height(38.dp), fontSize = 13.sp, lineHeight = 17.sp, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
        Row(Modifier.padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            if (marks.favorite) Icon(Icons.Outlined.Favorite, "Favorite", Modifier.size(13.dp), tint = Coral)
            if (marks.watched) Icon(Icons.Outlined.CheckCircle, "Watched", Modifier.size(13.dp), tint = Coral)
            Text(listOf(movie.folder.removePrefix(model.folder).trimStart('/'), movie.release.take(4)).filter { it.isNotEmpty() }.joinToString(" · "), fontSize = 11.sp, color = Color.Gray, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
@Composable
private fun QuickLook(model: LibraryModel, movie: Movie, close: () -> Unit, play: () -> Unit) {
    val context = LocalContext.current; var moment by remember { mutableIntStateOf(0) }; var previewReady by remember { mutableStateOf(false) }
    val preview = remember(movie.id) { ExoPlayer.Builder(context).build().apply { volume = 0.4f } }
    val lifecycle = LocalLifecycleOwner.current
    DisposableEffect(preview, lifecycle) {
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_STOP) preview.pause() }
        lifecycle.lifecycle.addObserver(observer)
        onDispose { lifecycle.lifecycle.removeObserver(observer); preview.release() }
    }
    LaunchedEffect(movie.id, moment) {
        preview.pause(); previewReady = false
        try {
            val response = model.request("/api/preview", JSONObject().put("id", movie.id).put("moment", moment)); ensureActive()
            withContext(Dispatchers.Main.immediate) { preview.setMediaItem(MediaItem.fromUri(model.url(response.getString("preview")))); preview.prepare(); preview.play(); previewReady = true }
        }
        catch (e: Exception) { if (e is CancellationException) throw e }
    }
    Dialog(onDismissRequest = close, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.widthIn(max = 700.dp).fillMaxWidth().fillMaxHeight(0.94f), color = MaterialTheme.colorScheme.surface) {
            Column {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) { IconButton(onClick = close) { Icon(Icons.Outlined.Close, "Close") } }
                Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(bottom = 20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    Box(Modifier.fillMaxWidth().aspectRatio(16f / 9)) {
                        if (previewReady) AndroidView(factory = { PlayerView(it).apply { player = preview; useController = false } }, modifier = Modifier.fillMaxSize())
                        else Cover(model, movie, Modifier.fillMaxWidth())
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf(0.12, 0.5, 0.78).forEachIndexed { index, fraction ->
                            Column(Modifier.weight(1f).clickable { moment = index }.testTag("preview-moment-$index"), horizontalAlignment = Alignment.CenterHorizontally) {
                                HorizontalDivider(color = if (moment == index) Coral else Color.Gray, thickness = 2.dp)
                                Text(timestamp((movie.duration * fraction).coerceIn(0.0, (movie.duration - 6).coerceAtLeast(0.0))), Modifier.padding(vertical = 12.dp), color = if (moment == index) Coral else Color.Gray)
                            }
                        }
                    }
                    Text(movie.title, fontSize = 23.sp, fontWeight = FontWeight.Bold)
                    Text(movie.facts, color = Color.Gray, fontSize = 13.sp)
                    Button(onClick = { preview.pause(); play() }, modifier = Modifier.fillMaxWidth().testTag("play-film"), shape = MaterialTheme.shapes.small) { Icon(Icons.Outlined.PlayArrow, null); Text("Play") }
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        listOf(Triple("favorite", "Favorite", Icons.Outlined.FavoriteBorder), Triple("watchLater", "Watch Later", Icons.Outlined.Schedule), Triple("watched", "Watched", Icons.Outlined.CheckCircle)).forEach { (field, label, icon) ->
                            val on = (model.marks[movie.id] ?: Marks()).get(field)
                            Column(Modifier.clickable { model.toggle(movie, field) }.padding(vertical = 8.dp).testTag("mark-$field").semantics { stateDescription = if (on) "On" else "Off" }, horizontalAlignment = Alignment.CenterHorizontally) { Icon(icon, label, tint = if (on) Coral else Color.Gray); Text(label, fontSize = 11.sp, color = if (on) Coral else Color.Gray) }
                        }
                    }
                    if (movie.description.isNotEmpty() && movie.description != "null") Text(movie.description, fontSize = 14.sp)
                }
            }
        }
    }
}

@androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
@Composable
private fun NativePlayer(model: LibraryModel, movie: Movie, close: () -> Unit) {
    val context = LocalContext.current; val scope = rememberCoroutineScope()
    val session = remember(movie.id) { PlaybackSession(context, movie, model, scope) }
    var controls by remember { mutableStateOf(true) }; var reveal by remember { mutableIntStateOf(0) }; var tracks by remember { mutableStateOf(false) }
    var scrub by remember { mutableStateOf<Float?>(null) }
    var description by remember { mutableStateOf(false) }
    val lifecycle = LocalLifecycleOwner.current
    DisposableEffect(session, lifecycle) { val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_STOP) session.pause() }; lifecycle.lifecycle.addObserver(observer); onDispose { lifecycle.lifecycle.removeObserver(observer); session.close() } }
    LaunchedEffect(reveal, session.paused, description, tracks) { if (!session.paused && !description && !tracks) { delay(3000); controls = false } }
    val show = controls || session.paused || session.loading || session.error != null
    Dialog(onDismissRequest = close, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        CompositionLocalProvider(LocalContentColor provides Color.White) {
            Box(Modifier.fillMaxSize().background(Color.Black).safeDrawingPadding().testTag("player-surface")) {
                AndroidView(factory = { PlayerView(it).apply { player = session.player; useController = false } }, update = { it.keepScreenOn = !session.paused; it.subtitleView?.setBottomPaddingFraction(if (show) 0.22f else 0.08f) }, modifier = Modifier.fillMaxSize())
                // Receive physical touches above PlayerView, which otherwise consumes them.
                // Controls are drawn later so their buttons and slider keep their own gestures.
                Box(Modifier.matchParentSize().testTag("player-gestures").pointerInput(session) {
                    detectTapGestures(
                        onTap = { controls = !controls; reveal++ },
                        onDoubleTap = { point ->
                            session.seek(session.position + if (point.x < size.width / 2f) -5 else 5)
                            controls = true; reveal++
                        }
                    )
                }.semantics { onClick(label = "Show playback controls") { controls = true; reveal++; true } })
                if (show) {
                    Column(Modifier.fillMaxSize()) {
                        Row(Modifier.fillMaxWidth().background(Color.Black.copy(alpha = 0.8f)), verticalAlignment = Alignment.CenterVertically) {
                            IconButton(onClick = close) { Icon(Icons.Outlined.ArrowBack, "Back to library") }; Text(movie.title, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f).padding(end = 16.dp))
                            IconButton(onClick = { description = true; controls = true; reveal++ }) { Icon(Icons.Outlined.Info, "Movie Description") }
                        }
                        Spacer(Modifier.weight(1f))
                        if (session.loading) Text("Preparing playback…", Modifier.align(Alignment.CenterHorizontally).testTag("player-loading"))
                        session.error?.let { Text(it, Modifier.padding(20.dp).testTag("player-error")) }
                        Spacer(Modifier.weight(1f))
                        Column(Modifier.background(Color.Black.copy(alpha = 0.8f)).padding(horizontal = 16.dp)) {
                            Slider(value = scrub ?: session.position.toFloat(), onValueChange = { scrub = it; reveal++ }, onValueChangeFinished = { scrub?.let { session.seek(it.toDouble()) }; scrub = null }, valueRange = 0f..maxOf(1f, session.media?.duration?.toFloat() ?: 1f), modifier = Modifier.testTag("playback-position"))
                            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                IconButton(onClick = { session.toggle(); reveal++ }, modifier = Modifier.testTag("player-toggle")) { Icon(if (session.paused) Icons.Outlined.PlayArrow else Icons.Outlined.Pause, if (session.paused) "Play" else "Pause") }
                                IconButton(onClick = { session.seek(session.position - 5); reveal++ }) { Icon(Icons.Outlined.Replay5, "Back 5 seconds") }
                                IconButton(onClick = { session.seek(session.position + 5); reveal++ }) { Icon(Icons.Outlined.Forward5, "Forward 5 seconds") }
                                Text("${timestamp(session.position)} / ${timestamp(session.media?.duration ?: 0.0)}", fontSize = 11.sp, modifier = Modifier.weight(1f).testTag("playback-time"))
                                Box {
                                    IconButton(onClick = { tracks = true; controls = true; reveal++ }) { Icon(Icons.Outlined.ClosedCaption, "Audio and subtitles") }
                                    DropdownMenu(tracks, { tracks = false }) {
                                        session.media?.audioTracks?.forEach { track -> DropdownMenuItem(text = { Text((if (session.media?.audio == track.id) "✓ " else "") + track.title) }, onClick = { session.selectAudio(track.id); tracks = false }) }
                                        HorizontalDivider(); DropdownMenuItem(text = { Text("Subtitles off") }, onClick = { session.selectSubtitle("off"); tracks = false })
                                        session.media?.subtitles?.forEach { track -> DropdownMenuItem(text = { Text((if (session.subtitle == track.id) "✓ " else "") + track.title) }, onClick = { session.selectSubtitle(track.id); tracks = false }) }
                                        session.media?.notice?.let { Text(it, Modifier.padding(12.dp), fontSize = 12.sp) }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    if (description) Dialog(onDismissRequest = { description = false }) {
        Surface(Modifier.widthIn(max = 420.dp).fillMaxWidth().heightIn(max = 480.dp), color = MaterialTheme.colorScheme.surface) {
            Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Row(verticalAlignment = Alignment.Top) {
                    Text(movie.title, Modifier.weight(1f), fontSize = 22.sp, fontWeight = FontWeight.Bold)
                    IconButton(onClick = { description = false }) { Icon(Icons.Outlined.Close, "Close description") }
                }
                SelectionContainer(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState())) {
                    Text(movie.description.ifBlank { "No description available." }, fontSize = 15.sp, lineHeight = 23.sp, modifier = Modifier.testTag("movie-description-text"))
                }
            }
        }
    }
}

@Composable
private fun ServerSettings(model: LibraryModel, close: () -> Unit) {
    var address by remember { mutableStateOf(model.server) }; var invalid by remember { mutableStateOf(false) }
    AlertDialog(onDismissRequest = close, title = { Text("Server") }, text = { OutlinedTextField(address, { address = it; invalid = false }, label = { Text("Server address") }, isError = invalid, singleLine = true) }, confirmButton = { TextButton(onClick = {
        val uri = android.net.Uri.parse(address.trim())
        if (uri.scheme !in listOf("http", "https") || uri.host.isNullOrEmpty()) invalid = true else { model.configure(address); close() }
    }) { Text("Connect") } }, dismissButton = { TextButton(onClick = close) { Text("Cancel") } })
}
