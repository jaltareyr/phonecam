import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const app = path.join(root, 'release', 'PhoneCam-win32-x64');
if (!fs.existsSync(path.join(app, 'PhoneCam.exe'))) {
  throw new Error('Packaged app missing. Run npm run package:win first.');
}

const cli = path.join(root, 'node_modules', 'electron-builder', 'cli.js');
const config = path.join(root, 'installer', 'portable-builder.yml');
const result = spawnSync(process.execPath, [cli, '--prepackaged', app, '--win', 'portable',
  '--config', config, `--config.extraMetadata.version=${version}`], { cwd: root, stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status || 1);
