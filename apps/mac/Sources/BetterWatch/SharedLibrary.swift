import Foundation

struct SharedSnapshot: Decodable {
    let marks: [String: Mark]
    let positions: [String: ResumePosition]
}

// The server owns shared lists and resume positions. Local files are retained as
// a recovery copy and imported once, without replacing existing server values.
@MainActor final class SharedLibrary {
    static let shared = SharedLibrary()
    private(set) var positions: [String: ResumePosition] = [:]
    var onMarks: (([String: Mark]) -> Void)?
    var onError: ((String) -> Void)?
    private var marks: [String: Mark] = [:]
    private var stream: Task<Void, Never>?
    private var writes: Task<Void, Never>?

    func connect(localMarks: [String: Mark]) async throws {
        if !UserDefaults.standard.bool(forKey: "sharedLibraryMigrated") {
            let url = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Better Watch/resume.json")
            let localPositions = (try? JSONDecoder().decode([String: ResumePosition].self, from: Data(contentsOf: url))) ?? [:]
            let marksObject = try JSONSerialization.jsonObject(with: JSONEncoder().encode(localMarks))
            let positionsObject = try JSONSerialization.jsonObject(with: JSONEncoder().encode(localPositions))
            _ = try await API.data("/api/profile/import", body: ["data": ["marks": marksObject, "positions": positionsObject]])
            UserDefaults.standard.set(true, forKey: "sharedLibraryMigrated")
        }
        try await refresh()
        if stream == nil { subscribe() }
    }
    func refresh() async throws {
        await flush()
        let data = try await API.data("/api/profile")
        let snapshot = try JSONDecoder().decode(SharedSnapshot.self, from: data)
        marks = snapshot.marks; positions = snapshot.positions; onMarks?(marks)
    }
    func setMark(_ id: String, field: String, value: Bool) {
        enqueue("/api/profile/marks/" + id, body: [field: value])
    }
    func savePosition(_ id: String, position: ResumePosition) {
        positions[id] = position
        enqueue("/api/profile/positions/" + id, body: ["seconds": position.seconds, "duration": position.duration])
    }
    func importMarks(_ values: [String: Mark]) async throws {
        await flush()
        let object = try JSONSerialization.jsonObject(with: JSONEncoder().encode(values))
        _ = try await API.data("/api/profile/import", body: ["data": ["marks": object], "overwrite": true])
        try await refresh()
    }
    private func enqueue(_ path: String, body: [String: Any]) {
        let previous = writes
        writes = Task {
            await previous?.value
            do { _ = try await API.data(path, body: body) }
            catch { onError?("Could not sync with your other devices: \(error.localizedDescription)") }
        }
    }
    func flush() async { await writes?.value }
    func disconnect() { stream?.cancel(); stream = nil }
    private func subscribe() {
        stream = Task {
            while !Task.isCancelled {
                do {
                    let (bytes, response) = try await API.session.bytes(from: API.url("/api/profile/events"))
                    guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw ServiceError(message: "Could not connect to shared lists.") }
                    for try await line in bytes.lines {
                        try Task.checkCancellation()
                        guard line.hasPrefix("data: "), let data = String(line.dropFirst(6)).data(using: .utf8) else { continue }
                        let event = try JSONSerialization.jsonObject(with: data) as? [String: Any]
                        if event?["type"] as? String == "snapshot" {
                            let snapshot = try JSONDecoder().decode(SharedSnapshot.self, from: data)
                            marks = snapshot.marks; positions = snapshot.positions; onMarks?(marks)
                        } else if let type = event?["type"] as? String, let id = event?["id"] as? String, let value = event?["value"], type == "marks" || type == "positions" {
                            let payload = try JSONSerialization.data(withJSONObject: value)
                            if type == "marks" { marks[id] = try JSONDecoder().decode(Mark.self, from: payload); onMarks?(marks) }
                            if type == "positions" { positions[id] = try JSONDecoder().decode(ResumePosition.self, from: payload) }
                        }
                    }
                } catch {
                    if Task.isCancelled { return }
                    onError?("Shared library connection interrupted. Reconnecting.")
                }
                do { try await Task.sleep(for: .seconds(5)) } catch { return }
            }
        }
    }
}
