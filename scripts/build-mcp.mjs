#!/usr/bin/env node
// Compile the MCP server into a self-contained node bundle at dist/mcp/.
// Post-processes require("@/x") into relative paths so plain `node` can run it.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);

fs.rmSync(path.join(root, 'dist/mcp'), { recursive: true, force: true });
const tsc = spawnSync('npx', ['--no-install', 'tsc', '-p', 'tsconfig.mcp.json'], { stdio: 'inherit' });
if (tsc.status !== 0) process.exit(tsc.status ?? 1);

const outRoot = path.join(root, 'dist/mcp');

// Walk all .js files under dist/mcp and rewrite `@/x` requires.
function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const s = fs.statSync(p);
    if (s.isDirectory()) walk(p);
    else if (name.endsWith('.js')) rewrite(p);
  }
}

function rewrite(file) {
  const src = fs.readFileSync(file, 'utf8');
  // Every source file lives under dist/mcp/<subdir>/... — the aliased root
  // "@/foo" corresponds to src/foo → dist/mcp/foo. Compute relative from
  // this file's directory back to dist/mcp.
  const rel = path.relative(path.dirname(file), outRoot) || '.';
  const prefix = rel === '.' ? './' : `${rel}/`;
  const patched = src.replace(/require\(["']@\/([^"']+)["']\)/g, (_m, spec) => `require("${prefix}${spec}")`);
  if (patched !== src) fs.writeFileSync(file, patched);
}

walk(outRoot);

// Move mcp/memory-server.js to dist/mcp/memory-server.js for a shorter path
const nested = path.join(outRoot, 'mcp/memory-server.js');
const flat = path.join(outRoot, 'memory-server.js');
if (fs.existsSync(nested) && !fs.existsSync(flat)) {
  // Adjust its @-relative rewrites: since we're moving from dist/mcp/mcp/*.js
  // to dist/mcp/*.js, requires previously written like "../memory/x" need to
  // become "./memory/x". Do a targeted rewrite.
  const src = fs.readFileSync(nested, 'utf8');
  const patched = src.replace(/require\(["']\.\.\/([^"']+)["']\)/g, (_m, spec) => `require("./${spec}")`);
  fs.writeFileSync(flat, patched);
  fs.rmSync(path.join(outRoot, 'mcp'), { recursive: true, force: true });
  fs.chmodSync(flat, 0o755);
}

console.log(`\nMCP server built: ${flat}`);
console.log(`Register in your MCP client config as:`);
console.log(`  "command": "node", "args": ["${flat}"]`);
