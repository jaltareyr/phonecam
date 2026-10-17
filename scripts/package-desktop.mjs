import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packager } from '@electron/packager';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, 'release');
const foldersToSkip = ['.git', 'tools', 'certs', 'release', 'test'];
const ignore = foldersToSkip.map(folder => new RegExp(`^[/\\\\]${folder.replace('.', '\\.')}([/\\\\]|$)`));
ignore.push(/^[/\\\\]node_modules[/\\\\]@electron[/\\\\]packager([/\\\\]|$)/);
const outputs = await packager({
  dir: root,
  out,
  name: 'PhoneCam',
  platform: 'win32',
  arch: 'x64',
  appVersion: '0.1.0',
  executableName: 'PhoneCam',
  overwrite: true,
  asar: true,
  prune: true,
  ignore
});
for (const output of outputs) console.log(`Packaged Windows app: ${output}`);
