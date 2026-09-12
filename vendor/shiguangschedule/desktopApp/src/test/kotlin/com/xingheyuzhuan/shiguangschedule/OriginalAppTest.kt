package com.xingheyuzhuan.shiguangschedule

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.graphics.asSkiaBitmap
import org.jetbrains.skia.Image
import org.jetbrains.skia.EncodedImageFormat
import java.io.File
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.koin.plugin.module.dsl.startKoin
import java.nio.file.Files
import java.util.Locale

class OriginalAppTest {
    @get:Rule val compose = createComposeRule()

    @Before fun setup() {
        Locale.setDefault(Locale.SIMPLIFIED_CHINESE)
        System.setProperty("shiguang.dataDir", Files.createTempDirectory("shiguang-ui-test-").toString())
        startKoin<DesktopScheduleConfig> {}
    }

    @Test fun originalNavigationAndImportEntry() {
        compose.setContent { App() }
        compose.waitUntil(30_000) { compose.onAllNodesWithText("我的").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("我的").performClick()
        compose.waitUntil(30_000) { compose.onAllNodes(hasScrollAction()).fetchSemanticsNodes().isNotEmpty() }
        compose.onAllNodes(hasScrollAction()).onFirst().performScrollToNode(hasText("课表导入/导出"))
        compose.onNodeWithText("课表导入/导出", useUnmergedTree = true).assertExists().performScrollTo().performTouchInput { click() }
        compose.onNodeWithText("教务系统导入", useUnmergedTree = true).assertExists()
        compose.onNodeWithText("课程文件导入", useUnmergedTree = true).assertExists()
        val output = File(System.getProperty("shiguang.distribution"), "../../../../reports/original-import-screen.png")
        output.parentFile.mkdirs()
        output.writeBytes(Image.makeFromBitmap(compose.onRoot().captureToImage().asSkiaBitmap()).encodeToData(EncodedImageFormat.PNG)!!.bytes)
        compose.onNodeWithText("教务系统导入", useUnmergedTree = true).performScrollTo().performTouchInput { click() }
        compose.waitUntil(30_000) { compose.onAllNodesWithText("选择学校", useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("选择学校", useUnmergedTree = true).assertExists()
        compose.onRoot().printToLog("OriginalApp")
    }
}
