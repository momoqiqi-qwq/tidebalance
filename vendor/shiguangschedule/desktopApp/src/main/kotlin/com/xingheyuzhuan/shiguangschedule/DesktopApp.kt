package com.xingheyuzhuan.shiguangschedule

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.xingheyuzhuan.shiguangschedule.ui.components.GlobalToastState

// Android uses system Toasts; desktop displays those same upstream messages above App().
@Composable fun DesktopApp() {
    val messages = remember { SnackbarHostState() }
    LaunchedEffect(Unit) { GlobalToastState.messages.collect { messages.showSnackbar(it) } }
    Box(Modifier.fillMaxSize()) {
        App()
        SnackbarHost(messages, Modifier.align(Alignment.BottomCenter).padding(16.dp))
    }
}
