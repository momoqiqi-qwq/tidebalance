// Builds unmodified Tauri Android source with the same AGP/Kotlin toolchain as the original course app.
plugins { id("com.android.library") }
val upstream = file(providers.gradleProperty("tauriAndroidSource").get())
android {
    namespace = "app.tauri"
    compileSdk = 37
    defaultConfig { minSdk = 26; consumerProguardFiles(upstream.resolve("proguard-rules.pro")) }
    buildFeatures { buildConfig = true }
}
androidComponents.onVariants { variant ->
    listOf("java", "kotlin").map { upstream.resolve("src/main/$it") }.filter { it.isDirectory }.forEach {
        variant.sources.kotlin?.addStaticSourceDirectory(it.absolutePath)
        variant.sources.java?.addStaticSourceDirectory(it.absolutePath)
    }
    upstream.resolve("src/main/res").takeIf { it.isDirectory }?.let { variant.sources.res?.addStaticSourceDirectory(it.absolutePath) }
}
dependencies {
    implementation("androidx.core:core-ktx:1.7.0")
    implementation("androidx.appcompat:appcompat:1.6.0")
    implementation("com.google.android.material:material:1.7.0")
    implementation("com.fasterxml.jackson.core:jackson-databind:2.15.3")
}
