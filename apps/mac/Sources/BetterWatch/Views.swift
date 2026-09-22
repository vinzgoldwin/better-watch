import SwiftUI
import AVKit

private let accent = Color(red: 1, green: 0.64, blue: 0.59)

struct RootView: View {
    @EnvironmentObject var store: Store
    @State private var categoriesOpen = false
    @State private var categorySearch = ""
    @FocusState private var searchFocused: Bool
    var body: some View {
        ZStack {
        NavigationSplitView {
            sidebar.navigationSplitViewColumnWidth(min: 170, ideal: 200, max: 270)
        } detail: {
            Group {
                switch store.phase {
                case .running: library
                case .starting: sessionState("Connecting to your library", detail: "Waking the drive and loading films…", busy: true)
                case .stopping: sessionState("Disconnecting", detail: "Ending playback on this Mac…", busy: true)
                case .stopped: sessionState("Disconnected", detail: "Connect to browse your shared library.", busy: false)
                }
            }.frame(maxWidth: .infinity, maxHeight: .infinity).background(Color(nsColor: .windowBackgroundColor))
        }
        .opacity(store.playback == nil ? 1 : 0)
        .disabled(store.playback != nil)
        .accessibilityHidden(store.playback != nil)
        if let playback = store.playback { FilmPlayer(playback:playback,close:store.closePlayback).id(playback.id) }
        }
        .tint(accent)
        // AppKit handles toolbar visibility, including top-edge reveal in fullscreen.
        .toolbar(.automatic, for: .windowToolbar)
        .toolbarBackground(store.playback == nil ? .automatic : .hidden, for: .windowToolbar)
        .toolbar {
            if store.playback == nil {
                if #available(macOS 26.0, *) {
                    connectionStatus.sharedBackgroundVisibility(.hidden)
                    if store.phase == .running { ToolbarSpacer(.fixed, placement: .automatic) }
                } else {
                    connectionStatus
                }
            }
            if store.phase == .running && store.playback == nil {
                ToolbarItem(placement: .automatic) {
                    Button("Disconnect", systemImage: "network") { store.confirmStop = true }
                        .labelStyle(.titleAndIcon)
                        .help("Disconnect this Mac from the library")
                }
            }
        }
        .sheet(item: $store.selected, onDismiss: { NotificationCenter.default.post(name: .init("BetterWatchRestoreFocus"), object: store.lastSelectedID) }) { movie in QuickLook(movie: movie).environmentObject(store) }
        .alert("Disconnect this Mac?", isPresented: $store.confirmStop) {
            Button("Keep Watching", role: .cancel) {}
            Button("Disconnect") { Task { _ = await store.stop() } }
        } message: { Text("This ends playback on this Mac. Your iPad and Android stay connected.") }
        .alert("Better Watch", isPresented: Binding(get: { store.error != nil }, set: { if !$0 { store.error = nil } })) { Button("OK") { store.error = nil } } message: { Text(store.error ?? "") }
        .alert("Clean sidecars?", isPresented: $store.confirmCleanup) {
            Button("Cancel", role: .cancel) {}
            Button("Clean Sidecars", role: .destructive) { store.cleanup() }
        } message: { Text("Remove AppleDouble metadata files beginning with ._ from the library. Videos are kept.") }
        .alert("Delete video from disk?", isPresented: Binding(get: { store.deleteCandidate != nil }, set: { if !$0 { store.deleteCandidate = nil } })) {
            Button("Cancel", role: .cancel) { store.deleteCandidate = nil }
            Button("Delete Permanently", role: .destructive) { if let m = store.deleteCandidate { store.delete(m) }; store.deleteCandidate = nil }
        } message: { Text("This permanently deletes \(store.deleteCandidate?.displayTitle ?? "the video") and its generated previews. It cannot be undone.") }
        .alert("Better Watch", isPresented: Binding(get: { store.notice != nil }, set: { if !$0 { store.notice = nil } })) { Button("OK") { store.notice = nil } } message: { Text(store.notice ?? "") }
        .onReceive(NotificationCenter.default.publisher(for: .init("BetterWatchSearch"))) { _ in searchFocused = true }
        .task { store.start() }
    }
    private var connectionStatus: some ToolbarContent {
        ToolbarItem(placement: .automatic) {
            HStack(spacing: 14) {
                if store.scanning { Label("Scanning", systemImage: "arrow.triangle.2.circlepath") }
                Text(store.phase == .running ? "Connected" : store.phase == .stopped ? "Disconnected" : store.phase == .stopping ? "Disconnecting…" : "Connecting…")
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
    }
    private var sidebar: some View {
        VStack(spacing: 0) {
            List {
                Section {
                    ForEach(SavedList.allCases) { list in
                        Button { store.chooseList(list) } label: { Label(list.rawValue, systemImage: list.symbol).foregroundStyle(store.query.list == list && store.query.folder.isEmpty && !store.showArtists ? accent : .primary).frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle()) }.buttonStyle(.plain).padding(.vertical, 3)
                    }
                    Button { store.showArtists = true } label: { Label("Artists", systemImage: "person.2").foregroundStyle(store.showArtists ? accent : .primary).frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle()) }.buttonStyle(.plain).padding(.vertical, 3)
                }
                if !store.folders.isEmpty {
                    Section("Folders") {
                        ForEach(store.folders, id: \.self) { folder in
                            Button { store.chooseFolder(folder) } label: {
                                HStack { Label(folder, systemImage: "folder"); Spacer(); Text("\(store.movies.lazy.filter { $0.topFolder == folder }.count)").font(.caption).foregroundStyle(.secondary) }
                                    .foregroundStyle(store.query.folder == folder && !store.showArtists ? accent : .primary)
                            }.buttonStyle(.plain).padding(.vertical, 3)
                        }
                    }
                }
            }.listStyle(.sidebar).disabled(store.phase != .running)
            Menu {
                Button("Reconnect to Library") { store.reconnect() }.disabled(store.phase != .running)
                Button(store.scope.isEmpty ? "Rescan All Folders" : "Rescan \(store.scope)") { store.rescan() }.disabled(store.scanning || store.phase != .running)
                Button("Clean Sidecars…") { store.confirmCleanup = true }.disabled(store.phase != .running)
                Divider()
                Button("Import Movie Lists…") { store.importMarks() }
            } label: { Label("Library Tools", systemImage: "gearshape") }.menuStyle(.borderlessButton).padding(16)
        }
    }
    private var library: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text(store.showArtists ? "Artists" : store.heading).font(.system(size: 26, weight: .bold)).lineLimit(1)
                Spacer()
                Text("\(store.showArtists ? store.artists.count : store.filtered.count) \(store.showArtists ? "artists" : "films")").foregroundStyle(.secondary).font(.callout).monospacedDigit()
            }.padding(.horizontal, 24).padding(.top, 20).padding(.bottom, 15)
            if store.showArtists { artistBrowser } else {
                filters
                Divider().padding(.top, 16)
                FilmGrid(movies: store.filtered, collection: store.query.folder, marks: store.marks, open: { store.selected = $0 }, play: store.play, toggle: store.toggle, delete: { store.deleteCandidate = $0 })
                    .id("\(store.query.folder)|\(store.query.subfolder)|\(store.query.list.rawValue)|\(store.query.search)|\(store.query.sort.rawValue)|\(store.query.categories.sorted())|\(store.query.artist)")
            }
        }
    }
    private var filters: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !store.query.folder.isEmpty {
                Picker("Subfolder", selection: $store.query.subfolder) {
                    Text("All Subfolders").tag("")
                    ForEach(store.directories.filter { $0.hasPrefix(store.query.folder + "/") }, id: \.self) { folder in Text(String(folder.dropFirst(store.query.folder.count+1))).tag(folder) }
                }.frame(maxWidth: 430, alignment: .leading)
            }
            HStack(alignment: .bottom, spacing: 14) {
                VStack(alignment: .leading, spacing: 5) {
                    Text("Search").font(.caption).foregroundStyle(.secondary)
                    TextField("Search films", text: $store.query.search).textFieldStyle(.roundedBorder).focused($searchFocused).accessibilityLabel("Search films")
                }
                Button { categoriesOpen.toggle() } label: {
                    HStack(spacing: 18) { Text(store.query.categories.isEmpty ? "All Categories" : "\(store.query.categories.count) \(store.query.categories.count == 1 ? "Category" : "Categories")"); Image(systemName: "chevron.down").font(.caption) }
                }.popover(isPresented: $categoriesOpen, arrowEdge: .bottom) { categoryPicker }
                VStack(alignment: .leading, spacing: 5) {
                    Text("Sort").font(.caption).foregroundStyle(.secondary)
                    Picker("Sort", selection: $store.query.sort) { ForEach(Sort.allCases) { Text($0.rawValue).tag($0) } }.labelsHidden().frame(width: 155)
                }
                if store.query.list != .all { Text(store.query.list.rawValue).font(.callout).foregroundStyle(accent) }
            }.controlSize(.large)
        }.padding(.horizontal, 24)
    }
    private var categoryPicker: some View {
        VStack(alignment: .leading, spacing: 12) {
            TextField("Find a category", text: $categorySearch).textFieldStyle(.roundedBorder)
            HStack { Text("Categories").font(.headline); Spacer(); Button("Clear") { store.query.categories = [] }.disabled(store.query.categories.isEmpty) }
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(store.categoryOptions.filter { categorySearch.isEmpty || $0.name.localizedStandardContains(categorySearch) }, id: \.key) { option in
                        HStack {
                            Toggle(option.name, isOn: Binding(get: { store.query.categories.contains(option.key) }, set: { if $0 { store.query.categories.insert(option.key) } else { store.query.categories.remove(option.key) } }))
                            Spacer(); Text("\(option.count)").font(.caption).foregroundStyle(.secondary).monospacedDigit()
                        }
                    }
                }.padding(3)
            }
        }.padding(16).frame(width: 310, height: 380)
    }
    private var artistBrowser: some View {
        VStack {
            TextField("Search artists", text: $store.artistSearch).textFieldStyle(.roundedBorder).padding(.horizontal,24)
            List(store.artists.filter { store.artistSearch.isEmpty || $0.localizedStandardContains(store.artistSearch) }, id: \.self) { artist in
                Button { store.query = FilmQuery(artist: artist); store.showArtists = false } label: {
                    HStack { Text(artist); Spacer(); Text("\(store.movies.lazy.filter { ($0.artists ?? []).contains(artist) }.count)").foregroundStyle(.secondary); Image(systemName: "chevron.right").foregroundStyle(.secondary) }.padding(.vertical, 5)
                }.buttonStyle(.plain)
            }
        }
    }
    private func sessionState(_ title: String, detail: String, busy: Bool) -> some View {
        VStack(spacing: 18) {
            Image(systemName: busy ? "externaldrive.badge.wifi" : "externaldrive").font(.system(size: 42)).foregroundStyle(.secondary)
            Text(title).font(.title2.bold()); Text(detail).foregroundStyle(.secondary)
            if busy { ProgressView().controlSize(.small) } else { Button("Connect to Library") { store.start() }.buttonStyle(.borderedProminent).controlSize(.large) }
        }.padding(32)
    }
}

