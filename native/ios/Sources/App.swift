import SwiftUI
import AVKit

private let coral = Color(red: 1, green: 0.64, blue: 0.59)

@main struct BetterWatchMobileApp: App {
    @StateObject private var store = MobileStore()
    @Environment(\.scenePhase) private var phase
    var body: some Scene {
        WindowGroup {
            MobileRoot().environmentObject(store).preferredColorScheme(.dark).tint(coral)
                .task { await store.connect() }
                .onChange(of: phase) { _, next in
                    if next == .background { store.background() }
                    if next == .active { Task { await store.connect() } }
                }
        }
    }
}

struct MobileRoot: View {
    @EnvironmentObject var store: MobileStore
    @State private var visibility: NavigationSplitViewVisibility = .automatic
    @State private var settings = false
    @State private var artistSearch = ""
    var body: some View {
        NavigationSplitView(columnVisibility: $visibility) {
            List {
                Section {
                    ForEach(SavedList.allCases) { list in
                        Button { store.choose(list) } label: { Label(list.rawValue, systemImage: list.symbol).foregroundStyle(store.query.list == list && store.query.folder.isEmpty && !store.artistsVisible ? coral : .primary) }
                            .accessibilityIdentifier("nav-\(list.id)")
                    }
                    Button { store.artistsVisible = true } label: { Label("Artists", systemImage: "person.2") }
                }
                Section("Folders") {
                    ForEach(store.folders, id: \.self) { folder in
                        Button { store.choose(folder: folder) } label: {
                            HStack { Label(folder, systemImage: "folder"); Spacer(); Text("\(store.movies.filter { $0.topFolder == folder }.count)").font(.caption).foregroundStyle(.secondary) }
                        }.foregroundStyle(store.query.folder == folder && !store.artistsVisible ? coral : .primary)
                    }
                }
                Section {
                    Button { Task { await store.connect() } } label: { Label("Reconnect", systemImage: "arrow.clockwise") }
                    Button { settings = true } label: { Label("Server", systemImage: "network") }
                }
            }.listStyle(.sidebar).navigationTitle("Better Watch")
                .navigationSplitViewColumnWidth(min: 180, ideal: 210, max: 260)
        } detail: {
            Group {
                if store.loading && store.movies.isEmpty { Text("Connecting to your library…").foregroundStyle(.secondary) }
                else if store.artistsVisible {
                    List(store.artists.filter { artistSearch.isEmpty || $0.localizedStandardContains(artistSearch) }, id: \.self) { artist in
                        Button { store.query.artist = artist; store.artistsVisible = false } label: { HStack { Text(artist); Spacer(); Image(systemName: "chevron.right") } }
                    }.searchable(text: $artistSearch, prompt: "Search artists")
                } else { library }
            }
            .navigationTitle(store.heading).navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Text("\(store.filtered.count) films").font(.caption).foregroundStyle(.secondary) } }
        }
        .sheet(item: $store.selected, onDismiss: { store.previewDismissed() }) { MobileQuickLook(movie: $0).environmentObject(store) }
        .fullScreenCover(item: $store.playing) { MobilePlayer(playback: $0, close: store.closePlayback) }
        .sheet(isPresented: $settings) { ServerSettings().environmentObject(store) }
        .alert("Better Watch", isPresented: Binding(get: { store.error != nil }, set: { if !$0 { store.error = nil } })) {
            Button("Reconnect") { Task { await store.connect() } }; Button("OK", role: .cancel) { }
        } message: { Text(store.error ?? "") }
    }
    private var library: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 12) {
                TextField("Search films", text: $store.query.search).textFieldStyle(.roundedBorder).accessibilityIdentifier("film-search")
                HStack(spacing: 18) {
                    if !store.query.folder.isEmpty {
                        Menu {
                            Button("All Subfolders") { store.query.subfolder = "" }
                            ForEach(store.directories.filter { $0.hasPrefix(store.query.folder + "/") }, id: \.self) { folder in
                                Button(String(folder.dropFirst(store.query.folder.count + 1))) { store.query.subfolder = folder }
                            }
                        } label: { Label(store.query.subfolder.isEmpty ? "All Subfolders" : String(store.query.subfolder.split(separator: "/").last ?? ""), systemImage: "folder") }
                    }
                    Menu {
                        Button("All categories") { store.query.categories = [] }
                        ForEach(store.categories, id: \.self) { category in
                            Button { if store.query.categories.contains(category.lowercased()) { store.query.categories.remove(category.lowercased()) } else { store.query.categories.insert(category.lowercased()) } } label: {
                                if store.query.categories.contains(category.lowercased()) { Label(category, systemImage: "checkmark") } else { Text(category) }
                            }
                        }
                    } label: { Label(store.query.categories.isEmpty ? "All categories" : "\(store.query.categories.count) categories", systemImage: "line.3.horizontal.decrease") }
                    Spacer(minLength: 0)
                    Menu { Picker("Sort", selection: $store.query.sort) { ForEach(Sort.allCases) { Text($0.rawValue).tag($0) } } } label: { Label(store.query.sort.rawValue, systemImage: "arrow.up.arrow.down") }
                }.font(.subheadline).buttonStyle(.plain)
            }.padding(.horizontal, 20).padding(.vertical, 14)
            Divider()
            GeometryReader { geometry in
                let columns = max(2, Int((geometry.size.width - 40) / 240))
                ScrollView {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 16, alignment: .top), count: columns), alignment: .leading, spacing: 24) {
                        ForEach(store.filtered) { movie in
                            Button { store.selected = movie } label: {
                                VStack(alignment: .leading, spacing: 7) {
                                    MobileCover(path: movie.thumbnail)
                                        .overlay(alignment: .bottomTrailing) { Text(movie.minutes).font(.caption2).padding(4).background(.black.opacity(0.85)).padding(5) }
                                        .overlay(alignment: .topLeading) { if movie.hasEnglishSub == true { Text("English Sub").font(.caption2).padding(4).background(.black.opacity(0.85)).padding(5) } }
                                    Text(movie.displayTitle).font(.system(size: 13, weight: .semibold)).lineLimit(2).frame(height: 34, alignment: .topLeading)
                                    HStack(spacing: 5) {
                                        if store.marks[movie.id]?.favorite == true { Image(systemName: "heart.fill").foregroundStyle(coral) }
                                        if store.marks[movie.id]?.watched == true { Image(systemName: "checkmark.circle.fill").foregroundStyle(coral) }
                                        Text([movie.location(in: store.query.folder), movie.year].filter { !$0.isEmpty }.joined(separator: " · ")).lineLimit(1)
                                    }.font(.caption).foregroundStyle(.secondary)
                                }.contentShape(Rectangle()).foregroundStyle(.primary)
                            }.buttonStyle(.plain).accessibilityIdentifier("movie-\(movie.id)")
                        }
                    }.padding(20)
                    if store.filtered.isEmpty { ContentUnavailableView("No films found", systemImage: "film") }
                }.accessibilityIdentifier("film-grid")
                    .id("\(store.query.folder)|\(store.query.subfolder)|\(store.query.list.rawValue)|\(store.query.search)|\(store.query.sort.rawValue)|\(store.query.categories.sorted())|\(store.query.artist)")
            }
        }.background(Color(uiColor: .systemBackground))
    }
}

