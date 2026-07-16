#!/usr/bin/env node
// Build and package the AI Memory Service into a self-contained zip.
// Usage: node scripts/package.mjs
// Output: dist/ai-memory-service-<version>-<timestamp>.zip

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const VERSION = pkg.version;
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19).replace('T', '_');
const BUNDLE_NAME = `ai-memory-service-${VERSION}-${STAMP}`;
const OUT_DIR = path.join(root, 'dist');
const BUNDLE_DIR = path.join(OUT_DIR, BUNDLE_NAME);

function run(cmd, args, opts = {}) {
  console.log(`==> ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (r.status !== 0) {
    console.error(`Failed: ${cmd} ${args.join(' ')}`);
    process.exit(r.status ?? 1);
  }
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

// 1. Clean dist
console.log('==> Cleaning dist');
fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(BUNDLE_DIR, { recursive: true });

// 2. Next.js build
run('npm', ['run', 'build']);

// 3. MCP build
run('node', ['scripts/build-mcp.mjs']);

// 4. Assemble distribution directory
console.log('==> Assembling distribution directory');

// Next.js standalone
copyDir(path.join(root, '.next/standalone'), BUNDLE_DIR);

// Static assets
const staticDest = path.join(BUNDLE_DIR, '.next/static');
fs.mkdirSync(staticDest, { recursive: true });
copyDir(path.join(root, '.next/static'), staticDest);

// MCP server
const mcpDest = path.join(BUNDLE_DIR, 'mcp');
fs.mkdirSync(mcpDest, { recursive: true });
copyDir(path.join(root, 'dist/mcp'), mcpDest);

// README
fs.copyFileSync(path.join(root, 'README.md'), path.join(BUNDLE_DIR, 'README.md'));

// Python SDK
const pyDest = path.join(BUNDLE_DIR, 'examples/python');
fs.mkdirSync(pyDest, { recursive: true });
fs.copyFileSync(
  path.join(root, 'examples/python/memory_client.py'),
  path.join(pyDest, 'memory_client.py')
);

// 5. Write start.sh
const startSh = `#!/usr/bin/env bash
# AI Memory Service 启动脚本
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

PORT="\${PORT:-8788}"
HOSTNAME="\${HOSTNAME:-127.0.0.1}"

echo "==> 启动 AI Memory Service"
echo "    地址: http://\$HOSTNAME:\$PORT"
echo "    数据: \${AI_MEMORY_HOME:-\$HOME/.ai-memory-service}"
echo "    停止: Ctrl+C"
echo ""

# 尝试自动打开浏览器（macOS/Linux/Windows Git Bash）
(sleep 1.5 && {
  if command -v open >/dev/null 2>&1; then open "http://\$HOSTNAME:\$PORT";
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "http://\$HOSTNAME:\$PORT";
  elif command -v start >/dev/null 2>&1; then start "http://\$HOSTNAME:\$PORT";
  fi
}) &

exec node server.js
`;

fs.writeFileSync(path.join(BUNDLE_DIR, 'start.sh'), startSh, { mode: 0o755 });

// 6. Write start.bat
const startBat = `@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo 错误：未检测到 node。请先安装 Node.js 20+：https://nodejs.org/
  pause
  exit /b 1
)

if not defined PORT set PORT=8788
if not defined HOSTNAME set HOSTNAME=127.0.0.1

echo ==^> 启动 AI Memory Service
echo     地址: http://%HOSTNAME%:%PORT%
echo     数据: %AI_MEMORY_HOME%
echo     停止: Ctrl+C
echo.

start "" "http://%HOSTNAME%:%PORT%"
node server.js
`;

fs.writeFileSync(path.join(BUNDLE_DIR, 'start.bat'), startBat);

// 7. Zip
console.log('==> Packaging zip');
const zipName = `${BUNDLE_NAME}.zip`;
run('zip', ['-qr', zipName, BUNDLE_NAME], { cwd: OUT_DIR });

// 8. Report
const zipPath = path.join(OUT_DIR, zipName);
const sizeMB = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(1);

console.log('');
console.log('======================================================================');
console.log('打包完成');
console.log('');
console.log(`  文件：${zipPath}`);
console.log(`  大小：${sizeMB} MB`);
console.log('');
console.log('分享给朋友：只需拷贝这个 zip 文件。');
console.log('朋友解压后：');
console.log(`  macOS/Linux:  cd ${BUNDLE_NAME} && ./start.sh`);
console.log('  Windows:      双击 start.bat');
console.log('需要 Node.js 20+：https://nodejs.org/');
console.log('======================================================================');
