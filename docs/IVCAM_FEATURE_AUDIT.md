# iVCam feature audit for PhoneCam

Audited 2026-10-17 against the installed iVCam 7.3.5 and PhoneCam 0.2.0; status updated for PhoneCam 0.3.0. The goal is functional coverage with PhoneCam's own code, protocol, assets, and branding. A feature is **complete** only after it works on a phone and, where relevant, in a Windows camera or microphone consumer.

## Evidence and limits

- REA 6.5.0 `inspect-artifact` inspected the installed `iVCam.exe`, `driver/amd64/iVCam.sys`, and `driver_mic/amd64/iVCamAud.sys`. REA `inspect-managed-artifact` classified `iVCam.exe` as native x86-64 PE with no CLI directory; `inspect-with-objdump file_headers` confirmed a PE x86-64 executable. The executable SHA-256 is `dafee92aced49c8bdce4f334486170e59fcf03a52b00fcef57071ba4d15ea0f6`.
- The installed `resource/strings.xml` (SHA-256 `4f456929b02c6165fffd1a08e969b67738ba95a35c80c52e637001803ca32f05`) contains 162 English UI keys. It names settings and actions; a UI string alone does not prove that a particular device supports the feature.
- The installation includes a camera driver, microphone driver, `adb.exe`, FFmpeg libraries, `DirectML.dll`, `onnxruntime.dll`, `MLProcessor.dll`, `resource/ivcam.onnx`, and 36 filter previews plus LUTs. Their presence supports component identification, not a claim about their internal algorithms. REA deep native analysis is unavailable because Ghidra 12.1.x is not configured on this PC.
- Official E2ESOFT references: [product](https://www.e2esoft.com/ivcam/), [phone app](https://www.e2esoft.com/ivcam-app-features/), [PC client](https://www.e2esoft.com/ivcam-pc-features/), [camera settings](https://www.e2esoft.com/ivcam-camera-settings/), [background removal](https://www.e2esoft.com/ivcam-background-removal/), [sound](https://www.e2esoft.com/ivcam-sound/). These describe released behavior and clarify what UI strings mean.

Status key: **partial** = some code exists but the full behavior or device validation is missing; **unverified** = implemented path lacks the required end-to-end test; **missing** = no functional implementation.

## Complete functional inventory

| Area | iVCam behavior to cover | PhoneCam 0.2.0 |
| --- | --- | --- |
| Android capture | Phone camera to PC over USB or Wi-Fi | **Partial:** browser capture and USB ADB forwarding work; Wi-Fi has HTTPS signaling but needs trusted certificate and physical test. |
| iOS capture | iPhone camera and microphone over Wi-Fi or USB | **Missing.** |
| Connection | Automatic LAN and USB discovery, manual IP, saved PC history, multi-instance target selection | **Missing:** manual URL and code work; no discovery, history, or instance selection. |
| Pairing and recovery | Clear status, reconnect, bad-network indicator, phone screen-off/background streaming | **Partial:** pairing code, status, and signaling retry; physical recovery unverified. Signal display and phone background mode missing. |
| Capture modes | 360p through 4K, configurable FPS/quality/encoder, actual-mode display | **Partial:** browser requests 480p–4K and 15–240 fps, displays granted mode; output virtual camera is fixed 720p/30. No bitrate/encoder control. |
| Virtual video | Selectable Windows camera, multiple output sizes, RGB/YUV choice, one-size-only mode | **Partial:** installer registered the camera and Media Foundation captured a 720p NV12 frame on this PC. A connected-phone feed and video-call use still need validation. Only 720p/30 output; no format or mode controls. |
| Virtual audio | Selectable Windows microphone, synchronized phone audio | **Missing:** phone audio reaches desktop playback, but there is no Windows microphone device. Synchronization unverified. |
| App compatibility | Zoom, Teams, OBS, browsers, Windows Camera | **Partial:** Windows enumerates and opens PhoneCam. Zoom is currently signed out; application-specific live tests remain. |
| Multiple phones | Independent sessions and virtual camera devices | **Partial:** multiple previews and pairing rooms; one output camera, no second-phone test. |
| Lenses | Front/rear, ultrawide/telephoto where exposed, smooth switching | **Partial:** front/rear switching and browser device enumeration; physical lens behavior unverified. |
| Focus and exposure | Tap focus, auto/manual/locked AE/AF/AWB, exposure time, ISO, EV, white balance | **Partial:** browser-dependent PC tap focus and focus/exposure lock; no full modes, ISO, white balance, or PC-side exposure sliders. |
| Other phone controls | Zoom, flash, mirror/flip, screen-off, beautify | **Partial:** phone and PC zoom/torch where browser exposes them, preview mirror/rotate; screen-off and beautify missing. |
| Video processing | Person segmentation, blur/bokeh/mosaic background, green screen, transparent/custom image or video background, strength | **Missing:** current blur and mosaic affect the whole frame. No person mask or background replacement. |
| Color and overlays | Saturation, vibrance, brightness, contrast, gamma, hue, highlights/shadows, tint, RGB gain, LUT filters, overlay image | **Partial:** brightness, contrast, saturation, hue, and image overlay; other color controls and LUT library missing. |
| Recording | Snapshot, video, time lapse, cancel/discard, folder and filename prefix, phone/PC mic choice, damaged-file repair | **Partial:** snapshot, video save, and discard; remaining controls and repair missing. |
| Desktop workflow | Preview, pause, fullscreen, borderless, stay-on-top, background/minimized streaming | **Partial:** preview, pause, fullscreen, and stay-on-top; borderless and background validation missing. |
| Productivity | Mouse-wheel/keyboard zoom, click-to-focus, customizable global hotkeys, startup, silent/fullscreen/debug launch, logs, preferred GPU/hardware decoder, output device | **Partial:** some fixed hotkeys; rest missing. |
| Product options | Multiple UI languages, update check, configurable device name | **Missing.** License tiers and purchase flow are a separate PhoneCam product decision. |

## Features the original 23-point brief missed

1. iOS phone support and iOS USB path.
2. Manual IP connection, previously connected PC history, automatic discovery, and instance targeting.
3. Phone display sleep/background streaming and network-quality indicator.
4. Selectable **Windows virtual microphone** and phone-vs-PC audio source choice for recordings.
5. Virtual camera output modes: multiple sizes, RGB/YUV selection, and one-size-only behavior.
6. PC mouse-wheel zoom, click-to-focus, and full PC-side AE/AF/AWB/ISO/EV/zoom controls.
7. Camera auto/manual/locked states with persisted values.
8. Full color corrections, LUT filters, image overlay, transparent background, and adjustable background-effect strength.
9. Cancel recording without saving, choose save folder and filename prefix, repair interrupted recordings, and audio handling for video backgrounds.
10. Stay-on-top, startup, silent/debug/fullscreen launch, hardware-decoder and preferred-GPU choice, diagnostic logs, and bitrate display.

## Build gates

1. **Verify live webcam use:** pair a phone, test live frames in Windows Camera and Zoom, then USB and Wi-Fi 30-minute calls.
2. **Finish connection and output:** discovery/reconnect, reliable Wi-Fi trust, dynamic virtual camera modes, independent devices for multiple phones.
3. **Add virtual microphone and synchronization:** Windows endpoint, audio device selection, drift and echo tests.
4. **Complete camera controls:** use a native Android app where browser camera APIs cannot deliver ISO, white balance, background capture, or robust lens switching; add iOS separately.
5. **Complete processing and desktop tools:** segmentation/background modes, color/LUT/overlay controls, recording utilities, window modes, GPU options, and logs.

This is a feature inventory, not a claim of parity. The installed Windows components cannot establish what an iOS or Android camera exposes on a particular phone; those capabilities require device tests.
