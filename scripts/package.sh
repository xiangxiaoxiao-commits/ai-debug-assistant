#!/usr/bin/env bash
# 打一个便于分享的自包含 zip：解压后 ./start.sh 即可运行，无需 npm install。
# 要求：本机装了 Node 20+ 和 npm。
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT=$(pwd)
VERSION=$(node -p "require('./package.json').version")
STAMP=$(date +%Y%m%d-%H%M%S)
OUT_DIR="$ROOT/dist"
BUNDLE="ai-debug-assistant-${VERSION}-${STAMP}"
BUNDLE_DIR="$OUT_DIR/$BUNDLE"

echo "==> 清理旧 dist"
rm -rf "$OUT_DIR"
mkdir -p "$BUNDLE_DIR"

echo "==> 构建 (next build --output=standalone)"
npm run build > /dev/null

echo "==> 组装分发目录"
# Next.js standalone 已经把运行时 + node_modules 收拢到 .next/standalone
cp -R .next/standalone/. "$BUNDLE_DIR/"
mkdir -p "$BUNDLE_DIR/.next/static"
cp -R .next/static/. "$BUNDLE_DIR/.next/static/"
# public 目录（如果有）
if [ -d public ]; then
  cp -R public "$BUNDLE_DIR/public"
fi
# 附带 README 给同事
cp DISTRIBUTION_README.md "$BUNDLE_DIR/README.md" 2>/dev/null || true

echo "==> 生成启动脚本"
cat > "$BUNDLE_DIR/start.sh" <<'STARTSH'
#!/usr/bin/env bash
# AI Debug Assistant 启动脚本
# 需要 Node 20+
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "错误：未检测到 node。请先安装 Node.js 20+：https://nodejs.org/"
  exit 1
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "错误：需要 Node 20+，当前 $(node -v)。请升级。"
  exit 1
fi

PORT="${PORT:-8787}"
HOSTNAME="${HOSTNAME:-127.0.0.1}"

echo "==> 启动 AI Debug Assistant"
echo "    地址: http://$HOSTNAME:$PORT"
echo "    数据: ${AI_DEBUG_HOME:-$HOME/.ai-debug-assistant}"
echo "    停止: Ctrl+C"
echo ""

# 尝试自动打开浏览器（macOS/Linux/Windows Git Bash）
(sleep 1.5 && {
  if command -v open >/dev/null 2>&1; then open "http://$HOSTNAME:$PORT";
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "http://$HOSTNAME:$PORT";
  elif command -v start >/dev/null 2>&1; then start "http://$HOSTNAME:$PORT";
  fi
}) &

exec node server.js
STARTSH
chmod +x "$BUNDLE_DIR/start.sh"

echo "==> 生成 Windows 启动脚本"
cat > "$BUNDLE_DIR/start.bat" <<'STARTBAT'
@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo 错误：未检测到 node。请先安装 Node.js 20+：https://nodejs.org/
  pause
  exit /b 1
)

if not defined PORT set PORT=8787
if not defined HOSTNAME set HOSTNAME=127.0.0.1

echo ==^> 启动 AI Debug Assistant
echo     地址: http://%HOSTNAME%:%PORT%
echo     停止: Ctrl+C
echo.

start "" "http://%HOSTNAME%:%PORT%"
node server.js
STARTBAT

echo "==> 打包为 zip"
cd "$OUT_DIR"
zip -qr "${BUNDLE}.zip" "$BUNDLE"
BUNDLE_SIZE=$(du -sh "${BUNDLE}.zip" | cut -f1)

echo ""
echo "======================================================================"
echo "打包完成"
echo ""
echo "  文件：$OUT_DIR/${BUNDLE}.zip"
echo "  大小：$BUNDLE_SIZE"
echo ""
echo "分享给同事：只需拷贝这个 zip 文件。"
echo "同事解压后："
echo "  macOS/Linux:  cd $BUNDLE && ./start.sh"
echo "  Windows:      双击 start.bat"
echo "需要 Node.js 20+：https://nodejs.org/"
echo "======================================================================"
