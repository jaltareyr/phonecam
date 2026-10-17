# PhoneCam product specification

Goal: turn an Android phone into a selectable Windows webcam with a simple camera-first desktop client. This specification follows the feature list supplied by the project owner on 2026-10-17. PhoneCam has its own name, artwork, and code.

The owner subsequently requested all iVCam capabilities, including features outside the original 23-point brief. The [complete feature audit](IVCAM_FEATURE_AUDIT.md) is now the scope inventory; this document retains the original build order and acceptance criteria.

## First release: priorities 1–9

1. Android camera capture and a Windows client that registers a selectable virtual camera.
2. Stable low-delay 720p and 1080p video at 30 fps.
3. Same-network Wi-Fi discovery, pairing authorization, connection state, and reconnection.
4. Reliable USB streaming.
5. Verify the virtual camera in Zoom, Teams, Google Meet, OBS, and browser camera selectors.
6. Desktop live preview, connect/disconnect, pause/resume, recording, and snapshots.
7. Front/rear camera switching without requiring a new pairing code.
8. Resolution, frame rate, and compression quality controls; display actual negotiated values.
9. Portrait and landscape orientation, rotation, and mirroring.

Acceptance: pair the phone, select PhoneCam in a video-call app, and complete a stable 30-minute call at 720p or 1080p/30 fps over both USB and Wi-Fi. Measure startup time, latency, dropped frames, and reconnect time. Show a camera-use indicator on the phone and desktop.

## Subsequent capabilities: priorities 10–23

10. Phone microphone capture and a selectable synchronized Windows microphone.
11. Autofocus, tap focus, zoom, and PC control where the Android camera API permits.
12. Automatic/manual exposure, ISO, exposure compensation, white balance, and color controls where supported.
13. Save videos and still images to the PC.
14. Desktop background streaming and mobile background operation where Android permits.
15. Ultrawide, telephoto, and other phone lenses where exposed.
16. Rear flashlight control.
17. Hardware video encoding/decoding with exposed encoder settings and fallback.
18. Background blur, replacement, bokeh, mosaic, and green screen.
19. Multiple phones with independent virtual camera devices.
20. 2K and 4K modes subject to device and link capability.
21. Optional adjustable face enhancement.
22. Keyboard shortcuts, global hotkeys, fullscreen preview, and borderless mode.
23. Time lapse, command-line launch options, preferred GPU selection, and diagnostic logs.

## Engineering requirements

- Pairing must require explicit authorization and show clear camera/microphone indicators.
- Interrupted sessions should reconnect automatically with useful errors when they cannot.
- Detect unsupported camera controls and hide or disable them.
- Respect actual capture and output values; a requested mode is not a promise that the phone delivered it.
- Do not store audio, video, or pairing codes unless the user explicitly starts a recording.
- Keep independent tests for signaling, native camera enumeration, and the acceptance call.

## Current implementation

The browser-to-Windows WebRTC preview, USB forwarding, pairing codes, optional phone audio, multi-camera previews, basic camera controls, effects, captures, and shortcuts are implemented. A physical Android phone has displayed video on this PC. Wi-Fi and audio have not yet been validated on the phone. A native 720p virtual camera media source and live frame file bridge build, but camera registration still requires administrator approval and validation in an app. The selectable Windows microphone, discovery, automatic reconnect, and AI effects are in development. See the README for exact feature status.
