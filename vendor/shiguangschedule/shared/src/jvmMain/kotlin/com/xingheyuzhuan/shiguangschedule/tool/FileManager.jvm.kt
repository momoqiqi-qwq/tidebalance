// Added by TideBalance: native desktop file picker; original common UI is unchanged.
package com.xingheyuzhuan.shiguangschedule.tool
import androidx.compose.runtime.*
import androidx.compose.ui.graphics.toComposeImageBitmap
import org.jetbrains.skia.Image
import java.io.File
import javax.swing.JFileChooser
import javax.swing.JOptionPane
import javax.swing.SwingUtilities
import javax.swing.filechooser.FileNameExtensionFilter
@Composable
actual fun rememberFileManager(callbacks: FileManagerCallbacks): FileManager {
 val current by rememberUpdatedState(callbacks)
 return remember { object : FileManager {
  override fun pickImage() { SwingUtilities.invokeLater {
   val picker=JFileChooser();picker.fileFilter=FileNameExtensionFilter("Images", "png", "jpg", "jpeg", "webp")
   val image=if(picker.showOpenDialog(null)==JFileChooser.APPROVE_OPTION) runCatching { Image.makeFromEncoded(picker.selectedFile.readBytes()).toComposeImageBitmap() }.getOrNull() else null
   current.onImagePicked?.invoke(image)
  } }
  override fun importFile(allowedExtensions: List<String>) { SwingUtilities.invokeLater {
   val picker=JFileChooser(); if(allowedExtensions.isNotEmpty()) picker.fileFilter=FileNameExtensionFilter(allowedExtensions.joinToString(),*allowedExtensions.toTypedArray())
   if(picker.showOpenDialog(null)==JFileChooser.APPROVE_OPTION) { val bytes=runCatching { picker.selectedFile.readBytes() }.getOrNull();current.onFileImported?.invoke(bytes,picker.selectedFile.name) }
   else current.onFileImported?.invoke(null,null)
  } }
  override fun exportFile(defaultFileName: String, bytes: ByteArray) { SwingUtilities.invokeLater {
   val picker=JFileChooser();picker.selectedFile=File(defaultFileName)
   if(picker.showSaveDialog(null)!=JFileChooser.APPROVE_OPTION) {current.onFileExported?.invoke(false);return@invokeLater}
   if(picker.selectedFile.exists() && JOptionPane.showConfirmDialog(null,"覆盖已有文件？","保存",JOptionPane.YES_NO_OPTION)!=JOptionPane.YES_OPTION) {current.onFileExported?.invoke(false);return@invokeLater}
   current.onFileExported?.invoke(runCatching { picker.selectedFile.writeBytes(bytes) }.isSuccess)
  } }
 } }
}
