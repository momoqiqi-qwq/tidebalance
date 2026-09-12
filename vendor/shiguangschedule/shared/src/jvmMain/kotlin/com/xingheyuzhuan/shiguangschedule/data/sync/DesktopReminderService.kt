// Added by Le: consumes the same computed course instances as Android reminders.
package com.xingheyuzhuan.shiguangschedule.data.sync

import com.xingheyuzhuan.shiguangschedule.data.repository.AppSettingsRepository
import com.xingheyuzhuan.shiguangschedule.data.repository.WidgetRepository
import com.xingheyuzhuan.shiguangschedule.ui.components.ToastManager
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.first
import org.koin.core.annotation.Single
import java.awt.SystemTray
import java.awt.TrayIcon
import java.awt.Color
import java.awt.image.BufferedImage
import java.time.LocalDateTime
import java.time.LocalDate
import java.time.LocalTime
import javax.swing.SwingUtilities

@Single(createdAtStart = true)
class DesktopReminderService(
    private val settings: AppSettingsRepository,
    private val courses: WidgetRepository,
    private val synchronizer: WidgetDataSynchronizer
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val delivered = mutableMapOf<String, LocalDate>()
    private var day: LocalDate? = null
    private var tray: TrayIcon? = null

    init {
        scope.launch {
            while (isActive) {
                try { checkReminders() }
                catch (e: CancellationException) { throw e }
                catch (e: Exception) { System.err.println("Course reminder failed: ${e.message}") }
                delay(15_000)
            }
        }
    }

    private suspend fun checkReminders() {
        val now = LocalDateTime.now()
        if (day != now.toLocalDate()) {
            synchronizer.syncNow()
            day = now.toLocalDate()
            // A reminder for tomorrow may already have fired before midnight.
            delivered.entries.removeIf { it.value.isBefore(now.toLocalDate()) }
        }
        val config = settings.getAppSettings().first()
        if (!config.reminderEnabled) return
        val list = courses.getWidgetCoursesByDateRange(now.toLocalDate().toString(), now.toLocalDate().plusDays(1).toString()).first()
        for (course in list) {
            if (course.isSkipped) continue
            val start = LocalDateTime.of(LocalDate.parse(course.date), LocalTime.parse(course.startTime))
            val remind = start.minusMinutes(config.remindBeforeMinutes.toLong())
            val key = "${course.id}:${course.date}:${course.startTime}"
            // The 15-second poll must also catch reminders configured for class start.
            if (!now.isBefore(remind) && now.isBefore(start.plusSeconds(30)) && key !in delivered) {
                delivered[key] = start.toLocalDate()
                val message = "${course.startTime} ${course.position} ${course.teacher}".trim()
                withContext(Dispatchers.Main) { notify(course.name, message) }
            }
        }
    }

    private fun notify(title: String, body: String) {
        ToastManager.show("$title\n$body")
        if (!SystemTray.isSupported()) return
        if (tray == null) {
            val icon = BufferedImage(32, 32, BufferedImage.TYPE_INT_ARGB)
            icon.createGraphics().apply {
                color = Color(0x536A4B); fillRoundRect(0, 0, 32, 32, 8, 8)
                color = Color.WHITE; drawString("课", 8, 21); dispose()
            }
            tray = TrayIcon(icon, "时光课程表").also { it.isImageAutoSize = true; SystemTray.getSystemTray().add(it) }
        }
        tray?.displayMessage(title, body, TrayIcon.MessageType.INFO)
    }

    fun close() {
        scope.cancel()
        SwingUtilities.invokeLater { tray?.let { SystemTray.getSystemTray().remove(it) }; tray = null }
    }
}
