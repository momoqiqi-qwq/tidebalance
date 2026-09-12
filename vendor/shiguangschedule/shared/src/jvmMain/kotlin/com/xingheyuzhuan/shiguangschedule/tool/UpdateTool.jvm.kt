// Added by TideBalance: open official release pages with the desktop browser.
package com.xingheyuzhuan.shiguangschedule.tool
import java.awt.Desktop
import java.net.URI
actual object PlatformUpdateStrategy {
 actual val isUpdateSupported = true
 actual fun parseTargetUrl(response: ApiReleaseResponse): String? = response.assets.firstOrNull { it.name.endsWith(".msi",true) || it.name.endsWith(".exe",true) }?.downloadUrl
 actual fun openUrl(url: String) { val uri=URI(url);require(uri.scheme in listOf("http","https"));Desktop.getDesktop().browse(uri) }
}
