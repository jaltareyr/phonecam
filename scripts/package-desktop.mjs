import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { packager } from '@electron/packager';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, 'release');
const packageInfo = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const foldersToSkip = ['.git', 'tools', 'certs', 'release', 'test', 'native'];
const ignore = foldersToSkip.map(folder => new RegExp(`^[/\\\\]${folder.replace('.', '\\.')}([/\\\\]|$)`));
ignore.push(/^[/\\\\]node_modules[/\\\\]@electron[/\\\\]packager([/\\\\]|$)/);
const outputs = await packager({
  dir: root,
  out,
  name: 'PhoneCam',
  platform: 'win32',
  arch: 'x64',
  appVersion: packageInfo.version,
  executableName: 'PhoneCam',
  overwrite: true,
  asar: true,
  prune: true,
  ignore
});
for (const output of outputs) {
  const source = path.join(root, 'native', 'virtual-camera', 'x64', 'Release');
  const destination = path.join(output, 'native');
  const binaries = ['PhoneCamMediaSource.dll', 'PhoneCamCameraManager.exe'];
  if (binaries.every(file => fs.existsSync(path.join(source, file)))) {
    fs.mkdirSync(destination, { recursive: true });
    for (const file of binaries) fs.copyFileSync(path.join(source, file), path.join(destination, file));
    fs.copyFileSync(path.join(root, 'native', 'virtual-camera', 'LICENSE.microsoft'), path.join(destination, 'LICENSE.microsoft'));
    console.log(`Included PhoneCam virtual camera binaries: ${destination}`);
  } else console.warn('Native camera binaries missing; run scripts/build-virtual-camera.ps1 before packaging.');
  console.log(`Packaged Windows app: ${output}`);
}