struct MobileCover: View {
    let path: String?
    @State private var image: UIImage?
    var body: some View {
        Color.white.opacity(0.05).aspectRatio(16/9, contentMode: .fit)
            .overlay { if let image { Image(uiImage: image).resizable().scaledToFill() } else { Image(systemName: "film").foregroundStyle(.tertiary) } }
            .clipped().task(id: path) {
                guard let path else { return }
                do { let result = try await MobileCovers.shared.image(path); try Task.checkCancellation(); image = result } catch { }
            }.onDisappear { image = nil }
    }
}

struct MobileQuickLook: View {
    let movie: Movie
    @EnvironmentObject var store: MobileStore
    @Environment(\.dismiss) private var dismiss
    @State private var preview: AVPlayer?
    @State private var moment = 0
    @State private var previewError: String?
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Group { if let preview { VideoPlayer(player: preview) } else { MobileCover(path: movie.thumbnail) } }.aspectRatio(16/9, contentMode: .fit)
                    HStack {
                        ForEach(0..<3) { index in
                            Button { moment = index } label: { Text(timestamp(momentSeconds(movie.duration, index))).frame(maxWidth: .infinity, minHeight: 44).overlay(alignment: .top) { Rectangle().fill(moment == index ? coral : .secondary).frame(height: 2) } }
                                .foregroundStyle(moment == index ? coral : .secondary).accessibilityIdentifier("preview-moment-\(index)")
                        }
                    }.buttonStyle(.plain)
                    Text(movie.displayTitle).font(.title2.bold())
                    Text(movie.facts).font(.subheadline).foregroundStyle(.secondary)
                    Button { preview?.pause(); store.play(movie) } label: { Label("Play", systemImage: "play.fill").frame(maxWidth: .infinity, minHeight: 44) }.buttonStyle(.borderedProminent).foregroundStyle(.black).accessibilityIdentifier("play-film")
                    HStack {
                        mark("Favorite", icon: "heart", field: \Mark.favorite)
                        Spacer(); mark("Watch Later", icon: "clock", field: \Mark.watchLater)
                        Spacer(); mark("Watched", icon: "checkmark.circle", field: \Mark.watched)
                    }.font(.caption)
                    if let description = movie.description, !description.isEmpty { Text(description).font(.body).textSelection(.enabled) }
                    if let previewError { Text(previewError).foregroundStyle(.secondary).font(.caption) }
                }.padding(20)
            }.toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Close", systemImage: "xmark") { dismiss() } } }
        }.task(id: moment) {
            preview?.pause(); preview = nil; previewError = nil
            do {
                let data = try await API.data("/api/preview", body: ["id": movie.id, "moment": moment])
                let value = try JSONSerialization.jsonObject(with: data) as? [String: String]
                try Task.checkCancellation()
                if let path = value?["preview"] { let player = AVPlayer(url: API.url(path)); player.volume = 0.4; player.actionAtItemEnd = .pause; preview = player; player.play() }
            } catch { if !Task.isCancelled { previewError = "Preview unavailable. You can still play the film." } }
        }.onDisappear { preview?.pause(); preview?.replaceCurrentItem(with: nil); preview = nil }
    }
    private func mark(_ label: String, icon: String, field: WritableKeyPath<Mark, Bool>) -> some View {
        let selected = (store.marks[movie.id] ?? Mark())[keyPath: field]
        return Button { store.toggle(movie, field) } label: { Label(label, systemImage: selected ? icon + ".fill" : icon).frame(minHeight: 44) }.buttonStyle(.plain).foregroundStyle(selected ? coral : .secondary).accessibilityValue(selected ? "On" : "Off")
    }
}

