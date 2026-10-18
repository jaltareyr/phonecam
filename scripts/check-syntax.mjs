import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const files = ['server.js', 'certificates.js'];
function visit(directory) {
  for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const name = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(name);
    else if (/\.(?:cjs|mjs|js)$/.test(name)) files.push(name);
  }
}
for (const directory of ['public', 'desktop', 'scripts', 'test', 'support']) visit(directory);
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`Syntax checked ${files.length} JavaScript files.`);
