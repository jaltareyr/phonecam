import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const packageInfo = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const nativeBuild = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
  path.join(root, 'scripts', 'build-virtual-camera.ps1')], { cwd: root, stdio: 'inherit' });
if (nativeBuild.status !== 0) process.exit(nativeBuild.status || 1);
await import('./package-desktop.mjs');

const candidates = [
  process.env.INNO_SETUP_COMPILER,
  path.join(process.env.LOCALAPPDATA || os.homedir(), 'Programs', 'Inno Setup 6', 'ISCC.exe'),
  path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Inno Setup 6', 'ISCC.exe'),
  path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Inno Setup 6', 'ISCC.exe')
].filter(Boolean);
const compiler = candidates.find(candidate => fs.existsSync(candidate));
if (!compiler) throw new Error('Inno Setup 6 compiler (ISCC.exe) is required to build the installer.');
const result = spawnSync(compiler, [`/DAppVersion=${packageInfo.version}`, path.join(root, 'installer', 'phonecam.iss')],
  { cwd: root, stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status || 1);
