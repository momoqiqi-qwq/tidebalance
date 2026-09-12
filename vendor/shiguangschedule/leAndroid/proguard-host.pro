# Rust JNI resolves host classes and inherited Activity methods by name.
# These generated classes live under the app namespace, outside app.tauri's consumer rules.
-keep class com.yile.letime.** { *; }
-keep class app.tauri.** { *; }
