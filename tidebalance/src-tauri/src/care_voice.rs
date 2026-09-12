use tauri::Runtime;
#[cfg(target_os = "android")]
use tauri::Manager;

#[cfg(target_os = "android")]
struct CareVoice<R: Runtime>(tauri::plugin::PluginHandle<R>);

#[cfg(target_os = "android")]
pub fn init<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("care-voice")
        .setup(|app, api| {
            let handle = api.register_android_plugin("com.yile.tidebalance", "CareVoicePlugin")?;
            app.manage(CareVoice(handle));
            Ok(())
        })
        .build()
}

#[tauri::command]
pub async fn care_voice<R: Runtime>(app: tauri::AppHandle<R>, action: String, text: Option<String>) -> Result<serde_json::Value, String> {
    if !["speak", "listen", "stop"].contains(&action.as_str()) { return Err("未知语音操作".into()); }
    #[cfg(target_os = "android")]
    {
        let handle = app.state::<CareVoice<R>>();
        handle.0.run_mobile_plugin_async(&action, serde_json::json!({ "text": text.unwrap_or_default() })).await.map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "android"))]
    { let _ = (app, text); Err("当前平台使用系统 WebView 语音能力".into()) }
}
