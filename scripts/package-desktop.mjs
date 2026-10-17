import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { packager } from '@electron/packager';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, 'release');
const foldersToSkip = ['.git', 'tools', 'certs', 'release', 'test', 'native'];
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
for (const output of outputs) {
  const certificateSource = path.join(root, 'certs');
  const certificateDestination = path.join(output, 'certs');
  if (fs.existsSync(path.join(certificateSource, 'server-key.pem')) && fs.existsSync(path.join(certificateSource, 'server-cert.pem'))) {
    fs.mkdirSync(certificateDestination, { recursive: true });
    for (const file of ['server-key.pem', 'server-cert.pem', 'phonecam-ca.crt']) {
      if (fs.existsSync(path.join(certificateSource, file))) fs.copyFileSync(path.join(certificateSource, file), path.join(certificateDestination, file));
    }
    console.log(`Included this PC's local Wi-Fi certificate: ${certificateDestination}`);
  }
  const source = path.join(root, 'native', 'virtual-camera', 'x64', 'Release');
  const destination = path.join(output, 'native');
  const binaries = ['PhoneCamMediaSource.dll', 'PhoneCamCameraManager.exe'];
  if (binaries.every(file => fs.existsSync(path.join(source, file)))) {
    fs.mkdirSync(destination, { recursive: true });
    for (const file of binaries) fs.copyFileSync(path.join(source, file), path.join(destination, file));
    console.log(`Included PhoneCam virtual camera binaries: ${destination}`);
  } else console.warn('Native camera binaries missing; run scripts/build-virtual-camera.ps1 before packaging.');
  console.log(`Packaged Windows app: ${output}`);
}
