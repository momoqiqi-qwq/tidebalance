#!/usr/bin/env node
// 以 01-windows/app/package.json 为发布版本单一事实源，同步/校验三端和文档版本。
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CHECK = process.argv.includes("--check");
const pkgPath = path.join(ROOT, "01-windows/app/package.json");
const version = JSON.parse(fs.readFileSync(pkgPath, "utf8")).version;
const failures = [];

function syncJson(file, label) {
  const obj = JSON.parse(fs.readFileSync(file, "utf8"));
  if (obj.version === version) return;
  if (CHECK) failures.push(`${label}: ${obj.version || "<missing>"} != ${version}`);
  else {
    obj.version = version;
    fs.writeFileSync(file, JSON.stringify(obj, null, 2) + "\n");
  }
}

syncJson(path.join(ROOT, "01-windows/app/src-tauri/tauri.conf.json"), "tauri.conf.json");

const cargo = path.join(ROOT, "01-windows/app/src-tauri/Cargo.toml");
const cargoText = fs.readFileSync(cargo, "utf8");
const cargoVersion = cargoText.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
if (cargoVersion !== version) {
  if (CHECK) failures.push(`Cargo.toml: ${cargoVersion || "<missing>"} != ${version}`);
  else fs.writeFileSync(cargo, cargoText.replace(/^version\s*=\s*"[^"]+"/m, `version = "${version}"`));
}

const cargoLock = path.join(ROOT, "01-windows/app/src-tauri/Cargo.lock");
const lockText = fs.readFileSync(cargoLock, "utf8");
const lockMatch = lockText.match(/(\[\[package\]\]\nname = "letime"\nversion = ")([^"]+)(")/);
const lockVersion = lockMatch?.[2];
if (lockVersion !== version) {
  if (CHECK) failures.push(`Cargo.lock: ${lockVersion || "<missing>"} != ${version}`);
  else if (lockMatch) fs.writeFileSync(cargoLock, lockText.replace(lockMatch[0], lockMatch[1] + version + lockMatch[3]));
  else failures.push("Cargo.lock: 未找到 le-time-management 包版本");
}

const miniMeta = path.join(ROOT, "03-miniprogram/core/appMeta.js");
const miniText = fs.readFileSync(miniMeta, "utf8");
const miniVersion = miniText.match(/version:\s*"([^"]+)"/)?.[1];
if (miniVersion !== version) {
  if (CHECK) failures.push(`miniprogram appMeta: ${miniVersion || "<missing>"} != ${version}`);
  else fs.writeFileSync(miniMeta, miniText.replace(/version:\s*"[^"]+"/, `version: "${version}"`));
}

const readme = path.join(ROOT, "README.md");
const readmeText = fs.readFileSync(readme, "utf8");
const readmeVersion = readmeText.match(/版本：v(\d+\.\d+\.\d+)/)?.[1];
if (readmeVersion !== version) {
  if (CHECK) failures.push(`README.md: ${readmeVersion || "<missing>"} != ${version}`);
  else fs.writeFileSync(readme, readmeText.replace(/版本：v\d+\.\d+\.\d+/, `版本：v${version}`));
}

if (failures.length) {
  console.error(CHECK ? "版本一致性检查失败：" : "版本同步出现问题：");
  failures.forEach((x) => console.error("- " + x));
  process.exit(1);
}
console.log(CHECK ? `✓ 三端版本一致：v${version}` : `✓ 已同步三端版本：v${version}`);
