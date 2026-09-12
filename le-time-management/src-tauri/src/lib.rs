mod care_voice;
mod native_schedule;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_opener::OpenerExt as _;

mod lan;

/// 应用数据目录（Windows: %APPDATA%，Linux: ~/.local/share，Android: 应用内部存储）
fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法定位数据目录: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("无法创建数据目录: {e}"))?;
    Ok(dir)
}

fn plugins_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = data_dir(app)?.join("plugins");
    fs::create_dir_all(&dir).map_err(|e| format!("无法创建插件目录: {e}"))?;
    Ok(dir)
}

/// 首次启动的示例数据，让应用一打开就有内容可玩
fn seed_data() -> Value {
    let today = js_datetoday();
    json!({
        "version": 1,
        "tasks": [
            { "id": "t1", "title": "回复导师：开题修改稿", "note": "", "quad": 1, "done": true,
              "estMin": 15, "tags": ["论文"], "project": "毕业设计", "due": today, "createdAt": now_ms() },
            { "id": "t2", "title": "修复登录页线上 bug", "note": "疑似 token 过期逻辑", "quad": 1, "done": false,
              "estMin": 60, "tags": ["线上"], "project": "毕业设计平台", "due": today, "createdAt": now_ms() },
            { "id": "t3", "title": "答辩 PPT · 第 3 章图表重绘", "note": "", "quad": 1, "done": false,
              "estMin": 120, "tags": ["答辩"], "project": "毕业设计", "due": today, "createdAt": now_ms() },
            { "id": "t4", "title": "精读《深度工作》第 4 章", "note": "", "quad": 2, "done": false,
              "estMin": 45, "tags": ["读书"], "project": "读书计划", "due": null, "createdAt": now_ms() },
            { "id": "t5", "title": "每周健身 3 次 · 第 2 次", "note": "背 + 二头", "quad": 2, "done": false,
              "estMin": 40, "tags": ["运动"], "project": "", "due": null, "createdAt": now_ms() },
            { "id": "t6", "title": "回飞书群消息 12 条", "note": "", "quad": 3, "done": false,
              "estMin": 10, "tags": [], "project": "", "due": today, "createdAt": now_ms() },
            { "id": "t7", "title": "取快递 + 缴水电费", "note": "", "quad": 3, "done": false,
              "estMin": 20, "tags": ["生活"], "project": "", "due": today, "createdAt": now_ms() },
            { "id": "t8", "title": "整理相册 · 6 月旅行", "note": "", "quad": 4, "done": false,
              "estMin": 30, "tags": [], "project": "", "due": null, "createdAt": now_ms() }
        ],
        "blocks": [
            { "id": "b1", "date": today, "start": "09:00", "durMin": 120, "title": "论文写作 · 第 3 章",
              "taskId": null, "cat": "work" },
            { "id": "b2", "date": today, "start": "11:00", "durMin": 45, "title": "整理参考文献",
              "taskId": null, "cat": "work" },
            { "id": "b3", "date": today, "start": "11:45", "durMin": 75, "title": "午餐 + 散步",
              "taskId": null, "cat": "life" }
        ],
        "settings": { "lastView": "quadrant", "lastDate": today },
        "plugins": {}
    })
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// 本地日期 YYYY-MM-DD（不依赖 chrono，用天总数换算）
fn js_datetoday() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let days = (secs + 8 * 3600) / 86400; // 按东八区
    let z = days + 719468;
    let era = z / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{y:04}-{m:02}-{d:02}")
}

#[tauri::command]
fn load_data(app: AppHandle) -> Result<Value, String> {
    let path = data_dir(&app)?.join("data.json");
    if !path.exists() {
        let seed = seed_data();
        fs::write(&path, serde_json::to_vec_pretty(&seed).unwrap())
            .map_err(|e| format!("写入初始数据失败: {e}"))?;
        return Ok(seed);
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("读取数据失败: {e}"))?;
    serde_json::from_str(&raw).map_err(|e| format!("数据文件损坏: {e}"))
}

