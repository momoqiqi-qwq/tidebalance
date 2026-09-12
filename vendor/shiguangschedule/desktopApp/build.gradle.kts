import org.jetbrains.compose.desktop.application.dsl.TargetFormat
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.compose.multiplatform)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.koin.compiler)
}

// Windows jlink/jpackage argument files cannot reliably round-trip non-ASCII paths.
providers.gradleProperty("shiguangDesktopBuildDir").orNull?.let { layout.buildDirectory.set(file(it)) }

kotlin {
    compilerOptions {
        jvmTarget = JvmTarget.JVM_21
    }
}

dependencies {
    implementation(project(":shared"))
    implementation(project.dependencies.platform(libs.koin.bom))
    implementation(libs.koin.core)
    implementation(libs.koin.annotations)
    implementation("net.java.dev.jna:jna-platform:5.6.0")
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.koin.compose)

    implementation(compose.desktop.currentOs)
    implementation(libs.kotlinx.coroutines.swing)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.compose.material3)
    testImplementation(compose.desktop.uiTestJUnit4)
    testImplementation(libs.junit)
    testImplementation(libs.androidx.lifecycle.viewmodel.compose)
}


compose.desktop {
    application {
        mainClass = "com.xingheyuzhuan.shiguangschedule.MainKt"
        jvmArgs += listOf("--add-opens=java.desktop/sun.awt=ALL-UNNAMED")

        buildTypes.release.proguard {
            isEnabled.set(false)
        }

        nativeDistributions {
            targetFormats(TargetFormat.Exe, TargetFormat.Dmg, TargetFormat.Msi, TargetFormat.Deb)
            packageName = "ShiguangSchedule"
            modules("java.sql", "java.net.http", "jdk.crypto.ec", "jdk.unsupported")
            packageVersion = "1.0.0"
        }
    }
}

tasks.test {
    forkEvery = 1
    dependsOn("createDistributable")
    systemProperty("shiguang.distribution", layout.buildDirectory.dir("compose/binaries/main/app/ShiguangSchedule").get().asFile.absolutePath)
    jvmArgs("--add-opens=java.desktop/sun.awt=ALL-UNNAMED")
}
