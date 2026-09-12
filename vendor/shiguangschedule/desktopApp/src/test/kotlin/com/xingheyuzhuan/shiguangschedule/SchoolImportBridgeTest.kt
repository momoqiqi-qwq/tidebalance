package com.xingheyuzhuan.shiguangschedule

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.awt.ComposePanel
import com.xingheyuzhuan.shiguangschedule.data.repository.AppSettingsRepository
import com.xingheyuzhuan.shiguangschedule.data.repository.CourseTableRepository
import com.xingheyuzhuan.shiguangschedule.data.repository.CourseConversionRepository
import com.xingheyuzhuan.shiguangschedule.ui.settings.SettingsViewModel
import com.xingheyuzhuan.shiguangschedule.ui.schoolselection.web.*
import kotlinx.coroutines.*
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.first
import org.junit.Assert.*
import org.junit.Test
import org.koin.plugin.module.dsl.startKoin
import java.nio.file.Files
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import javax.swing.JFrame
import javax.swing.SwingUtilities

class SchoolImportBridgeTest {
    @Test fun chromiumCallsOriginalImportBridgeAndPersistsCourse() {
        System.setProperty("shiguang.dataDir", Files.createTempDirectory("shiguang-import-test-").toString())
        val koin = startKoin<DesktopScheduleConfig> {}.koin
        val settingsViewModel = koin.get<SettingsViewModel>()
        val tableId = runBlocking {
            withTimeout(30_000) { settingsViewModel.uiState.first { it.isReady } }
            withTimeout(30_000) { koin.get<CourseTableRepository>().getAllCourseTables().first { it.isNotEmpty() }.first().id }
        }
        assertTrue(tableId.isNotEmpty())
        val controller = DesktopWebController()
        val completed = CountDownLatch(1)
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
        val handler = WebBridgeHandler(scope, Channel(Channel.UNLIMITED), koin.get<CourseConversionRepository>(),
            { completed.countDown() }, controller::evaluateJavascript).apply { setImportTableId(tableId) }
        val started = AtomicBoolean(false)
        lateinit var frame: JFrame
        val script = """
            (async function() {
                await window.shiguangBridgePromise.saveImportedCourses(JSON.stringify([{
                    name: '原版教务桥测试课程', teacher: '测试教师', position: 'A101',
                    day: 1, startSection: 1, endSection: 2, weeks: [1,3,5]
                }]));
                window.shiguangBridge.notifyTaskCompletion();
            })();
        """.trimIndent()
        SwingUtilities.invokeAndWait {
            frame = JFrame("Original academic import integration test").apply {
                setSize(700, 600)
                add(ComposePanel().apply {
                    setContent {
                        PlatformWebView(Modifier.fillMaxSize(), "data:text/html,<title>Import fixture</title><h1>Academic import fixture</h1>",
                            true, false, controller, handler, { progress ->
                                if (progress >= 1f && started.compareAndSet(false, true)) controller.executeScript(script)
                            }, {}, {})
                    }
                })
                isVisible = true
            }
        }
        try {
            assertTrue("Actual Chromium must complete the upstream JS promise/native/database roundtrip", completed.await(90, TimeUnit.SECONDS))
            val saved = runBlocking { koin.get<CourseTableRepository>().getCoursesWithWeeksByTableId(tableId).first() }
            assertEquals(1, saved.size)
            assertEquals("原版教务桥测试课程", saved.single().course.name)
            assertEquals("A101", saved.single().course.position)
            assertEquals(setOf(1, 3, 5), saved.single().weeks.map { it.weekNumber }.toSet())
        } finally {
            SwingUtilities.invokeAndWait { frame.dispose() }
            scope.cancel()
        }
    }
}
