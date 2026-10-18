# Development and builds

## JavaScript and browser preview

Use Node.js 22.12 or newer (Node 24 LTS recommended), Git, and npm. Clone the
repository, run `npm ci`, then `npm start`. Open `http://localhost:8080/viewer`
on the PC. `npm run desktop` opens Electron. The native virtual camera targets
Windows 11 x64; source browser preview is not itself a webcam device.

```sh
npm run check
npm test
npm run test:desktop
npm audit
```

Tests generate disposable private CAs and bind ephemeral ports. They wait for
both listeners to announce readiness. They do not use the developer's certificate
directory or publish a discovery service. The automated suite uses simulated
signaling, not personal camera/audio input.

The `global-agent` override keeps the build downloader's proxy helper on version
4, which removes the deprecated logging chain containing the vulnerable
`sprintf-js` dependency. Check both full and production audits when updating build
tools; do not remove the override without checking the resulting dependency tree.

## Windows release prerequisites

Install Visual Studio 2022 C++ Build Tools or Visual Studio with **Desktop
development with C++**, an installed Windows 11 SDK, and Inno Setup 6.
The native build locates MSBuild with `vswhere`; set `PHONECAM_MSBUILD` to an
absolute MSBuild path if needed. NuGet restores the pinned native packages.
If NuGet is not already bundled in `tools/`, the build downloads it from nuget.org.

```powershell
npm ci
npm run installer:win
npm run portable:win
```

Run the commands sequentially: the portable builder wraps the packaged folder
created by the installer build. Output paths:

- `release/PhoneCam-win32-x64/`: full Electron directory; keep its files together.
- `release/installer/PhoneCam-Setup-<version>-x64.exe`: app and camera installer.
- `release/portable/PhoneCam-Portable-<version>-x64.exe`: preview app; no camera registration.

The Windows camera DLL is based on Microsoft's MIT-licensed sample. Preserve
the [third-party notices](../THIRD_PARTY_NOTICES.md). REA, Ghidra, and proprietary
iVCam files are not needed to build or run PhoneCam.

## Architecture and source map

- `server.js`: local HTTPS/HTTP listeners, rooms, desktop credentials, approval,
  bounded signaling, heartbeat, and certificate refresh.
- `certificates.js`: a per-installation CA and address-specific server certificates.
- `public/phone.*`: Android camera capture, preview, controls, and WebRTC sending.
- `public/viewer.*`: desktop receiver, effects, recording, and frame export.
- `desktop/`: isolated Electron preload and the local RGBA frame-file writer.
- `native/virtual-camera/`: C++ Media Foundation source and camera manager.
- `test/`, `support/`: tests and disposable test fixtures.

The Windows frame bridge writes a 16-byte header followed by 1280×720 RGBA
pixels to `%ProgramData%\PhoneCam\frame.bin`. The native source reads it and
outputs NV12 or RGB32. This local unencrypted shared file is a compatibility
boundary, not a protection against other users/software on the PC.

## Local configuration

| Environment variable | Default | Purpose |
| --- | --- | --- |
| `PHONECAM_HTTP_PORT` | `8080` | Loopback viewer and USB phone listener |
| `PHONECAM_HTTPS_PORT` | `8443` | LAN phone listener |
| `PHONECAM_CERT_DIR` | checkout `certs/` | Generated CA, private key, and server cert |
| `PHONECAM_MDNS` | enabled | Set `0` for isolated tests or when discovery cannot be used |
| `PHONECAM_MSBUILD` | `vswhere` discovery | Override native MSBuild executable |

The Electron client currently expects port 8080. Custom ports are intended
for source browser development and automated testing.

## Releases and signing

The release workflow builds on a Windows runner after a `v*` tag is pushed or
through manual dispatch. It runs tests and native compilation, builds both EXEs,
and publishes a GitHub **prerelease** with SHA-256 checksums. The package version
must match the version being released; an alpha tag may include `-alpha.N`.

No commercial code-signing key is included. Current alpha binaries are unsigned.
Checksums verify download integrity against the published manifest; they do not
replace publisher signing. Production release requires an appropriate signing
identity, protected signing credentials, and physical acceptance results. Do not
put a certificate/private key into Git or use secrets in untrusted pull-request jobs.
