package com.xingheyuzhuan.shiguangschedule

import com.sun.jna.Native
import com.sun.jna.Pointer
import com.sun.jna.platform.win32.User32
import com.sun.jna.platform.win32.WinDef.HWND
import com.sun.jna.platform.win32.WinDef.RECT
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit
import javax.swing.JFrame
import javax.swing.SwingUtilities

class NativeHostTest {
    private fun awaitCondition(check: () -> Boolean) {
        val end = System.nanoTime() + TimeUnit.SECONDS.toNanos(15)
        while (!check() && System.nanoTime() < end) Thread.sleep(50)
        assertTrue("Native window did not reach the requested state", check())
    }
    @Test fun packagedAppAttachesResizesHidesAndExitsWithHost() {
        val exe = File(System.getProperty("shiguang.distribution"), "ShiguangSchedule.exe")
        assertTrue("Bundled original executable must exist", exe.isFile)
        lateinit var parent: JFrame
        SwingUtilities.invokeAndWait { parent = JFrame("Le host integration test").apply { setSize(1000, 800); isVisible = true } }
        val handle = HWND(Native.getComponentPointer(parent))
        val child = ProcessBuilder(exe.absolutePath, "--le-parent=${Pointer.nativeValue(handle.pointer)}")
            .redirectError(File(System.getProperty("java.io.tmpdir"), "shiguang-host-test.log")).start()
        val ready = CompletableFuture<Boolean>()
        Thread {
            child.inputStream.bufferedReader().useLines { lines ->
                lines.forEach { if (it.trim() == "LE_READY") ready.complete(true) }
            }
            ready.complete(false)
        }.apply { isDaemon = true; start() }
        try {
            assertTrue("Original UI must acknowledge a successful native attachment", ready.get(40, TimeUnit.SECONDS))
            val input = child.outputStream.bufferedWriter()
            fun send(json: String) { input.write(json); input.newLine(); input.flush(); Thread.sleep(500) }
            send("""{"visible":true,"x":80,"y":60,"width":800,"height":600}""")
            var native: HWND? = null
            User32.INSTANCE.EnumChildWindows(handle, { window, _ -> if (native == null) native = window; true }, null)
            assertNotNull("Original Compose UI must be a child of the host", native)
            awaitCondition { User32.INSTANCE.IsWindowVisible(native) }
            send("""{"visible":true,"x":80,"y":60,"width":390,"height":640}""")
            val bounds = RECT()
            awaitCondition {
                User32.INSTANCE.GetWindowRect(native, bounds)
                bounds.right - bounds.left == 390 && bounds.bottom - bounds.top == 640
            }
            assertEquals(390, bounds.right - bounds.left)
            assertEquals(640, bounds.bottom - bounds.top)
            send("""{"visible":false}""")
            awaitCondition { !User32.INSTANCE.IsWindowVisible(native) }
            input.close()
            assertTrue("Child must exit after the host pipe closes", child.waitFor(10, TimeUnit.SECONDS))
            assertEquals(0, child.exitValue())
        } finally {
            child.destroyForcibly()
            SwingUtilities.invokeAndWait { parent.dispose() }
        }
    }
}