#[tauri::command]
fn save_data(app: AppHandle, data: Value) -> Result<(), String> {
    let dir = data_dir(&app)?;
    let path = dir.join("data.json");
    let tmp = dir.join("data.json.tmp");
    fs::write(&tmp, serde_json::to_vec_pretty(&data).unwrap())
        .map_err(|e| format!("写入临时文件失败: {e}"))?;
    // 原子替换，避免写一半崩溃丢数据
    fs::rename(&tmp, &path).map_err(|e| format!("替换数据文件失败: {e}"))?;
    Ok(())
}

#[derive(serde::Serialize)]
struct PluginInfo {
    id: String,
    dir: String,
}

/// 枚举用户插件目录：{data_dir}/plugins/<id>/manifest.json
#[tauri::command]
fn list_plugins(app: AppHandle) -> Result<Vec<PluginInfo>, String> {
    let dir = plugins_dir(&app)?;
    let mut out = Vec::new();
    let entries = fs::read_dir(&dir).map_err(|e| format!("读取插件目录失败: {e}"))?;
    for entry in entries.flatten() {
        let pdir = entry.path();
        if pdir.is_dir() {
            if pdir.join("manifest.json").exists() {
                if let Some(name) = pdir.file_name().and_then(|n| n.to_str()) {
                    out.push(PluginInfo {
                        id: name.to_string(),
                        dir: pdir.to_string_lossy().to_string(),
                    });
                }
            }
        }
    }
    Ok(out)
}

/// 读取插件文件内容（仅允许插件目录内的文件，防目录穿越）
#[tauri::command]
fn read_plugin_file(app: AppHandle, rel_path: String) -> Result<String, String> {
    let root = plugins_dir(&app)?;
    let target = root.join(&rel_path);
    let canon_root = root.canonicalize().map_err(|e| e.to_string())?;
    let canon_target = match target.canonicalize() {
        Ok(p) => p,
        Err(_) => return Err(format!("插件文件不存在: {rel_path}")),
    };
    if !canon_target.starts_with(&canon_root) {
        return Err("禁止访问插件目录之外的文件".into());
    }
    fs::read_to_string(&canon_target).map_err(|e| format!("读取失败: {e}"))
}

/// 删除用户插件目录（仅允许 data_dir/plugins/<id> 一级目录，内置插件不可删除）
#[tauri::command]
fn delete_plugin(app: AppHandle, id: String) -> Result<(), String> {
    if id.contains('/') || id.contains('\\') || id == "." || id == ".." || id.trim().is_empty() {
        return Err("插件 ID 不合法".into());
    }
    let root = plugins_dir(&app)?;
    let target = root.join(&id);
    let canon_root = root.canonicalize().map_err(|e| format!("插件目录异常: {e}"))?;
    let canon_target = target
        .canonicalize()
        .map_err(|_| format!("用户插件不存在: {id}"))?;
    if !canon_target.starts_with(&canon_root) || canon_target == canon_root {
        return Err("禁止删除插件目录之外的文件".into());
    }
    if !canon_target.is_dir() {
        return Err("目标不是插件目录".into());
    }
    if !canon_target.join("manifest.json").exists() {
        return Err("目标目录缺少 manifest.json，拒绝删除".into());
    }
    fs::remove_dir_all(&canon_target).map_err(|e| format!("删除插件失败: {e}"))
}



fn valid_plugin_id(id: &str) -> bool {
    !id.trim().is_empty()
        && id != "."
        && id != ".."
        && !id.contains('/')
        && !id.contains('\\')
        && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
}

