#import "MPVKit.h"
#include "mpv/client.h"
#include "mpv/render_gl.h"
#include <OpenGL/gl3.h>
#include <dlfcn.h>
#include <stdatomic.h>

@implementation MPVVideoView {
    mpv_handle *_mpv;
    mpv_render_context *_renderer;
    dispatch_queue_t _engine;
    dispatch_source_t _timer;
    void (^_snapshot)(NSDictionary *);
    BOOL _closed, _loaded;
    NSString *_error;
    atomic_bool _renderQueued;
}
static void *getGL(void *context, const char *name) { return dlsym(RTLD_DEFAULT, name); }
static void renderUpdate(void *context) {
    MPVVideoView *view = (__bridge MPVVideoView *)context;
    if (atomic_exchange(&view->_renderQueued, true)) return;
    dispatch_async(dispatch_get_main_queue(), ^{
        atomic_store(&view->_renderQueued, false);
        if (!view->_closed) [view setNeedsDisplay:YES];
    });
}
- (instancetype)initWithURL:(NSString *)url start:(double)start volume:(double)volume snapshot:(void (^)(NSDictionary *))snapshot {
    NSOpenGLPixelFormatAttribute attributes[] = {NSOpenGLPFAOpenGLProfile, NSOpenGLProfileVersion3_2Core, NSOpenGLPFADoubleBuffer, NSOpenGLPFAAccelerated, NSOpenGLPFAColorSize, 24, 0};
    self = [super initWithFrame:NSZeroRect pixelFormat:[[NSOpenGLPixelFormat alloc] initWithAttributes:attributes]];
    if (!self) return nil;
    self.wantsBestResolutionOpenGLSurface = YES;
    _snapshot = [snapshot copy];
    _engine = dispatch_queue_create("local.better-watch.mpv", DISPATCH_QUEUE_SERIAL);
    dispatch_async(_engine, ^{
        self->_mpv = mpv_create();
        if (!self->_mpv) { [self fail:@"Could not create the playback engine."]; return; }
        NSDictionary *options = @{@"vo":@"libmpv", @"hwdec":@"auto-safe", @"config":@"no", @"terminal":@"no", @"input-default-bindings":@"no", @"input-vo-keyboard":@"no", @"osc":@"no", @"osd-level":@"0", @"keep-open":@"yes", @"idle":@"yes", @"cache":@"yes", @"cache-on-disk":@"no", @"demuxer-max-bytes":@"128MiB", @"demuxer-max-back-bytes":@"16MiB", @"demuxer-readahead-secs":@"90", @"cache-secs":@"90", @"cache-pause-wait":@"1", @"network-timeout":@"15", @"slang":@"en,eng,english", @"sub-auto":@"no", @"audio-display":@"no", @"volume":[NSString stringWithFormat:@"%f",volume], @"start":[NSString stringWithFormat:@"%f",start]};
        for (NSString *key in options) {
            int result = mpv_set_option_string(self->_mpv, key.UTF8String, [options[key] UTF8String]);
            if (result < 0) { [self fail:[NSString stringWithFormat:@"Playback option %@: %s", key, mpv_error_string(result)]]; return; }
        }
        int result = mpv_initialize(self->_mpv);
        if (result < 0) { [self fail:@(mpv_error_string(result))]; return; }
        dispatch_async(dispatch_get_main_queue(), ^{
            if (self->_closed) return;
            [self.openGLContext makeCurrentContext];
            mpv_opengl_init_params gl = {.get_proc_address = getGL};
            mpv_render_param params[] = {{MPV_RENDER_PARAM_API_TYPE, MPV_RENDER_API_TYPE_OPENGL}, {MPV_RENDER_PARAM_OPENGL_INIT_PARAMS, &gl}, {0}};
            int result = mpv_render_context_create(&self->_renderer, self->_mpv, params);
            if (result < 0) { if (self->_snapshot) self->_snapshot(@{@"error":@(mpv_error_string(result))}); return; }
            mpv_render_context_set_update_callback(self->_renderer, renderUpdate, (__bridge void *)self);
            [self command:@[@"loadfile",url,@"replace"]];
            dispatch_async(self->_engine, ^{ [self startObserving]; });
        });
    });
    return self;
}
- (void)fail:(NSString *)message {
    dispatch_async(dispatch_get_main_queue(), ^{ if (!self->_closed && self->_snapshot) self->_snapshot(@{@"error":message}); });
}
static id nodeValue(mpv_node *node) {
    switch (node->format) {
        case MPV_FORMAT_STRING: return node->u.string ? @(node->u.string) : @"";
        case MPV_FORMAT_FLAG: return @(node->u.flag != 0);
        case MPV_FORMAT_INT64: return @(node->u.int64);
        case MPV_FORMAT_DOUBLE: return @(node->u.double_);
        case MPV_FORMAT_NODE_ARRAY: {
            NSMutableArray *array = [NSMutableArray array];
            for (int i=0;i<node->u.list->num;i++) [array addObject:nodeValue(&node->u.list->values[i])];
            return array;
        }
        case MPV_FORMAT_NODE_MAP: {
            NSMutableDictionary *map = [NSMutableDictionary dictionary];
            for (int i=0;i<node->u.list->num;i++) map[@(node->u.list->keys[i])] = nodeValue(&node->u.list->values[i]);
            return map;
        }
        default: return [NSNull null];
    }
}
- (void)startObserving {
    _timer = dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER, 0, 0, _engine);
    dispatch_source_set_timer(_timer, DISPATCH_TIME_NOW, 250*NSEC_PER_MSEC, 25*NSEC_PER_MSEC);
    __weak MPVVideoView *weakSelf = self;
    dispatch_source_set_event_handler(_timer, ^{ [weakSelf publishSnapshot]; });
    dispatch_resume(_timer);
}
- (void)publishSnapshot {
    mpv_event *event;
    while ((event = mpv_wait_event(_mpv, 0))->event_id != MPV_EVENT_NONE) {
        if (event->event_id == MPV_EVENT_FILE_LOADED) _loaded = YES;
        if (event->event_id == MPV_EVENT_END_FILE) {
            mpv_event_end_file *end = event->data;
            if (end->reason == MPV_END_FILE_REASON_ERROR) _error = @(mpv_error_string(end->error));
        }
        if (event->event_id == MPV_EVENT_COMMAND_REPLY && event->error < 0) _error = @(mpv_error_string(event->error));
    }
    NSMutableDictionary *snapshot = [NSMutableDictionary dictionaryWithObject:@(_loaded) forKey:@"loaded"];
    for (NSString *key in @[@"time-pos",@"duration",@"pause",@"paused-for-cache",@"demuxer-cache-duration",@"demuxer-cache-state",@"eof-reached",@"volume",@"mute",@"track-list",@"hwdec-current",@"video-codec",@"video-params",@"frame-drop-count",@"audio-pts"]) {
        mpv_node node;
        if (mpv_get_property(_mpv,key.UTF8String,MPV_FORMAT_NODE,&node) >= 0) {
            snapshot[key] = nodeValue(&node); mpv_free_node_contents(&node);
        }
    }
    if (_error) snapshot[@"error"] = _error;
    dispatch_async(dispatch_get_main_queue(), ^{ if (!self->_closed && self->_snapshot) self->_snapshot(snapshot); });
}
- (void)command:(NSArray<NSString *> *)arguments {
    if (_closed) return;
    dispatch_async(_engine, ^{
        if (!self->_mpv) return;
        const char **args = calloc(arguments.count+1,sizeof(char *));
        for (NSUInteger i=0;i<arguments.count;i++) args[i] = arguments[i].UTF8String;
        int result = mpv_command_async(self->_mpv, 0, args);
        free(args);
        if (result < 0) [self fail:@(mpv_error_string(result))];
    });
}
- (void)drawRect:(NSRect)dirtyRect {
    if (_closed || !_renderer) return;
    [self.openGLContext makeCurrentContext];
    NSRect pixels = [self convertRectToBacking:self.bounds];
    if (pixels.size.width < 1 || pixels.size.height < 1) return;
    mpv_render_context_update(_renderer);
    mpv_opengl_fbo fbo = {.fbo=0, .w=(int)pixels.size.width, .h=(int)pixels.size.height};
    int flip=1;
    mpv_render_param params[] = {{MPV_RENDER_PARAM_OPENGL_FBO,&fbo},{MPV_RENDER_PARAM_FLIP_Y,&flip},{0}};
    mpv_render_context_render(_renderer,params);
    [self.openGLContext flushBuffer];
    mpv_render_context_report_swap(_renderer);
}
- (void)reshape { [super reshape]; [self setNeedsDisplay:YES]; }
- (BOOL)isOpaque { return YES; }
- (void)shutdown {
    if (_closed) return;
    _closed=YES; _snapshot=nil;
    if (_renderer) {
        [self.openGLContext makeCurrentContext];
        mpv_render_context_set_update_callback(_renderer,NULL,NULL);
        mpv_render_context_free(_renderer); _renderer=NULL;
    }
    // Never wait for mpv on the main/render thread, including during teardown.
    dispatch_async(_engine, ^{
        if (self->_timer) { dispatch_source_cancel(self->_timer); self->_timer=nil; }
        if (self->_mpv) { mpv_terminate_destroy(self->_mpv); self->_mpv=NULL; }
    });
}
@end
