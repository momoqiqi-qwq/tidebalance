import java.util.Properties

plugins { id("com.android.application") }
val tideProject = rootProject.projectDir.resolve("../../le-time-management")
val generated = tideProject.resolve("src-tauri/gen/android")
val keyProperties = Properties().apply {
    generated.resolve("keystore.properties").takeIf { it.isFile }?.inputStream()?.use { load(it) }
}
kotlin { jvmToolchain(21) }
android {
    namespace = "com.yile.letime"
    compileSdk = 37
    defaultConfig {
        applicationId = "com.yile.letime"
        minSdk = 26
        targetSdk = 37
        // Existing Le 0.1.0 installations use version code 1000.
        versionCode = 1001
        versionName = "0.1.0"
        manifestPlaceholders["usesCleartextTraffic"] = "false"
        ndk { abiFilters += listOf("arm64-v8a", "x86_64") }
    }
    signingConfigs {
        create("letimeRelease") {
            keyProperties.getProperty("storeFile")?.let {
                storeFile = generated.resolve(it)
                storePassword = keyProperties.getProperty("storePassword")
                keyAlias = keyProperties.getProperty("keyAlias")
                keyPassword = keyProperties.getProperty("keyPassword")
            }
        }
    }
    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("letimeRelease")
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"),
                generated.resolve("app/proguard-rules.pro"), rootProject.file("androidApp/proguard-rules.pro"), "proguard-host.pro")
            // Wry's Rust JNI looks up generated Activity/WebView methods by their original names.
            proguardFiles(*fileTree(generated.resolve("app/src/main")) { include("**/*.pro") }.files.toTypedArray())
        }
        debug { manifestPlaceholders["usesCleartextTraffic"] = "true" }
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_21; targetCompatibility = JavaVersion.VERSION_21 }
    buildFeatures { buildConfig = true }
}
androidComponents.onVariants { variant ->
    variant.sources.kotlin?.addStaticSourceDirectory(generated.resolve("app/src/main/java").absolutePath)
    variant.sources.java?.addStaticSourceDirectory(generated.resolve("app/src/main/java").absolutePath)
    variant.sources.res?.addStaticSourceDirectory(generated.resolve("app/src/main/res").absolutePath)
    variant.sources.jniLibs?.addStaticSourceDirectory(generated.resolve("app/src/main/jniLibs").absolutePath)
}
dependencies {
    implementation(project(":androidPlugin"))
    implementation(project(":tauri-android"))
    implementation(project(":tauri-plugin-opener"))
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("androidx.lifecycle:lifecycle-process:2.10.0")
    implementation("com.google.android.material:material:1.12.0")
}