/// 从 zip 导入一个或多个用户插件。支持 `<id>/manifest.json` 和 zip 根目录直接放 manifest.json 两种格式。
#[tauri::command]
fn import_plugin_zip(app: AppHandle, bytes: Vec<u8>) -> Result<Vec<String>, String> {
    use std::io::{Cursor, Read};
    let root = plugins_dir(&app)?;
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|e| format!("ZIP 无法打开: {e}"))?;

    // 先定位 manifest，确定 zip 中的源前缀和最终插件 id。
    let mut plugins: Vec<(String, String)> = Vec::new(); // (source prefix, plugin id)
    for i in 0..archive.len() {
        let mut f = archive.by_index(i).map_err(|e| format!("读取 ZIP 失败: {e}"))?;
        let Some(path) = f.enclosed_name().map(|p| p.to_path_buf()) else { continue };
        if path.file_name().and_then(|x| x.to_str()) != Some("manifest.json") { continue; }
        let mut raw = String::new();
        f.read_to_string(&mut raw).map_err(|e| format!("读取 manifest.json 失败: {e}"))?;
        let man: Value = serde_json::from_str(&raw).map_err(|e| format!("manifest.json 格式错误: {e}"))?;
        let id = man.get("id").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
        if !valid_plugin_id(&id) { return Err(format!("插件 ID 不合法: {id}")); }
        let prefix = path.parent().map(|x| x.to_string_lossy().replace('\\', "/")).unwrap_or_default();
        plugins.push((prefix, id));
    }
    if plugins.is_empty() { return Err("ZIP 中未找到 manifest.json".into()); }
    plugins.sort();
    plugins.dedup();

    let mut imported = Vec::new();
    for (prefix, id) in &plugins {
        let dest = root.join(id);
        if dest.exists() { fs::remove_dir_all(&dest).map_err(|e| format!("覆盖旧插件失败: {e}"))?; }
        fs::create_dir_all(&dest).map_err(|e| format!("创建插件目录失败: {e}"))?;

        for i in 0..archive.len() {
            let mut f = archive.by_index(i).map_err(|e| format!("读取 ZIP 失败: {e}"))?;
            let Some(path) = f.enclosed_name().map(|p| p.to_path_buf()) else { continue };
            let norm = path.to_string_lossy().replace('\\', "/");
            let rel = if prefix.is_empty() {
                // 根目录插件：保留 assets/data 等子目录。
                norm.clone()
            } else {
                let pre = format!("{prefix}/");
                if !norm.starts_with(&pre) { continue; }
                norm[pre.len()..].to_string()
            };
            if rel.is_empty() { continue; }
            let out = dest.join(&rel);
            if f.is_dir() {
                fs::create_dir_all(&out).map_err(|e| format!("创建目录失败: {e}"))?;
            } else {
                if let Some(parent) = out.parent() { fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {e}"))?; }
                let mut data = Vec::new();
                f.read_to_end(&mut data).map_err(|e| format!("解压插件失败: {e}"))?;
                fs::write(&out, data).map_err(|e| format!("写入插件文件失败: {e}"))?;
            }
        }
        if !dest.join("manifest.json").exists() { return Err(format!("插件 {id} 导入后缺少 manifest.json")); }
        imported.push(id.clone());
    }
    Ok(imported)
}

/// 将所选用户插件打包为 zip，返回 base64，前端负责保存下载。
#[tauri::command]
fn export_plugins_zip(app: AppHandle, ids: Vec<String>) -> Result<String, String> {
    use base64::Engine as _;
    use std::io::{Cursor, Write};
    use zip::write::SimpleFileOptions;
    if ids.is_empty() { return Err("请先选择要导出的用户插件".into()); }
    let root = plugins_dir(&app)?;
    let mut cur = Cursor::new(Vec::<u8>::new());
    {
        let mut writer = zip::ZipWriter::new(&mut cur);
        let opt = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        for id in ids {
            if !valid_plugin_id(&id) { return Err(format!("插件 ID 不合法: {id}")); }
            let dir = root.join(&id);
            if !dir.join("manifest.json").exists() { return Err(format!("用户插件不存在: {id}")); }
            let mut stack = vec![dir.clone()];
            while let Some(path) = stack.pop() {
                for entry in fs::read_dir(&path).map_err(|e| format!("读取插件失败: {e}"))? {
                    let entry = entry.map_err(|e| e.to_string())?;
                    let p = entry.path();
                    if p.is_dir() { stack.push(p); continue; }
                    let rel = p.strip_prefix(&dir).map_err(|e| e.to_string())?.to_string_lossy().replace('\\', "/");
                    writer.start_file(format!("{id}/{rel}"), opt).map_err(|e| format!("创建 ZIP 失败: {e}"))?;
                    let data = fs::read(&p).map_err(|e| format!("读取插件文件失败: {e}"))?;
                    writer.write_all(&data).map_err(|e| format!("写入 ZIP 失败: {e}"))?;
                }
            }
        }
        writer.finish().map_err(|e| format!("完成 ZIP 失败: {e}"))?;
    }
    Ok(base64::engine::general_purpose::STANDARD.encode(cur.into_inner()))
}

