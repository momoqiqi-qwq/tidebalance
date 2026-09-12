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
if (providers.gradleProperty("tidebalanceAndroid").orNull == "true") {
    include(":androidPlugin", ":tidebalanceAndroid", ":tauri-android", ":tauri-plugin-opener")
    project(":tauri-android").projectDir = file("tidebalanceAndroid/tauri")
    project(":tauri-plugin-opener").projectDir = file("tidebalanceAndroid/opener")
}
