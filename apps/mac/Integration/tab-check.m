#import <AppKit/AppKit.h>
#import "MPVKit.h"
#include <math.h>

@interface TabProbe : NSObject
@property(nonatomic, strong) MPVVideoView *view;
@property(nonatomic, copy) NSDictionary *snapshot;
@property(nonatomic) NSUInteger snapshotCount;
@property(nonatomic) NSTimeInterval lastSnapshot;
@end
@implementation TabProbe
@end

static TabProbe *makeTab(NSString *fixture, double start) {
    TabProbe *tab = [TabProbe new];
    tab.snapshot = @{};
    __weak TabProbe *weakTab = tab;
    tab.view = [[MPVVideoView alloc] initWithURL:fixture start:start volume:0 paused:YES snapshot:^(NSDictionary *snapshot) {
        TabProbe *tab = weakTab;
        tab.snapshot = snapshot;
        tab.snapshotCount++;
        tab.lastSnapshot = NSDate.timeIntervalSinceReferenceDate;
    }];
    tab.view.frame = NSMakeRect(0, 0, 640, 360);
    return tab;
}

static void pump(TabProbe *active, double seconds) {
    NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:seconds];
    do {
        [[NSRunLoop mainRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.02]];
        // The window stays hidden, so explicitly service the selected view's render surface.
        [active.view drawRect:active.view.bounds];
    } while (deadline.timeIntervalSinceNow > 0);
}

static BOOL waitFor(TabProbe *active, double timeout, BOOL (^condition)(void)) {
    NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:timeout];
    while (!condition() && deadline.timeIntervalSinceNow > 0) pump(active, 0.02);
    return condition();
}

static NSInteger selectedTrack(TabProbe *tab, NSString *type) {
    for (NSDictionary *track in tab.snapshot[@"track-list"]) {
        if ([track[@"type"] isEqual:type] && [track[@"selected"] boolValue]) return [track[@"id"] integerValue];
    }
    return -1;
}

#define REQUIRE(condition, message) do { if (!(condition)) { fprintf(stderr, "FAIL: %s\n", message); return NO; } } while (0)