struct MobilePlayer: View {
    @ObservedObject var playback: NativePlayback
    let close: () -> Void
    @State private var visible = true
    @State private var reveal = UUID()
    @State private var scrub: Double?
    @State private var showDescription = false
    private var descriptionText: String {
        let text = playback.movie.description?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return text.isEmpty ? "No description available." : text
    }
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            NativeVideoSurface(player: playback.player).ignoresSafeArea().allowsHitTesting(false)
            // A dedicated layer handles touches across the video and letterboxing.
            GeometryReader { geometry in
                Color.clear.contentShape(Rectangle())
                    .gesture(SpatialTapGesture(count: 2).exclusively(before: SpatialTapGesture()).onEnded { event in
                        switch event {
                        case .first(let tap):
                            playback.seek(playback.position + (tap.location.x < geometry.size.width / 2 ? -5 : 5))
                            visible = true
                        case .second:
                            visible.toggle()
                        }
                        reveal = UUID()
                    })
            }
            if !playback.subtitleText.isEmpty {
                VStack { Spacer(); Text(playback.subtitleText).font(.title3.weight(.medium)).multilineTextAlignment(.center).padding(8).background(.black.opacity(0.75)).padding(.horizontal, 30).padding(.bottom, visible || playback.paused ? 130 : 35) }
                    .allowsHitTesting(false).accessibilityIdentifier("subtitle-text")
            }
            if visible || playback.paused || playback.loading || playback.error != nil {
                VStack {
                    HStack {
                        Button(action: close) { Image(systemName: "arrow.left").frame(width: 44, height: 44) }.accessibilityLabel("Back to library")
                        Text(playback.movie.displayTitle).lineLimit(1); Spacer()
                        Button { showDescription = true; visible = true; reveal = UUID() } label: { Image(systemName: "info.circle").frame(width: 44, height: 44) }
                            .accessibilityLabel("Movie Description")
                            .popover(isPresented: $showDescription) {
                                VStack(alignment: .leading, spacing: 16) {
                                    HStack(alignment: .top) {
                                        Text(playback.movie.displayTitle).font(.title2.bold())
                                        Spacer()
                                        Button { showDescription = false } label: { Image(systemName: "xmark").frame(width: 44, height: 44) }.accessibilityLabel("Close description")
                                    }
                                    ScrollView { Text(descriptionText).textSelection(.enabled).lineSpacing(5).frame(maxWidth: .infinity, alignment: .leading).accessibilityIdentifier("movie-description-text") }
                                }.padding(24).frame(idealWidth: 420, maxHeight: 480)
                                    .presentationCompactAdaptation(.sheet).presentationDetents([.medium, .large])
                            }
                    }.padding(.horizontal, 12).background(.black.opacity(0.8))
                    Spacer()
                    if playback.loading { Text("Preparing playback…") }
                    if let error = playback.error { Text(error).padding().background(.black.opacity(0.8)) }
                    Spacer()
                    VStack(spacing: 4) {
                        Slider(value: Binding(get: { scrub ?? playback.position }, set: { scrub = $0; reveal = UUID() }), in: 0...max(1, playback.duration), onEditingChanged: { editing in
                            if !editing, let target = scrub { playback.seek(target); scrub = nil }
                        }).accessibilityLabel("Playback position").accessibilityIdentifier("playback-position")
                        HStack(spacing: 18) {
                            Button { playback.toggle(); reveal = UUID() } label: { Image(systemName: playback.paused ? "play.fill" : "pause.fill").frame(width: 44, height: 44) }.accessibilityLabel(playback.paused ? "Play" : "Pause").accessibilityIdentifier("player-toggle")
                            Button { playback.seek(playback.position - 5); reveal = UUID() } label: { Image(systemName: "gobackward.5").frame(width: 44, height: 44) }.accessibilityLabel("Back 5 seconds")
                            Button { playback.seek(playback.position + 5); reveal = UUID() } label: { Image(systemName: "goforward.5").frame(width: 44, height: 44) }.accessibilityLabel("Forward 5 seconds")
                            Text("\(timestamp(Int(playback.position))) / \(timestamp(Int(playback.duration)))").font(.caption.monospacedDigit()).accessibilityIdentifier("playback-time")
                            Spacer()
                            Menu {
                                Section("Audio") { ForEach(playback.media?.audioTracks ?? []) { track in Button(track.title) { playback.selectAudio(track.id) } } }
                                Section("Subtitles") {
                                    Button("Off") { playback.selectSubtitle("off") }
                                    ForEach(playback.media?.subtitles ?? []) { track in Button(track.title) { playback.selectSubtitle(track.id) } }
                                }
                                if let note = playback.media?.subtitleNotice { Text(note) }
                            } label: { Image(systemName: "captions.bubble") }.accessibilityLabel("Audio and subtitles")
                        }.font(.title2).buttonStyle(.plain).frame(minHeight: 44)
                    }.padding(.horizontal, 20).padding(.bottom, 12).background(.black.opacity(0.8))
                }.foregroundStyle(.white)
            }
        }.statusBarHidden()
            .onChange(of: showDescription) { _, _ in visible = true; reveal = UUID() }
            .task(id: reveal) { try? await Task.sleep(for: .seconds(3)); if !Task.isCancelled && !showDescription { visible = false } }
    }
}

struct ServerSettings: View {
    @EnvironmentObject var store: MobileStore
    @Environment(\.dismiss) private var dismiss
    @State private var address = API.base.absoluteString
    var body: some View {
        NavigationStack {
            Form { TextField("Server address", text: $address).textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.URL) }
                .navigationTitle("Server").toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                    ToolbarItem(placement: .confirmationAction) { Button("Connect") {
                        guard let url = URL(string: address), ["http", "https"].contains(url.scheme), url.host != nil else { return }
                        SharedLibrary.shared.disconnect(); UserDefaults.standard.set(address, forKey: "serverURL"); dismiss(); Task { await store.connect() }
                    } }
                }
        }
    }
}
