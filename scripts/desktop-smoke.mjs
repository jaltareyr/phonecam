import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import electron from 'electron';
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, [fileURLToPath(new URL('../support/electron-smoke.cjs', import.meta.url))], {
  env, stdio: 'inherit', windowsHide: true
});
child.on('error', error => { console.error(error.message); process.exit(1); });
child.on('exit', (code, signal) => process.exit(signal ? 1 : code ?? 1));
