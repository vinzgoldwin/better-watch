#import <AppKit/AppKit.h>
NS_ASSUME_NONNULL_BEGIN
// Commands and property reads run off the render thread. No media is written to disk.
@interface MPVVideoView : NSOpenGLView
- (instancetype)initWithURL:(NSString *)url start:(double)start volume:(double)volume paused:(BOOL)paused snapshot:(void (^)(NSDictionary *))snapshot;
// Inactive views retain playback state without rendering or periodic snapshots. Call on the main thread.
- (void)setActive:(BOOL)active;
- (void)command:(NSArray<NSString *> *)arguments;
- (void)shutdown;
@end
NS_ASSUME_NONNULL_END
