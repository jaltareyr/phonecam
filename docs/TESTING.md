# Compatibility and release acceptance

This page distinguishes code checks from device verification. A passing CI run
does not establish that the virtual camera works in a particular call application.

## Automated checks

`npm run check` validates JavaScript syntax. `npm test` covers certificate
generation/renewal, frame-file metadata, codec/capture selection, approved pairing,
session isolation, reconnection, rejected origins/hosts, local viewer access,
credential checks, and resource limits. The Windows CI job compiles the C++ source
and runs native snapshot tests for write contention, stale/stop behavior, negative
RGB stride, buffer guards, color order, and timestamp wrap.

`npm run test:desktop` runs the real phone/viewer pages in Electron with a moving
synthetic canvas source and VP8 to avoid depending on a physical camera or a CI
runner's H.264 encoder. It verifies approval, decoded video, raw frame export while
the desktop is hidden for more than six seconds, rotation/mirroring, and stop.
It does not establish H.264 hardware behavior or physical Zoom/Meet compatibility.

## Physical results

| Test | Evidence / current state |
| --- | --- |
| Android Chrome → Windows preview over Wi-Fi | Worked on the development setup, reported by the owner |
| Android Chrome → Windows preview over ADB USB | Worked on the development setup |
| Native Windows registration/enumeration | Verified on the development PC |
| Media Foundation capture of live phone frame | Nonblack NV12 frames verified on the development PC |
| Version 0.7 desktop approval on a physical phone | Not yet verified; protocol covered by integration tests |
| Zoom / Google Meet live camera | Dark feed reported on earlier versions; fixes built, live retest pending |
| Windows Camera / Teams / OBS with current version | Current release acceptance pending |
| 30-minute Wi-Fi and USB calls | Not yet measured |
| Install/update/uninstall on another Windows 11 PC | Not yet verified |
| Phone mic and audio/video synchronization | Not yet verified; virtual mic is not implemented |
| iOS | Not supported as a verified client |

Historical internal research/feature notes may describe older versions. This
matrix and the README are the release-facing statement of support.

## Manual camera acceptance

For each device result, record Windows build, GPU, Android/model, Chrome version,
connection type, PhoneCam version, and consumer application version. Never attach
private recordings, pairing codes, certificates, or keys.

1. Install on a clean Windows 11 x64 machine. Verify enumeration and COM activation:

   ```powershell
   & "$env:ProgramFiles\PhoneCam\native\PhoneCamCameraManager.exe" list
   & "$env:ProgramFiles\PhoneCam\native\PhoneCamCameraManager.exe" check-com
   ```

2. Pair a phone over Wi-Fi; verify PC approval, front/rear selection, rotate/mirror,
   and that the Actual/Sending/Received stats agree with observed behavior.
3. Select PhoneCam in Windows Camera, Zoom, Teams, Meet, and OBS separately. Confirm
   live motion and normal colors. Record failures as failures, not unsupported assumptions.
4. Run 30 minutes at 720p/30 and then 1080p/30 capture over Wi-Fi and USB. Measure
   startup, end-to-end delay, dropped frames, reconnect delay, CPU/GPU, and memory.
5. Minimize PhoneCam, switch focus to the call app, and keep the stream running for
   more than five minutes. Confirm the feed remains live, including effects.
6. Interrupt Wi-Fi/USB briefly. Confirm useful errors and reconnection to the approved
   session. Stop capture and check the virtual camera stops showing old private frames.
7. Upgrade, restart camera consumers, and retest. Uninstall and confirm the camera
   registration is removed. Verify CA-removal instructions on the phone.

Submit the results using the **Device compatibility report** issue form. These
checks are required before making a production-readiness claim.
