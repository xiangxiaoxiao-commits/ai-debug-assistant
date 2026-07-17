#!/usr/bin/env node
// Cross-platform packaging script. Runs on macOS / Linux / Windows.
// Produces dist/ai-debug-assistant-<version>-<stamp>.zip containing the
// Next.js standalone build + start scripts, ready for double-click usage.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const version = pkg.version;
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15).replace(/^(\d{8})(\d+)/, '$1-$2');
const bundle = `ai-debug-assistant-${version}-${stamp}`;
const outDir = path.join(root, 'dist');
const bundleDir = path.join(outDir, bundle);

console.log('==> 清理旧 dist');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(bundleDir, { recursive: true });

console.log('==> 构建 (next build --output=standalone)');
const build = spawnSync('npm', ['run', 'build'], { stdio: 'inherit', shell: true });
if (build.status !== 0) process.exit(build.status ?? 1);

console.log('==> 组装分发目录');
fs.cpSync(path.join(root, '.next/standalone'), bundleDir, { recursive: true });
const staticSrc = path.join(root, '.next/static');
const staticDst = path.join(bundleDir, '.next/static');
fs.mkdirSync(staticDst, { recursive: true });
fs.cpSync(staticSrc, staticDst, { recursive: true });

const publicSrc = path.join(root, 'public');
if (fs.existsSync(publicSrc)) {
  fs.cpSync(publicSrc, path.join(bundleDir, 'public'), { recursive: true });
}

const distReadme = path.join(root, 'DISTRIBUTION_README.md');
if (fs.existsSync(distReadme)) {
  fs.copyFileSync(distReadme, path.join(bundleDir, 'README.md'));
}

console.log('==> 生成启动脚本 (start.sh + start.bat)');

const startSh = `#!/usr/bin/env bash
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

PORT="\${PORT:-8787}"
HOSTNAME="\${HOSTNAME:-127.0.0.1}"

echo "==> 启动 AI Debug Assistant"
echo "    地址: http://$HOSTNAME:$PORT"
echo "    数据: \${AI_DEBUG_HOME:-$HOME/.ai-debug-assistant}"
echo "    停止: Ctrl+C"
echo ""

(sleep 1.5 && {
  if command -v open >/dev/null 2>&1; then open "http://$HOSTNAME:$PORT";
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "http://$HOSTNAME:$PORT";
  fi
}) &

exec node server.js
`;
fs.writeFileSync(path.join(bundleDir, 'start.sh'), startSh);
fs.chmodSync(path.join(bundleDir, 'start.sh'), 0o755);

const startBat = `@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo 错误：未检测到 node。请先安装 Node.js 20+：https://nodejs.org/
  pause
  exit /b 1
)

for /f "tokens=1 delims=." %%a in ('node -p "process.versions.node"') do set NODE_MAJOR=%%a
if %NODE_MAJOR% LSS 20 (
  echo 错误：需要 Node 20+，请升级
  pause
  exit /b 1
)

if not defined PORT set PORT=8787
if not defined HOSTNAME set HOSTNAME=127.0.0.1
if not defined AI_DEBUG_HOME set AI_DEBUG_HOME=%USERPROFILE%\\.ai-debug-assistant

echo ==^> 启动 AI Debug Assistant
echo     地址: http://%HOSTNAME%:%PORT%
echo     数据: %AI_DEBUG_HOME%
echo     停止: Ctrl+C
echo.

start "" "http://%HOSTNAME%:%PORT%"
node server.js
`;
fs.writeFileSync(path.join(bundleDir, 'start.bat'), startBat);

console.log('==> 打包为 zip');
const zipName = `${bundle}.zip`;

// Try native zip (macOS/Linux/GitBash); fall back to PowerShell on Windows.
let zipResult = spawnSync('zip', ['-qr', zipName, bundle], { cwd: outDir, stdio: 'inherit' });
if (zipResult.status !== 0 && zipResult.error) {
  console.log('  zip 命令不可用，尝试 PowerShell Compress-Archive');
  zipResult = spawnSync(
    'powershell',
    ['-NoProfile', '-Command', `Compress-Archive -Path "${bundleDir}" -DestinationPath "${path.join(outDir, zipName)}" -Force`],
    { stdio: 'inherit' }
  );
}
if (zipResult.status !== 0) {
  console.error('打包 zip 失败。请手动压缩:', bundleDir);
  process.exit(zipResult.status ?? 1);
}

const stats = fs.statSync(path.join(outDir, zipName));
const sizeMB = (stats.size / 1024 / 1024).toFixed(1);

console.log('');
console.log('======================================================================');
console.log('打包完成');
console.log('');
console.log(`  文件：${path.join(outDir, zipName)}`);
console.log(`  大小：${sizeMB}MB`);
console.log('');
console.log('分享给同事：只需拷贝这个 zip 文件。');
console.log('同事解压后：');
console.log(`  macOS/Linux:  cd ${bundle} && ./start.sh`);
console.log('  Windows:      双击 start.bat');
console.log('需要 Node.js 20+：https://nodejs.org/');
console.log('======================================================================');
