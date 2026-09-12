// Added by TideBalance. Uses original WebViewScreen and WebBridgeHandler unchanged.
package com.xingheyuzhuan.shiguangschedule.ui.schoolselection.web

import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.awt.SwingPanel
import androidx.compose.material3.Text
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*
import me.friwi.jcefmaven.CefAppBuilder
import org.cef.CefApp
import org.cef.browser.CefBrowser
import org.cef.browser.CefFrame
import org.cef.browser.CefMessageRouter
import org.cef.callback.CefQueryCallback
import org.cef.handler.CefDisplayHandlerAdapter
import org.cef.handler.CefLoadHandlerAdapter
import org.cef.handler.CefMessageRouterHandlerAdapter
import java.io.File
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import javax.swing.SwingUtilities

actual val isDesktopPlatform = true
@Composable actual fun PlatformBackHandler(enabled: Boolean, onBack: () -> Unit) {}
private object DesktopBrowserRuntime {
 private var app: CefApp? = null
 @Synchronized fun get(): CefApp {
  app?.let { return it }
  val builder = CefAppBuilder()
  builder.setInstallDir(File(System.getProperty("user.home"), ".tidebalance/shiguang/jcef"))
  builder.cefSettings.windowless_rendering_enabled = false
  return builder.build().also { app = it }
 }
}
class DesktopWebController : WebViewController {
 var browser: CefBrowser? = null
 val replies = ConcurrentHashMap<String,(String?) -> Unit>()
 override val currentUrl get() = browser?.url ?: ""
 override fun reload() { browser?.reload() }
 override fun goBack(): Boolean { if(!canGoBack())return false;browser?.goBack();return true }
 override fun canGoBack() = browser?.canGoBack() ?: false
 override fun setDevToolsEnabled(enabled: Boolean) { if(enabled) browser?.openDevTools() else browser?.closeDevTools() }
 override fun executeScript(jsCode: String) { browser?.executeJavaScript(JS_BRIDGE_INIT+"\n"+jsCode,currentUrl,0) }
 override fun evaluateJavascript(script: String, callback: ((String?) -> Unit)?) {
  if(callback==null) { executeScript(script);return }
  val id=UUID.randomUUID().toString();replies[id]=callback
  val quoted=Json.encodeToString(script)
  browser?.executeJavaScript(JS_BRIDGE_INIT+"\n(function(){let result;try{result=JSON.stringify((0,eval)($quoted));}catch(e){result=null;}window.cefQuery({request:JSON.stringify({tideEval:'$id',result:result})});})();",currentUrl,0)
 }
}
@Composable actual fun rememberWebViewController(): WebViewController = remember { DesktopWebController() }
@Composable actual fun PlatformWebView(
 modifier: Modifier, url: String, isDesktopMode: Boolean, isDevToolsEnabled: Boolean,
 controller: WebViewController, bridgeHandler: WebBridgeHandler,
 onProgressChange: (Float)->Unit, onTitleChange:(String)->Unit, onNavigateToSchedule:()->Unit
) {
 val web = controller as DesktopWebController
 val progress by rememberUpdatedState(onProgressChange)
 val title by rememberUpdatedState(onTitleChange)
 val handler by rememberUpdatedState(bridgeHandler)
 var app by remember { mutableStateOf<CefApp?>(null) }
 var error by remember { mutableStateOf<String?>(null) }
 LaunchedEffect(Unit) { try { app=withContext(Dispatchers.IO){DesktopBrowserRuntime.get()} } catch(e:Exception){ error=e.message ?: "Chromium 初始化失败" } }
 if(error!=null) { Text("浏览器初始化失败：$error",modifier);return }
 if(app==null) { Text("正在准备教务浏览器…",modifier);return }
 val client = remember(app) { app!!.createClient() }
 val browser = remember(client) { client.createBrowser(url.ifBlank { "about:blank" },false,false) }
 DisposableEffect(browser) {
  web.browser=browser
  val router=CefMessageRouter.create()
  router.addHandler(object:CefMessageRouterHandlerAdapter(){
   override fun onQuery(browser:CefBrowser,frame:CefFrame,queryId:Long,request:String,persistent:Boolean,callback:CefQueryCallback):Boolean {
    val obj=runCatching { Json.parseToJsonElement(request).jsonObject }.getOrNull() ?: return false
    val id=obj["tideEval"]?.jsonPrimitive?.contentOrNull
    SwingUtilities.invokeLater {
     if(id!=null) web.replies.remove(id)?.invoke(obj["result"]?.jsonPrimitive?.contentOrNull)
     else handler.onMessageReceived(request)
    }
    callback.success("");return true
   }
  },true)
  client.addMessageRouter(router)
  client.addDisplayHandler(object:CefDisplayHandlerAdapter(){
   override fun onTitleChange(browser:CefBrowser,titleText:String) {SwingUtilities.invokeLater {title(titleText)}}
  })
  client.addLoadHandler(object:CefLoadHandlerAdapter(){
   override fun onLoadingStateChange(browser:CefBrowser,loading:Boolean,back:Boolean,forward:Boolean) {SwingUtilities.invokeLater {progress(if(loading)0.1f else 1f)}}
   override fun onLoadEnd(browser:CefBrowser,frame:CefFrame,httpStatusCode:Int) {if(frame.isMain)browser.executeJavaScript(JS_BRIDGE_INIT,browser.url,0)}
  })
  onDispose {web.browser=null;web.replies.clear();client.removeMessageRouter(router);router.dispose();browser.close(true);client.dispose()}
 }
 LaunchedEffect(url) {if(url.isNotBlank() && browser.url!=url)browser.loadURL(url)}
 LaunchedEffect(isDevToolsEnabled) {web.setDevToolsEnabled(isDevToolsEnabled)}
 SwingPanel(factory={browser.uiComponent},modifier=modifier)
}
