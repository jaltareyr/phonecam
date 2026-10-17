# PhoneCam

An independent Android-to-Windows camera app in development. The Android phone captures video and optional microphone audio in its browser; WebRTC sends it directly to a Windows desktop app. The local server handles pairing and signaling. The current build does **not** yet register a Windows webcam device.

## Start

The local server runs with Node.js 20+. Desktop development and packaging require Node.js 22.12+; this computer uses the available Node 24 runtime. The packaged Windows app includes its own runtime. REA's separate CLI requires Node.js 22.19+ or 24.11+.

```powershell
npm install
npm start
```

On the PC, open `http://localhost:8080/viewer` and note the pairing code. Add camera creates a separate code for each phone. The HTTP listener binds only to this PC's loopback interface.

## Windows desktop app

Run [PhoneCam.exe](release/PhoneCam-win32-x64/PhoneCam.exe) from its release folder. It opens a native Windows window and starts the local server if needed. Keep the release folder intact; the executable uses files beside it. To rebuild from source with Node 22.12+ on `PATH`:

```powershell
npm ci
npm run package:win
```

On this computer, Node 24 is available at `C:\Users\Yashodhan Jaltare\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe`. The source development command is `npm run desktop` when that runtime is on `PATH`.

### Android via USB

With Android USB debugging enabled and Android SDK platform-tools installed:

```powershell
adb devices
adb reverse tcp:8080 tcp:8080
```

On the phone, open `http://localhost:8080/phone` in Chrome. Enter the code, choose a camera, and allow access. Chrome treats `localhost` as a secure context for camera capture. The USB link uses ADB forwarding; video does not require iVCam's phone app.

Choose the requested resolution and frame rate before pressing **Start camera**. The phone page shows the actual settings granted by Android and Chrome. Zoom, focus, exposure, and flashlight controls appear only when the browser exposes them for that camera. **Switch camera** in the Windows app changes front/rear camera in the existing connection where Android supports both; use the phone's camera selector and **Start camera** to choose a specific lens or change quality. Enable **Send phone microphone** to include audio, then press **Unmute** in the Windows app to hear it.

### Android via Wi-Fi

Both devices must be on the same network. Create a local certificate with the PC's LAN IP:

```powershell
python -m pip install cryptography
python scripts/make_cert.py --ip 192.168.1.10
npm start
```

Use the actual address printed by `npm start` in place of the example IP. On the phone, open `https://PC-IP:8443/phone`, accept the development certificate, and pair. Some browsers may refuse camera access until the certificate is trusted by Android; USB is the reliable first path. Certificate files and keys stay in `certs/` and are ignored by Git.

## Architecture

`phone browser camera and optional microphone -> WebRTC -> Windows app preview`

`server.js` creates short-lived pairing rooms and relays WebRTC signaling only. It does not relay video or store frames. A six-character room code keeps casual cross-connections apart; this is a local prototype, not an internet-facing authentication system.

## REA evidence

REA 6.5.0 inspected the installed `C:\Program Files\e2eSoft\iVCam\iVCam.exe`. Its SHA-256 is `dafee92aced49c8bdce4f334486170e59fcf03a52b00fcef57071ba4d15ea0f6`. REA classified it as a native x86-64 PE with no .NET CLI directory. The shipped iVCam installation also contains separate camera and microphone driver packages, video libraries, and ADB binaries. These observations guide component boundaries; PhoneCam uses its own implementation and protocol.

Native function analysis needs Ghidra 12.1.x and a compatible JDK. Those are not configured on this computer yet. REA is installed for this project under `tools/rea/`; use the Node 24 runtime and `tools/rea/node_modules/rea-agents/scripts/rea.mjs` to run its CLI.

## Feature status

| Feature | Current state |
| --- | --- |
| Android video over USB | Working on a connected Android phone with ADB reverse forwarding. |
| Wi-Fi video | HTTPS signaling and WebRTC path implemented; requires a certificate trusted by Android and has not yet been tested on this phone. |
| Resolution and frame rate | Requests 480p through 4K and 15 through 240 fps. Actual values depend on camera, browser, USB or Wi-Fi bandwidth, and WebRTC encoding. The phone shows the granted settings. |
| Camera controls | Front/rear switching from the PC; lens selection and conditional zoom, focus, tap focus, exposure, and flashlight controls on the phone. Browser support varies by phone. |
| Phone microphone | Optional WebRTC audio track and Windows playback; device validation pending. |
| Multi-camera | Separate simultaneous pairing rooms and Windows previews; second physical phone validation pending. |
| Effects and orientation | Mirror, 90° rotation, monochrome, warm color, soft focus, and mosaic preview. Snapshots and processed recordings include them. AI person segmentation, background replacement, and face retouching are pending. |
| Capture | PNG snapshots and WebM/MP4 recording through the browser's MediaRecorder. Unprocessed recording keeps the incoming stream's frame rate; processed recording is captured at 30 fps. |
| Windows controls | Window, selected-camera shortcuts Ctrl+S/R/P/N, and global shortcuts Ctrl+Alt+S/R/P/N. |
| Virtual webcam and microphone devices | Pending. The Windows Media Foundation API is available on this PC, but PhoneCam does not yet appear as a camera in Zoom, Teams, OBS, or Windows Camera. |

## Next milestones

1. Build a PhoneCam Media Foundation virtual camera source and bridge the received frames to it.
2. Add AI background segmentation and replacement.
3. Validate phone audio, multiple physical phones, Wi-Fi pairing, and higher resolutions on devices that support them.
4. Add virtual microphone support, reconnect handling, and an installer.