#[derive(serde::Serialize)]
struct AppInfo {
    version: String,
    os: String,
    data_dir: String,
}

#[tauri::command]
fn app_info(app: AppHandle) -> Result<AppInfo, String> {
    Ok(AppInfo {
        version: app.package_info().version.to_string(),
        os: std::env::consts::OS.to_string(),
        data_dir: data_dir(&app)?.to_string_lossy().to_string(),
    })
}

#[derive(serde::Serialize)]
struct HttpResp {
    status: u16,
    body: String,
    #[serde(rename = "finalUrl")]
    final_url: String,
    #[serde(rename = "contentType")]
    content_type: String,
}

/// 插件网络桥：服务端抓取，绕开 WebView 的 CORS 限制
#[tauri::command]
async fn http_get(url: String) -> Result<HttpResp, String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("仅支持 http/https 地址".into());
    }
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Le/0.1")
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| format!("HTTP 客户端初始化失败: {e}"))?;
    let resp = client
        .get(&url)
        .header("Accept", "application/json, text/html;q=0.9, */*;q=0.8")
        .send()
        .await
        .map_err(|e| format!("请求失败: {e}"))?;
    let status = resp.status().as_u16();
    let final_url = resp.url().to_string();
    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    let body = resp.text().await.map_err(|e| format!("读取响应失败: {e}"))?;
    Ok(HttpResp { status, body, final_url, content_type })
}

/// 用系统默认浏览器打开外部链接（插件点击消息详情用）
#[tauri::command]
fn open_external(app: AppHandle, url: String) -> Result<(), String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("仅支持 http/https 链接".into());
    }
    app.opener().open_url(url, None::<&str>).map_err(|e| format!("打开失败: {e}"))
}

/* ── 局域网联动：手机/小程序作为遥控端 ── */

struct LanHandle(Mutex<Option<lan::LanInstance>>);

#[tauri::command]
fn lan_start(app: AppHandle, handle: State<LanHandle>, port: u16, token: String) -> Result<String, String> {
    let quit = Arc::new(AtomicBool::new(false));
    let data_path = data_dir(&app)?.join("data.json");
    let url = lan::spawn_server(app, port, token.clone(), data_path, quit.clone())?;
    *handle.0.lock().map_err(|_| "锁占用")? = Some(lan::LanInstance { quit, url: url.clone(), port, token });
    Ok(url)
}

#[tauri::command]
fn lan_stop(handle: State<LanHandle>) -> Result<(), String> {
    if let Some(inst) = handle.0.lock().map_err(|_| "锁占用")?.take() {
        inst.quit.store(true, std::sync::atomic::Ordering::Relaxed);
        // 发一个哑请求解除 recv 阻塞，让服务线程退出
        if let Ok(mut s) = std::net::TcpStream::connect(("127.0.0.1", inst.port)) {
            use std::io::Write as _;
            let _ = s.write_all(format!("GET /quit?token={} HTTP/1.1\r\nHost: localhost\r\n\r\n", inst.token).as_bytes());
        }
    }
    Ok(())
}

#[tauri::command]
fn lan_status(handle: State<LanHandle>) -> Result<Value, String> {
    Ok(match handle.0.lock().map_err(|_| "锁占用")?.as_ref() {
        Some(inst) => json!({ "running": true, "url": inst.url }),
        None => json!({ "running": false }),
    })
}

/// DES-ECB(PKCS5) 加密并输出 hex —— 超星登录等场景用（RustCrypto 实现，保证正确性）
#[tauri::command]
fn des_ecb_encrypt_hex(plain: String, key: String) -> Result<String, String> {
    use des::Des;
    use ecb::cipher::{BlockEncryptMut, KeyInit};
    use ecb::Encryptor;
    if key.as_bytes().len() != 8 {
        return Err("DES 密钥必须为 8 字节".into());
    }
    type DesEcb = Encryptor<Des>;
    let mut cipher = DesEcb::new_from_slice(key.as_bytes())
        .map_err(|e| format!("密钥初始化失败: {e}"))?;
    let mut buf = plain.as_bytes().to_vec();
    let pad = 8 - (buf.len() % 8);
    buf.extend(std::iter::repeat(pad as u8).take(pad));
    for chunk in buf.chunks_mut(8) {
        cipher.encrypt_block_mut(chunk.into());
    }
    Ok(hex::encode(buf))
}

