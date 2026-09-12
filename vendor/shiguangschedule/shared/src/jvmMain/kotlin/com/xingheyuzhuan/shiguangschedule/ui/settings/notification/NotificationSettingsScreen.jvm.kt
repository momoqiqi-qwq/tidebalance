// Added by TideBalance. Original settings state, persistence and dialogs are reused.
package com.xingheyuzhuan.shiguangschedule.ui.settings.notification

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.xingheyuzhuan.shiguangschedule.ui.components.ToastManager
import org.jetbrains.compose.resources.stringResource
import shiguangschedule.shared.generated.resources.*
import java.awt.Desktop
import java.net.URI

fun openDesktopNotificationSettings() {
    runCatching { Desktop.getDesktop().browse(URI("ms-settings:notifications")) }
        .onFailure { ToastManager.show("无法打开系统通知设置：${it.message}") }
}

@Composable
actual fun PlatformGeneralSettingsSection(uiState: NotificationSettingsUiState, viewModel: NotificationSettingsViewModel) {
    Column {
        Text(stringResource(Res.string.section_title_general), style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(8.dp))
        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
            elevation = CardDefaults.cardElevation(2.dp), modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(stringResource(Res.string.item_course_reminder), style = MaterialTheme.typography.titleMedium)
                    Switch(checked = uiState.reminderEnabled, onCheckedChange = viewModel::updateReminderEnabled)
                }
                Text("电脑开机且课表运行时发送提醒；系统通知设置决定是否显示横幅。",
                    style = MaterialTheme.typography.bodySmall)
                HorizontalDivider(Modifier.padding(vertical = 8.dp))
                SettingItemRow(title = stringResource(Res.string.item_remind_time_before),
                    currentValue = stringResource(Res.string.remind_time_minutes_format, uiState.remindBeforeMinutes),
                    onClick = { viewModel.showDialog(NotificationDialogType.EditRemindMinutes) })
                HorizontalDivider()
                SettingItemRow(title = "系统通知设置", onClick = ::openDesktopNotificationSettings)
                Text("Android 的上课自动勿扰、静音和穿戴设备同步尚未移植到 Windows。",
                    style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@Composable
actual fun PlatformNotificationDialogDispatcher(uiState: NotificationSettingsUiState, viewModel: NotificationSettingsViewModel) {
    NotificationDialogDispatcher(uiState, viewModel)
}
