# Source this file before building or testing on the M1 Asahi build host.
BETTER_WATCH_ANDROID_TOOLS="$HOME/.local/share/better-watch-android"
export JAVA_HOME="$BETTER_WATCH_ANDROID_TOOLS/jdk"
export ANDROID_HOME="$BETTER_WATCH_ANDROID_TOOLS/sdk"
export GRADLE_USER_HOME="$BETTER_WATCH_ANDROID_TOOLS/gradle"
export LD_LIBRARY_PATH="$BETTER_WATCH_ANDROID_TOOLS/usr/lib64${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export PATH="$JAVA_HOME/bin:$BETTER_WATCH_ANDROID_TOOLS/usr/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
