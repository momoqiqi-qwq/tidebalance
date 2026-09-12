package com.xingheyuzhuan.shiguangschedule

import androidx.compose.ui.window.Window
import androidx.compose.ui.window.application

// Modified by TideBalance: initialize original dependency graph before original App().
@org.koin.core.annotation.Module(includes = [com.xingheyuzhuan.shiguangschedule.data.di.SharedModule::class])
class DesktopModule {
    @org.koin.core.annotation.Single
    @org.koin.core.annotation.Named("AppVersionCode")
    fun versionCode(): Int = 34
    @org.koin.core.annotation.Single
    @org.koin.core.annotation.Named("AppVersionName")
    fun versionName(): String = "2.0.0-tidebalance"
}

@org.koin.core.annotation.KoinApplication(modules = [DesktopModule::class])
class DesktopScheduleConfig

fun main(args: Array<String>) {
    org.koin.plugin.module.dsl.startKoin<DesktopScheduleConfig> {}
    val parent = args.firstOrNull { it.startsWith("--tidebalance-parent=") }?.substringAfter('=')?.toLong()
    if (parent != null) {
        runTideBalanceHost(parent)
        return
    }
    application {
    Window(
        onCloseRequest = ::exitApplication,
        title = "shiguangschedule",
    ) {
        DesktopApp()
    }
}
}
