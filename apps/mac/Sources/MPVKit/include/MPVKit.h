#import <AppKit/AppKit.h>
NS_ASSUME_NONNULL_BEGIN
// Commands and property reads run off the render thread. No media is written to disk.
@interface MPVVideoView : NSOpenGLView
- (instancetype)initWithURL:(NSString *)url start:(double)start volume:(double)volume snapshot:(void (^)(NSDictionary *))snapshot;
- (void)command:(NSArray<NSString *> *)arguments;
- (void)shutdown;
@end
NS_ASSUME_NONNULL_END
