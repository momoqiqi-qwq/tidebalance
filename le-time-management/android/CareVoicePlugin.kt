package com.yile.letime

import android.app.Activity
import android.content.Intent
import android.speech.RecognizerIntent
import android.speech.tts.TextToSpeech
import android.webkit.WebView
import androidx.activity.result.ActivityResult
import androidx.appcompat.app.AppCompatActivity
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.util.Locale

@TauriPlugin
class CareVoicePlugin(private val host: Activity) : Plugin(host) {
    private var tts: TextToSpeech? = null
    private var ready = false
    private var listening = false
    override fun load(webView: WebView) {
        host.runOnUiThread {
            tts = TextToSpeech(host) { status ->
                if (status == TextToSpeech.SUCCESS) {
                    val language = tts?.setLanguage(Locale.SIMPLIFIED_CHINESE)
                    ready = language != TextToSpeech.LANG_MISSING_DATA && language != TextToSpeech.LANG_NOT_SUPPORTED
                    tts?.setSpeechRate(0.85f)
                }
            }
        }
    }
    @Command
    fun speak(invoke: Invoke) {
        val text = invoke.getArgs().optString("text", "").take(2000)
        host.runOnUiThread {
            if (!ready) { invoke.reject("请在系统文字转语音设置中启用中文语音"); return@runOnUiThread }
            val result = tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "care-reminder")
            if (result == TextToSpeech.ERROR) invoke.reject("系统朗读未能启动") else invoke.resolve()
        }
    }
    @Command
    fun stop(invoke: Invoke) { host.runOnUiThread { tts?.stop(); invoke.resolve() } }
    @Command
    fun listen(invoke: Invoke) {
        host.runOnUiThread {
            if (listening) { invoke.reject("语音输入正在进行"); return@runOnUiThread }
            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, "zh-CN")
                putExtra(RecognizerIntent.EXTRA_PROMPT, "请说提醒内容，例如明天早上八点提醒我用药")
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            }
            try { listening = true; startActivityForResult(invoke, intent, "recognized") }
            catch (error: Exception) { listening = false; invoke.reject("设备没有可用的语音输入服务，请使用输入法麦克风") }
        }
    }
    @ActivityCallback
    fun recognized(invoke: Invoke, result: ActivityResult) {
        listening = false
        val text = result.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()
        if (result.resultCode == Activity.RESULT_OK && !text.isNullOrBlank()) invoke.resolve(JSObject().apply { put("text", text) })
        else invoke.reject("语音输入已取消或没有听清")
    }
    override fun onDestroy(activity: AppCompatActivity) { tts?.stop(); tts?.shutdown(); tts = null }
}