static BOOL checkTabs(NSArray<TabProbe *> *tabs) {
    TabProbe *first = tabs[0];
    [first.view setActive:YES];
    REQUIRE(waitFor(first, 15, ^BOOL {
        for (TabProbe *tab in tabs) {
            if (![tab.snapshot[@"loaded"] boolValue] || !tab.snapshot[@"time-pos"]) return NO;
        }
        return YES;
    }), "three paused views did not load");

    NSMutableArray<NSNumber *> *positions = [NSMutableArray array];
    for (TabProbe *tab in tabs) {
        REQUIRE(!tab.snapshot[@"error"], "loading a tab failed");
        REQUIRE([tab.snapshot[@"pause"] boolValue], "a tab started playing before selection");
        [positions addObject:tab.snapshot[@"time-pos"]];
    }
    [first.view command:@[@"set", @"aid", @"2"]];
    [first.view command:@[@"set", @"sid", @"1"]];
    REQUIRE(waitFor(first, 5, ^BOOL { return selectedTrack(first, @"audio") == 2 && selectedTrack(first, @"sub") == 1; }),
            "track selections did not apply");

    // Revisit the first tab after both other tabs played, using a fresh engine snapshot.
    for (NSNumber *index in @[@0, @1, @2, @0]) {
        NSUInteger selected = index.unsignedIntegerValue;
        TabProbe *active = tabs[selected];
        NSUInteger beforeActivation = active.snapshotCount;
        [active.view setActive:YES];
        REQUIRE(waitFor(active, 3, ^BOOL { return active.snapshotCount > beforeActivation; }), "reactivation did not publish state");
        REQUIRE([active.snapshot[@"pause"] boolValue], "an inactive tab kept playing");
        REQUIRE(fabs([active.snapshot[@"time-pos"] doubleValue] - positions[selected].doubleValue) < 0.15,
                "an inactive tab lost or advanced its playback position");
        if (selected == 0) {
            REQUIRE(selectedTrack(active, @"audio") == 2 && selectedTrack(active, @"sub") == 1,
                    "switching tabs lost audio or subtitle selection");
        }

        double start = [active.snapshot[@"time-pos"] doubleValue];
        [active.view command:@[@"set", @"pause", @"no"]];
        REQUIRE(waitFor(active, 5, ^BOOL { return [active.snapshot[@"time-pos"] doubleValue] > start + 0.4; }),
                "selected video did not play");
        REQUIRE(waitFor(active, 3, ^BOOL {
            for (TabProbe *tab in tabs) {
                if (tab != active && NSDate.timeIntervalSinceReferenceDate - tab.lastSnapshot < 0.4) return NO;
            }
            return YES;
        }), "inactive snapshots never became idle");
        NSMutableArray<NSNumber *> *counts = [NSMutableArray array];
        for (TabProbe *tab in tabs) [counts addObject:@(tab.snapshotCount)];
        pump(active, 0.8);
        for (NSUInteger i = 0; i < tabs.count; i++) {
            REQUIRE(!tabs[i].snapshot[@"error"], "playback reported an engine error");
            if (i != selected) REQUIRE(tabs[i].snapshotCount == counts[i].unsignedIntegerValue, "an inactive tab kept publishing snapshots");
        }

        [active.view command:@[@"set", @"pause", @"yes"]];
        REQUIRE(waitFor(active, 3, ^BOOL { return [active.snapshot[@"pause"] boolValue]; }), "tab did not pause");
        positions[selected] = active.snapshot[@"time-pos"];
        [active.view setActive:NO];
    }
    // Read every paused position again; stale hidden snapshots cannot conceal continued playback.
    for (NSUInteger i = 0; i < tabs.count; i++) {
        TabProbe *tab = tabs[i];
        NSUInteger before = tab.snapshotCount;
        [tab.view setActive:YES];
        REQUIRE(waitFor(tab, 3, ^BOOL { return tab.snapshotCount > before; }), "final state was not refreshed");
        REQUIRE([tab.snapshot[@"pause"] boolValue] && fabs([tab.snapshot[@"time-pos"] doubleValue] - positions[i].doubleValue) < 0.15,
                "a retained tab changed while inactive");
        [tab.view setActive:NO];
    }
    return YES;
}

int main(int argc, char **argv) {
    @autoreleasepool {
        if (argc != 2) { fprintf(stderr, "Usage: tab-check fixture.mkv\n"); return 1; }
        [NSApplication sharedApplication];
        [NSApp setActivationPolicy:NSApplicationActivationPolicyProhibited];
        NSWindow *window = [[NSWindow alloc] initWithContentRect:NSMakeRect(0, 0, 640, 360)
                                                     styleMask:NSWindowStyleMaskBorderless backing:NSBackingStoreBuffered defer:NO];
        window.releasedWhenClosed = NO;
        NSString *fixture = @(argv[1]);
        NSArray<TabProbe *> *tabs = @[makeTab(fixture, 1), makeTab(fixture, 2), makeTab(fixture, 3)];
        for (TabProbe *tab in tabs) {
            [window.contentView addSubview:tab.view];
            [tab.view setActive:NO];
        }
        BOOL passed = checkTabs(tabs);
        NSMutableArray<NSNumber *> *counts = [NSMutableArray array];
        for (TabProbe *tab in tabs) {
            [counts addObject:@(tab.snapshotCount)];
            [tab.view shutdown];
            [tab.view shutdown];
        }
        TabProbe *closing = makeTab(fixture, 0);
        [closing.view setActive:YES];
        [closing.view shutdown];
        pump(nil, 1);
        for (NSUInteger i = 0; i < tabs.count; i++) {
            if (tabs[i].snapshotCount != counts[i].unsignedIntegerValue) {
                fprintf(stderr, "FAIL: a closed tab published a snapshot\n"); passed = NO;
            }
        }
        if (closing.snapshotCount != 0) { fprintf(stderr, "FAIL: a tab closed during loading published state\n"); passed = NO; }
        [window close];
        if (passed) printf("Three retained video views: switching, idle backgrounds, track retention, and shutdown passed\n");
        return passed ? 0 : 1;
    }
}
