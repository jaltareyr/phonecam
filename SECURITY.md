# Security policy

PhoneCam is currently an alpha intended for trusted local networks. The latest
alpha is the supported target for security fixes. There is no guaranteed support
or response time.

## Report a vulnerability privately

Use [GitHub private vulnerability reporting](https://github.com/jaltareyr/phonecam/security/advisories/new).
Include the affected version, reproduction steps, impact, and a minimal example
without personal camera/audio data, certificates, private keys, or access tokens.
Please give maintainers time to reproduce and address the issue before public
disclosure. Do not put exploitable security details in ordinary public issues.

## Deployment expectations

Do not expose PhoneCam through public port forwarding. The alpha uses a local
certificate authority to enable Android Chrome camera access. Trust only the
certificate from your own PC, protect its private key, and remove that Android
CA trust when it is no longer needed. See the
[security model](docs/SECURITY_MODEL.md) for boundaries and remaining limitations.
