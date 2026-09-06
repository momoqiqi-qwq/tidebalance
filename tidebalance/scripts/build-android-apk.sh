#!/usr/bin/env bash
# 潮衡 Android APK 构建流水线（绕开两个 Windows 中文路径坑）：
#  1) tauri CLI 强制用 NDK 的 .cmd 链接器包装脚本，cmd.exe 有 8191 字符上限，
#     依赖一多链接命令行超长即损坏 → 直接用 clang.exe + --target 参数；
#  2) tauri CLI 会覆盖 CARGO_TARGET_*_LINKER/RUSTFLAGS 环境变量 → 不经过 tauri CLI，
#     手动 cargo 构建 .so，再让 gradle 直接打包签名（assets 已嵌入 Rust 库）。
#
# 用法: scripts/build-android-apk.sh [aarch64|x86_64|armv7|i686|all]   (默认 all=aarch64+x86_64)
set -e

TARGETS=${1:-all}
[ "$TARGETS" = "all" ] && TARGETS="aarch64 x86_64"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NDKBIN="D:/Environment/android-sdk/ndk/27.0.12077973/toolchains/llvm/prebuilt/windows-x86_64/bin"
export JAVA_HOME="C:/Users/yile/AppData/Local/Programs/Eclipse Adoptium/jdk-21.0.10.7-hotspot"
export ANDROID_HOME="D:/Environment/android-sdk"
export NDK_HOME="D:/Environment/android-sdk/ndk/27.0.12077973"
export PATH="$HOME/.cargo/bin:$JAVA_HOME/bin:$PATH"

# ① 前端构建（资产会被 Rust 库通过 custom-protocol 嵌入）
npx vite build

# ② 逐目标交叉编译 .so
for t in $TARGETS; do
  case $t in
    aarch64) triple=aarch64-linux-android;    api=24 ;;
    x86_64)  triple=x86_64-linux-android;     api=24 ;;
    armv7)   triple=armv7-linux-androideabi;  api=24 ;;
    i686)    triple=i686-linux-android;       api=24 ;;
    *) echo "未知目标: $t"; exit 1 ;;
  esac
  abi=$t; [ "$t" = "aarch64" ] && abi=arm64-v8a; [ "$t" = "armv7" ] && abi=armeabi-v7a
  key=$(echo "$triple" | tr 'a-z-' 'A-Z_')   # 环境变量名用下划线
  echo "── cargo build $triple ──"
  env "CARGO_TARGET_${key}_LINKER=$NDKBIN/clang.exe" \
      "CARGO_TARGET_${key}_RUSTFLAGS=-Clink-arg=--target=$triple$api -Clink-arg=-landroid -Clink-arg=-llog -Clink-arg=-lOpenSLES" \
    cargo build --lib --release --target "$triple" --features tauri/custom-protocol
  mkdir -p "src-tauri/gen/android/app/src/main/jniLibs/$abi"
  cp -f "src-tauri/target/$triple/release/libtidebalance_lib.so" \
        "src-tauri/gen/android/app/src/main/jniLibs/$abi/libtidebalance_lib.so"
  echo "── 已放入 jniLibs/$abi ──"
done

# ③ gradle 打包 + 签名（universal 变体包含 jniLibs 里现存的全部 ABI）
cd src-tauri/gen/android
./gradlew.bat --no-daemon :app:assembleUniversalRelease
echo "APK: $ROOT/src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk"
