import { fork } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

export async function startTestServer(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'phonecam-server-'));
  const child = fork(fileURLToPath(new URL('../server.js', import.meta.url)), [], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PHONECAM_HTTP_PORT: '0', PHONECAM_HTTPS_PORT: '0',
      PHONECAM_CERT_DIR: directory, PHONECAM_MDNS: '0' }, silent: true
  });
  let output = '';
  for (const pipe of [child.stdout, child.stderr]) pipe.on('data', data => { output = (output + data).slice(-8000); });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      await new Promise(resolve => {
        const timer = setTimeout(() => { child.kill(); }, 3000);
        child.once('exit', () => { clearTimeout(timer); resolve(); });
        if (child.connected) child.send({ type: 'shutdown' }); else child.kill();
      });
    }
    const parent = fs.realpathSync(os.tmpdir()) + path.sep;
    const target = fs.realpathSync(directory);
    if (!target.startsWith(parent)) throw new Error('Unsafe test cleanup path');
    fs.rmSync(target, { recursive: true, force: true });
  });
  const ready = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Server startup timed out. ${output}`)), 20_000);
    const exited = code => { clearTimeout(timer); reject(new Error(`Server exited (${code}). ${output}`)); };
    child.once('exit', exited);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.on('message', message => {
      if (message?.type !== 'ready') return;
      clearTimeout(timer); child.off('exit', exited); resolve(message);
    });
  });
  const ca = fs.readFileSync(path.join(directory, 'phonecam-ca.crt'));
  return {
    base: `http://127.0.0.1:${ready.httpPort}`,
    ws: `ws://127.0.0.1:${ready.httpPort}/signal`,
    wss: `wss://127.0.0.1:${ready.httpsPort}/signal`, ca,
    tls(route, options = {}) {
      return new Promise((resolve, reject) => {
        const request = https.request(`https://127.0.0.1:${ready.httpsPort}${route}`, { ca, ...options }, response => {
          let body = '';
          response.on('data', data => { body += data; });
          response.on('end', () => resolve({ status: response.statusCode, body, headers: response.headers }));
        });
        request.on('error', reject); request.end();
      });
    }
  };
}
