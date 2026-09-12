plugins { id("com.android.library") }
val upstream = file(providers.gradleProperty("tauriOpenerSource").get())
android {
    namespace = "app.tauri.opener"
    compileSdk = 37
    defaultConfig { minSdk = 26; consumerProguardFiles(upstream.resolve("consumer-rules.pro")) }
}
androidComponents.onVariants { variant ->
    listOf("java", "kotlin").map { upstream.resolve("src/main/$it") }.filter { it.isDirectory }.forEach {
        variant.sources.kotlin?.addStaticSourceDirectory(it.absolutePath)
        variant.sources.java?.addStaticSourceDirectory(it.absolutePath)
    }
    upstream.resolve("src/main/res").takeIf { it.isDirectory }?.let { variant.sources.res?.addStaticSourceDirectory(it.absolutePath) }
}
dependencies {
    implementation("androidx.core:core-ktx:1.9.0")
    implementation("androidx.browser:browser:1.8.0")
    implementation("com.fasterxml.jackson.core:jackson-databind:2.15.3")
    implementation(project(":tauri-android"))
}
