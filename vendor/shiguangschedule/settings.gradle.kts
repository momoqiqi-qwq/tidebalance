pluginManagement {
    repositories {
        google {
            mavenContent {
                includeGroupAndSubgroups("androidx")
                includeGroupAndSubgroups("com.android")
                includeGroupAndSubgroups("com.google")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google {
            mavenContent {
                includeGroupAndSubgroups("androidx")
                includeGroupAndSubgroups("com.android")
                includeGroupAndSubgroups("com.google")
            }
        }
        mavenCentral()
    }
}

rootProject.name = "shiguangschedule"

include(":androidApp")
include(":shared")
include(":desktopApp")

// Opt-in Android host uses the original app as a library; no edits to Tauri's generated Gradle project.
if (providers.gradleProperty("leAndroid").orNull == "true") {
    include(":androidPlugin", ":leAndroid", ":tauri-android", ":tauri-plugin-opener")
    project(":tauri-android").projectDir = file("leAndroid/tauri")
    project(":tauri-plugin-opener").projectDir = file("leAndroid/opener")
}
