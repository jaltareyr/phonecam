# PhoneCam

An independent Android-to-Windows camera prototype. The Android phone captures video in its browser; WebRTC sends it directly to a PC viewer. The local Node server handles pairing and signaling. This first milestone does **not** yet register a Windows webcam device or carry microphone audio.

## Start

Use Node.js 22.19+ or 24.11+.

```powershell
npm install
npm start
```

On the PC, open `http://localhost:8080/viewer` and note the pairing code. The HTTP listener binds only to this PC's loopback interface.

### Android via USB

With Android USB debugging enabled and Android SDK platform-tools installed:

```powershell
adb devices
adb reverse tcp:8080 tcp:8080
```

On the phone, open `http://localhost:8080/phone` in Chrome. Enter the code, choose a camera, and allow access. Chrome treats `localhost` as a secure context for camera capture. The USB link uses ADB forwarding; video does not require iVCam's phone app.

### Android via Wi-Fi

Both devices must be on the same network. Create a local certificate with the PC's LAN IP:

```powershell
python -m pip install cryptography
python scripts/make_cert.py --ip 192.168.1.10
npm start
```

Use the actual address printed by `npm start` in place of the example IP. On the phone, open `https://PC-IP:8443/phone`, accept the development certificate, and pair. Some browsers may refuse camera access until the certificate is trusted by Android; USB is the reliable first path. Certificate files and keys stay in `certs/` and are ignored by Git.

## Architecture

`phone browser camera -> WebRTC video -> PC browser preview`

`server.js` creates short-lived pairing rooms and relays WebRTC signaling only. It does not relay video or store frames. A six-character room code keeps casual cross-connections apart; this is a local prototype, not an internet-facing authentication system.

## REA evidence

REA 6.5.0 inspected the installed `C:\Program Files\e2eSoft\iVCam\iVCam.exe`. Its SHA-256 is `dafee92aced49c8bdce4f334486170e59fcf03a52b00fcef57071ba4d15ea0f6`. REA classified it as a native x86-64 PE with no .NET CLI directory. The shipped iVCam installation also contains separate camera and microphone driver packages, video libraries, and ADB binaries. These observations guide component boundaries; PhoneCam uses its own implementation and protocol.

Native function analysis needs Ghidra 12.1.x and a compatible JDK. Those are not configured on this computer yet. REA is installed for this project under `tools/rea/`; use the Node 24 runtime and `tools/rea/node_modules/rea-agents/scripts/rea.mjs` to run its CLI.

## Next milestones

1. Validate Android camera streaming on the actual phone and measure latency.
2. Build a Windows receiver app and virtual camera using Microsoft's Media Foundation virtual camera API.
3. Add audio, camera controls, resilient reconnects, and packaging.
