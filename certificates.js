import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import 'reflect-metadata';
import * as x509 from '@peculiar/x509';

x509.cryptoProvider.set(crypto.webcrypto);

const algorithm = {
  name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256',
  publicExponent: new Uint8Array([1, 0, 1]), modulusLength: 2048
};

function localIPv4() {
  return [...new Set(Object.values(os.networkInterfaces()).flatMap(values => values || [])
    .filter(address => address.family === 'IPv4' && !address.internal &&
      !address.address.startsWith('169.254.') && !address.address.startsWith('172.29.'))
    .map(address => address.address))];
}

function privateKeyPem(key) {
  return crypto.createPrivateKey({ key, format: 'der', type: 'pkcs8' }).export({ type: 'pkcs8', format: 'pem' });
}

function savePrivate(file, value) {
  fs.writeFileSync(file, value, { mode: 0o600 });
}

function validCertificate(file, keyFile, issuer) {
  try {
    const cert = new crypto.X509Certificate(fs.readFileSync(file));
    const key = crypto.createPrivateKey(fs.readFileSync(keyFile));
    return Date.parse(cert.validTo) > Date.now() + 24 * 60 * 60 * 1000 &&
      cert.checkPrivateKey(key) && cert.verify(issuer || cert.publicKey) ? cert : null;
  } catch { return null; }
}

async function createAuthority(caPath, caKeyPath) {
  const keys = await crypto.webcrypto.subtle.generateKey(algorithm, true, ['sign', 'verify']);
  const now = Date.now();
  const cert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: crypto.randomBytes(16).toString('hex'),
    name: `CN=PhoneCam Local CA ${crypto.randomBytes(4).toString('hex')}`,
    notBefore: new Date(now - 60_000), notAfter: new Date(now + 365 * 86_400_000),
    signingAlgorithm: algorithm, keys,
    extensions: [
      new x509.BasicConstraintsExtension(true, 0, true),
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign, true),
      await x509.SubjectKeyIdentifierExtension.create(keys.publicKey)
    ]
  });
  const keyDer = await crypto.webcrypto.subtle.exportKey('pkcs8', keys.privateKey);
  savePrivate(caKeyPath, privateKeyPem(Buffer.from(keyDer)));
  fs.writeFileSync(caPath, cert.toString('pem'));
  return new crypto.X509Certificate(cert.toString('pem'));
}

async function createServerCertificate(certPath, keyPath, caPath, caKeyPath, addresses) {
  const ca = new x509.X509Certificate(fs.readFileSync(caPath, 'utf8'));
  const caKey = await crypto.webcrypto.subtle.importKey('pkcs8',
    crypto.createPrivateKey(fs.readFileSync(caKeyPath)).export({ type: 'pkcs8', format: 'der' }),
    algorithm, false, ['sign']);
  const keys = await crypto.webcrypto.subtle.generateKey(algorithm, true, ['sign', 'verify']);
  const now = Date.now();
  const cert = await x509.X509CertificateGenerator.create({
    serialNumber: crypto.randomBytes(16).toString('hex'),
    subject: 'CN=PhoneCam Local Server', issuer: ca.subject,
    notBefore: new Date(now - 60_000), notAfter: new Date(now + 30 * 86_400_000),
    signingAlgorithm: algorithm, publicKey: keys.publicKey, signingKey: caKey,
    extensions: [
      new x509.BasicConstraintsExtension(false, undefined, true),
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature | x509.KeyUsageFlags.keyEncipherment, true),
      new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage.serverAuth]),
      new x509.SubjectAlternativeNameExtension([
        { type: 'dns', value: 'localhost' },
        ...addresses.map(address => ({ type: 'ip', value: address }))
      ])
    ]
  });
  const keyDer = await crypto.webcrypto.subtle.exportKey('pkcs8', keys.privateKey);
  savePrivate(keyPath, privateKeyPem(Buffer.from(keyDer)));
  fs.writeFileSync(certPath, cert.toString('pem'));
}

export async function ensureCertificates(directory, addresses = localIPv4()) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const caPath = path.join(directory, 'phonecam-ca.crt');
  const caKeyPath = path.join(directory, 'ca-key.pem');
  const certPath = path.join(directory, 'server-cert.pem');
  const keyPath = path.join(directory, 'server-key.pem');
  let authority = validCertificate(caPath, caKeyPath);
  if (!authority?.ca) authority = await createAuthority(caPath, caKeyPath);
  const expected = ['127.0.0.1', ...addresses];
  const server = validCertificate(certPath, keyPath, authority.publicKey);
  if (!server || expected.some(address => !server.subjectAltName?.includes(`IP Address:${address}`))) {
    await createServerCertificate(certPath, keyPath, caPath, caKeyPath, expected);
  }
  return { caPath, certPath, keyPath, addresses };
}

export { localIPv4 };
