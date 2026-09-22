import Foundation
import UIKit

struct ServiceError: LocalizedError { let message: String; var errorDescription: String? { message } }
enum API {
    static var base: URL {
        URL(string: ProcessInfo.processInfo.environment["BW_SERVER_URL"] ?? UserDefaults.standard.string(forKey: "serverURL") ?? "https://m1-asahi.taila125ad.ts.net:8449")!
    }
    static let session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.urlCache = nil; config.httpMaximumConnectionsPerHost = 5
        config.timeoutIntervalForRequest = 90
        return URLSession(configuration: config)
    }()
    static func url(_ path: String) -> URL { URL(string: path, relativeTo: base)!.absoluteURL }
    static func data(_ path: String, body: [String: Any]? = nil, method: String? = nil) async throws -> Data {
        var request = URLRequest(url: url(path)); request.httpMethod = method ?? (body == nil ? "GET" : "POST")
        if let body { request.httpBody = try JSONSerialization.data(withJSONObject: body); request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        let (data, response) = try await session.data(for: request)
        guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode) else {
            let error = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
            throw ServiceError(message: error ?? "Could not connect. Check Tailscale and your server.")
        }
        return data
    }
}

actor MobileCovers {
    static let shared = MobileCovers()
    private let cache = NSCache<NSString, UIImage>()
    init() { cache.totalCostLimit = 48 * 1024 * 1024; cache.countLimit = 160 }
    func image(_ path: String) async throws -> UIImage {
        if let image = cache.object(forKey: path as NSString) { return image }
        let data = try await API.data(path + "?quality=cover&width=480")
        try Task.checkCancellation()
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let cg = CGImageSourceCreateThumbnailAtIndex(source, 0, [kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceThumbnailMaxPixelSize: 480] as CFDictionary) else { throw ServiceError(message: "Cover unavailable") }
        let image = UIImage(cgImage: cg)
        cache.setObject(image, forKey: path as NSString, cost: cg.bytesPerRow * cg.height)
        return image
    }
}