struct Cover: View {
    let path: String?
    @State private var image: NSImage?
    @State private var failed = false
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                Color.white.opacity(0.045)
                if let image { Image(nsImage: image).resizable().aspectRatio(contentMode: .fill).frame(width: geometry.size.width, height: geometry.size.height).clipped() }
                else { Image(systemName: failed ? "photo.badge.exclamationmark" : "film").foregroundStyle(.tertiary).font(.title2) }
            }
        }.aspectRatio(16/9, contentMode: .fit)
        .task(id: path) {
            guard let path else { return }
            do { let result = try await Covers.shared.image(path); try Task.checkCancellation(); image = result }
            catch { if !Task.isCancelled { failed = true } }
        }
        .onDisappear { image = nil }
    }
}
struct FilmGrid: View {
    let movies: [Movie]
    let collection: String
    let marks: [String: Mark]
    let open: (Movie) -> Void
    let play: (Movie) -> Void
    let toggle: (Movie, WritableKeyPath<Mark,Bool>) -> Void
    let delete: (Movie) -> Void
    @FocusState private var focused: String?
    var body: some View {
        GeometryReader { geometry in
            let count = max(2, Int((geometry.size.width-48)/255))
            ScrollViewReader { reader in
                ScrollView {
                    if movies.isEmpty { ContentUnavailableView("No films found", systemImage: "magnifyingglass", description: Text("Try changing your search or filters.")).padding(.top, 90) }
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 18, alignment: .top), count: count), alignment: .leading, spacing: 24) {
                        ForEach(movies) { movie in
                            Button { focused = movie.id; open(movie) } label: {
                                VStack(alignment: .leading, spacing: 7) {
                                    Cover(path: movie.thumbnail).overlay(alignment: .bottomTrailing) { Text(movie.minutes).font(.caption).padding(.horizontal, 5).padding(.vertical, 2).background(.black.opacity(0.85)).padding(6) }
                                        .overlay(alignment: .topLeading) {
                                            if movie.hasEnglishSub == true {
                                                Text("English Sub").font(.caption).foregroundStyle(.white)
                                                    .padding(.horizontal, 5).padding(.vertical, 2)
                                                    .background(.black.opacity(0.85)).padding(6)
                                            }
                                        }
                                    Text(movie.displayTitle).font(.system(size: 13, weight: .semibold)).lineLimit(2).frame(height: 34, alignment: .topLeading)
                                    HStack(spacing: 5) {
                                        if marks[movie.id]?.watched == true { Image(systemName: "checkmark.circle.fill").foregroundStyle(accent) }
                                        if marks[movie.id]?.favorite == true { Image(systemName: "heart.fill").foregroundStyle(accent) }
                                        Text([movie.location(in: collection),movie.year].filter { !$0.isEmpty }.joined(separator: " · ")).lineLimit(1)
                                    }.font(.caption).foregroundStyle(.secondary)
                                }.contentShape(Rectangle())
                            }.buttonStyle(.plain).focusable().focusEffectDisabled().focused($focused, equals: movie.id).id(movie.id)
                                .onKeyPress(.space) { open(movie); return .handled }
                                .onKeyPress(keys: [.leftArrow, .rightArrow, .upArrow, .downArrow]) { press in
                                    guard let i = movies.firstIndex(where: { $0.id == movie.id }) else { return .ignored }
                                    let delta: Int = switch press.key { case .leftArrow: -1; case .rightArrow: 1; case .upArrow: -count; case .downArrow: count; default: 0 }
                                    let next = movies[max(0,min(movies.count-1,i+delta))].id
                                    focused = next; reader.scrollTo(next); return .handled
                                }
                                .overlay { if focused == movie.id { Rectangle().stroke(accent,lineWidth: 2).padding(-4) } }
                                .accessibilityLabel("\(movie.displayTitle), \(movie.facts)\(movie.hasEnglishSub == true ? ", English Sub" : "")")
                                .contextMenu {
                                    Button("Quick Look") { open(movie) }; Button("Play Film") { play(movie) }; Divider()
                                    Button(marks[movie.id]?.favorite == true ? "Remove Favorite" : "Favorite") { toggle(movie, \.favorite) }
                                    Button(marks[movie.id]?.watchLater == true ? "Remove from Watch Later" : "Watch Later") { toggle(movie, \.watchLater) }
                                    Button(marks[movie.id]?.watched == true ? "Mark Unwatched" : "Mark Watched") { toggle(movie, \.watched) }; Divider()
                                    Button("Delete from Disk…", role: .destructive) { delete(movie) }
                                }
                        }
                    }.padding(24)
                }.onReceive(NotificationCenter.default.publisher(for: .init("BetterWatchRestoreFocus"))) { note in
                    if let id = note.object as? String, movies.contains(where: { $0.id == id }) {
                        focused = nil
                        Task { @MainActor in await Task.yield(); focused = id }
                    }
                }
            }
        }
    }
}
struct QuickLook: View {
    let movie: Movie
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) var dismiss
    @StateObject private var preview = Preview()
    @State private var volume: Double = 0.4
    @FocusState private var previewFocused: Bool
    var body: some View {
        VStack(spacing: 16) {
            HStack {
                Text("Quick Look").font(.callout.weight(.medium)).foregroundStyle(.secondary)
                Spacer()
                Button { dismiss() } label: { Image(systemName: "xmark").frame(width:24,height:24) }.buttonStyle(.plain).keyboardShortcut(.cancelAction).help("Close Quick Look (Esc)").accessibilityLabel("Close Quick Look")
            }
            GeometryReader { geometry in
                HStack(alignment: .top, spacing: 26) {
                    VStack(spacing: 12) {
                        ZStack {
                            Color.black
                            if let player = preview.player { NativePlayer(player: player) }
                            else { Cover(path: movie.thumbnail) }
                            if preview.loading { ProgressView().padding(14).background(.black.opacity(0.7), in: RoundedRectangle(cornerRadius:8)) }
                            if let error = preview.error { VStack(spacing:12) { Text(error).multilineTextAlignment(.center); Button("Retry Preview") { preview.load(movie,moment:preview.moment) } }.padding().background(.black.opacity(0.85)) }
                        }.aspectRatio(16/9,contentMode:.fit).clipped()
                        HStack(spacing: 10) {
                            ForEach(0..<3) { i in
                                Button { preview.load(movie,moment:i) } label: {
                                    VStack(spacing:8) { Rectangle().fill(preview.moment == i ? accent : .gray.opacity(0.5)).frame(height:2); Text(timestamp(momentSeconds(movie.duration,i))).font(.caption.monospacedDigit()) }.frame(maxWidth:.infinity)
                                }.buttonStyle(.plain).accessibilityLabel("Preview \(i+1), \(timestamp(momentSeconds(movie.duration,i)))").accessibilityAddTraits(preview.moment == i ? .isSelected : [])
                            }
                        }
                        HStack(spacing: 10) {
                            Button { if preview.ended { preview.replay() } else if preview.player?.rate == 0 { preview.player?.play() } else { preview.player?.pause() } } label: { Label(preview.ended ? "Replay" : "Play / Pause",systemImage: preview.ended ? "arrow.counterclockwise" : "playpause") }.disabled(preview.player == nil)
                            Spacer()
                            Button { volume = volume == 0 ? 0.4 : 0 } label: { Image(systemName:volume == 0 ? "speaker.slash" : "speaker.wave.2") }.buttonStyle(.plain).accessibilityLabel(volume == 0 ? "Unmute" : "Mute")
                            Slider(value:$volume,in:0...1).frame(width:85).accessibilityLabel("Preview volume")
                            Text("\(Int(volume*100))%").font(.caption.monospacedDigit()).frame(width:32)
                        }.controlSize(.small)
                        Text("←  →  Change preview").font(.caption).foregroundStyle(.secondary)
                        Spacer(minLength:0)
                    }.frame(width: max(350,geometry.size.width * 0.58))
                    ScrollView {
                        VStack(alignment:.leading,spacing:16) {
                            Text(movie.displayTitle).font(.system(size:27,weight:.bold)).fixedSize(horizontal:false,vertical:true).textSelection(.enabled)
                            Text(movie.facts).foregroundStyle(.secondary)
                            let location = movie.location(in:store.query.folder)
                            if !location.isEmpty && !(movie.categories ?? []).contains(location) { Text(location).font(.callout).foregroundStyle(.secondary) }
                            if let tags = movie.categories, !tags.isEmpty { FlowTags(tags:tags) }
                            Button { preview.stop(); store.play(movie) } label: { Label("Play Film",systemImage:"play.fill").fontWeight(.semibold).padding(.horizontal,8).padding(.vertical,4) }.buttonStyle(.plain).padding(.horizontal,12).padding(.vertical,7).background(Color.white,in:RoundedRectangle(cornerRadius:6)).foregroundStyle(.black)
                            ViewThatFits(in:.horizontal) {
                                HStack(spacing:15) { marks }
                                VStack(alignment:.leading,spacing:12) { marks }
                            }.padding(.vertical,5)
                            if let description = movie.description, !description.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty {
                                Divider()
                                Text("Description").font(.headline)
                                Text(description).font(.system(size:14)).lineSpacing(7).foregroundStyle(.white.opacity(0.85)).textSelection(.enabled).fixedSize(horizontal:false,vertical:true)
                            }
                            DisclosureGroup("File details") {
                                VStack(alignment:.leading,spacing:8) {
                                    Text(movie.relativePath).textSelection(.enabled)
                                    Text(ByteCountFormatter.string(fromByteCount:Int64(movie.size),countStyle:.file))
                                    if let date = movie.releaseDate { Text(date) }
                                }.font(.caption).foregroundStyle(.secondary).frame(maxWidth:.infinity,alignment:.leading).padding(.top,8)
                            }.font(.callout).padding(.top,8)
                        }.frame(maxWidth:.infinity,alignment:.leading).padding(.trailing,8)
                    }
                }
            }
        }.padding(24).frame(width: min(1120,(NSScreen.main?.visibleFrame.width ?? 1200)-100),height:min(690,(NSScreen.main?.visibleFrame.height ?? 800)-100))
            .background(Color(white:0.125)).preferredColorScheme(.dark)
            .focusable().focusEffectDisabled().focused($previewFocused)
            .task { previewFocused = true; preview.load(movie,moment:0) }
            .onDisappear { preview.stop() }
            .onChange(of:volume) { _,v in preview.player?.volume = Float(v) }
            .onChange(of:preview.player) { _,p in p?.volume = Float(volume) }
            .onKeyPress(.leftArrow) { preview.load(movie,moment:preview.moment-1); return .handled }
            .onKeyPress(.rightArrow) { preview.load(movie,moment:preview.moment+1); return .handled }
    }
    @ViewBuilder private var marks: some View {
        markButton("Favorite", "heart", \.favorite)
        markButton("Watch Later", "clock", \.watchLater)
        markButton("Watched", "checkmark.circle", \.watched)
    }
    private func markButton(_ label:String,_ symbol:String,_ key:WritableKeyPath<Mark,Bool>) -> some View {
        let active = (store.marks[movie.id] ?? Mark())[keyPath:key]
        return Button { store.toggle(movie,key) } label: { Label(label,systemImage: active ? symbol + ".fill" : symbol).font(.caption).foregroundStyle(active ? accent : .secondary) }.buttonStyle(.plain).accessibilityAddTraits(active ? .isSelected : [])
    }
}
struct NativePlayer: NSViewRepresentable {
    let player: AVPlayer
    func makeNSView(context:Context) -> AVPlayerView { let v = AVPlayerView(); v.controlsStyle = .none; v.allowsVideoFrameAnalysis = false; v.videoGravity = .resizeAspect; v.player = player; return v }
    func updateNSView(_ v:AVPlayerView,context:Context) { v.player = player }
    static func dismantleNSView(_ v:AVPlayerView,coordinator:()) { v.player = nil }
}
struct FlowTags: View {
    let tags:[String]
    var body:some View { TagLayout(spacing:6) { ForEach(tags,id:\.self) { Text($0).font(.caption).padding(.horizontal,10).padding(.vertical,5).background(.white.opacity(0.08),in:Capsule()).overlay(Capsule().stroke(.white.opacity(0.15),lineWidth:1)) } } }
}
struct TagLayout: Layout {
    let spacing:CGFloat
    func sizeThatFits(proposal:ProposedViewSize,subviews:Subviews,cache:inout ()) -> CGSize { arrange(proposal.width ?? 300,subviews).0 }
    func placeSubviews(in bounds:CGRect,proposal:ProposedViewSize,subviews:Subviews,cache:inout ()) { let points = arrange(bounds.width,subviews).1; for (i,s) in subviews.enumerated() { s.place(at:CGPoint(x:bounds.minX+points[i].x,y:bounds.minY+points[i].y),proposal:.unspecified) } }
    private func arrange(_ width:CGFloat,_ subviews:Subviews) -> (CGSize,[CGPoint]) {
        var x:CGFloat=0,y:CGFloat=0,row:CGFloat=0;var points:[CGPoint]=[]
        for view in subviews { let s=view.sizeThatFits(.unspecified);if x>0 && x+s.width>width { x=0;y+=row+spacing;row=0 }; points.append(CGPoint(x:x,y:y));x+=s.width+spacing;row=max(row,s.height) }
        return (CGSize(width:width,height:y+row),points)
    }
}