/* ── 会话化 HTTP：带 Cookie Jar，供需要登录态的插件（如学习通）使用 ── */

pub struct HttpSessions(pub Mutex<HashMap<String, reqwest::Client>>);

fn new_http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .cookie_provider(Arc::new(reqwest::cookie::Jar::default()))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(25))
        .build()
        .map_err(|e| format!("HTTP 客户端初始化失败: {e}"))
}

#[derive(serde::Serialize)]
struct HttpFetchResp {
    status: u16,
    body: String,
    #[serde(rename = "finalUrl")]
    final_url: String,
    #[serde(rename = "contentType")]
    content_type: String,
    cookies: Vec<String>,
}

#[tauri::command]
fn http_session_new(state: State<HttpSessions>) -> Result<String, String> {
    let id = format!(
        "s{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    );
    state
        .0
        .lock()
        .map_err(|_| "会话表被占用")?
        .insert(id.clone(), new_http_client()?);
    Ok(id)
}

#[tauri::command]
async fn http_fetch(
    state: State<'_, HttpSessions>,
    sid: String,
    method: String,
    url: String,
    headers: Option<HashMap<String, String>>,
    body: Option<String>,
    binary: Option<bool>,
) -> Result<HttpFetchResp, String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("仅支持 http/https 地址".into());
    }
    let client = state
        .0
        .lock()
        .map_err(|_| "会话表被占用")?
        .get(&sid)
        .cloned()
        .ok_or("会话不存在或已过期，请重新创建")?;

    let mut req = match method.to_uppercase().as_str() {
        "POST" => client.post(&url),
        "PUT" => client.put(&url),
        "DELETE" => client.delete(&url),
        _ => client.get(&url),
    };
    if let Some(hs) = &headers {
        for (k, v) in hs {
            req = req.header(k, v);
        }
    }
    if let Some(b) = &body {
        req = req.body(b.clone());
    }
    let resp = req.send().await.map_err(|e| format!("请求失败: {e}"))?;
    let status = resp.status().as_u16();
    let final_url = resp.url().to_string();
    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    let cookies = resp
        .headers()
        .get_all(reqwest::header::SET_COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok())
        .map(|s| s.to_string())
        .collect();
    // binary=true 时返回 base64（验证码等图片场景）
    let resp_body = if binary.unwrap_or(false) {
        use base64::Engine as _;
        let bytes = resp.bytes().await.map_err(|e| format!("读取响应失败: {e}"))?;
        base64::engine::general_purpose::STANDARD.encode(&bytes)
    } else {
        resp.text().await.map_err(|e| format!("读取响应失败: {e}"))?
    };
    Ok(HttpFetchResp { status, body: resp_body, final_url, content_type, cookies })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();
    // 桌面端单实例：二次启动时聚焦已有窗口，避免多实例互相覆盖 data.json
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }));
    }
    #[cfg(target_os = "android")]
    { builder = builder.plugin(care_voice::init()).plugin(native_schedule::init()); }
    builder
        .plugin(tauri_plugin_opener::init())
        .manage(HttpSessions(Mutex::new(HashMap::new())))
        .manage(LanHandle(Mutex::new(None)))
        .manage(native_schedule::NativeSchedule::default())
        .invoke_handler(tauri::generate_handler![
            care_voice::care_voice,
            native_schedule::native_schedule,
            load_data,
            save_data,
            list_plugins,
            read_plugin_file,
            delete_plugin,
            import_plugin_zip,
            export_plugins_zip,
            app_info,
            http_get,
            open_external,
            des_ecb_encrypt_hex,
            http_session_new,
            http_fetch,
            lan_start,
            lan_stop,
            lan_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn des_matches_pydes_vectors() {
        // 向量由 python pyDes（超星登录同款 DES-ECB/PKCS5）计算
        assert_eq!(
            des_ecb_encrypt_hex("123456".into(), "u2oh6Vu^".into()).unwrap(),
            "218b246a6f42ee81"
        );
        assert_eq!(
            des_ecb_encrypt_hex("abc".into(), "u2oh6Vu^".into()).unwrap(),
            "4cfc33620fedd8d7"
        );
    }
}
