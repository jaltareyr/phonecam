import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import crypto from 'node:crypto';
import { ensureCertificates } from '../certificates.js';

test('creates a private local CA and renews the server certificate for a changed address', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'phonecam-certs-'));
  try {
    const first = await ensureCertificates(directory, ['192.168.5.7']);
    const caBefore = fs.readFileSync(first.caPath, 'utf8');
    const leafBefore = fs.readFileSync(first.certPath, 'utf8');
    const certificate = new crypto.X509Certificate(leafBefore);
    assert.match(certificate.subjectAltName, /IP Address:192\.168\.5\.7/);
    assert.equal(fs.existsSync(path.join(directory, 'ca-key.pem')), true);

    const server = https.createServer({
      key: fs.readFileSync(first.keyPath), cert: fs.readFileSync(first.certPath)
    }, (_request, response) => response.end('ok'));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const response = await new Promise((resolve, reject) => {
        https.get(`https://127.0.0.1:${server.address().port}/`, { ca: caBefore }, incoming => {
          let body = '';
          incoming.on('data', chunk => { body += chunk; });
          incoming.on('end', () => resolve(body));
        }).on('error', reject);
      });
      assert.equal(response, 'ok');
    } finally { await new Promise(resolve => server.close(resolve)); }

    await ensureCertificates(directory, ['192.168.5.7']);
    assert.equal(fs.readFileSync(first.certPath, 'utf8'), leafBefore);
    await ensureCertificates(directory, ['192.168.5.8']);
    assert.equal(fs.readFileSync(first.caPath, 'utf8'), caBefore);
    assert.notEqual(fs.readFileSync(first.certPath, 'utf8'), leafBefore);
    const otherMachine = await ensureCertificates(path.join(directory, 'another-machine'), ['192.168.5.7']);
    assert.notEqual(fs.readFileSync(otherMachine.caPath, 'utf8'), caBefore);
  } finally {
    const tempRoot = fs.realpathSync(os.tmpdir());
    const target = fs.realpathSync(directory);
    assert.ok(target.startsWith(tempRoot + path.sep));
    fs.rmSync(target, { recursive: true, force: true });
  }
});
