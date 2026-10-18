# PhoneCam roadmap

The full parity inventory and evidence are in [IVCAM_FEATURE_AUDIT.md](IVCAM_FEATURE_AUDIT.md). A built component is not counted as complete until its phone-to-Windows acceptance test passes.

## Current baseline (0.7.0 public alpha)

- [x] Android browser camera capture and WebRTC preview on a physical phone
- [x] Local pairing server, separate pairing rooms, and signaling test
- [x] USB ADB reverse-forwarding path with physical-phone video
- [x] Wi-Fi HTTPS listener and per-user certificate generation
- [x] Packaged desktop app, portable EXE, and administrator installer
- [x] Built native 720p/30 virtual camera source and live frame bridge
- [x] Basic front/rear switch, browser-dependent controls, mirror/rotate, effects, snapshots, recordings, and shortcuts
- [x] Desktop color adjustments, image overlay, recording discard, fullscreen, stay-on-top, PC zoom/tap focus signaling, and reconnect retry paths
- [x] Install and enumerate PhoneCam virtual camera on this PC; capture a frame through Media Foundation
- [x] Verify Wi-Fi camera capture with Android trust configured and live frames in Windows preview and Media Foundation
- [x] Build compact video-first Windows layout with bottom controls, connection/settings dialogs, options menu, feed window, and feed-only fullscreen
- [x] Correct the native virtual camera's default RGB mask so all three color channels pass to Windows camera consumers
- [x] Advertise LAN service with mDNS and provide a pairing QR code for Android Chrome
- [x] Prefer available H.264 WebRTC codecs, set resolution-aware bitrate ceilings, and display actual encoded/received stream statistics
- [x] Use direct video preview for unprocessed streams and retry stalled high-resolution encoding at 1080p
- [x] Show Windows GPU video decode capability status in camera settings
- [x] Desktop-only viewer credential, approval of new phones, bounded signaling, and isolated integration tests
- [x] Timer-driven frame export while hidden, complete-frame retention during writes, and signed RGB row handling
- [x] MIT license, contributor/security guides, issue forms, CI, and alpha release workflow
- [x] Synthetic desktop stream/hidden-window test and native frame snapshot regression tests
- [ ] Verify Windows Camera, Zoom, Teams, OBS, and browser selection
- [ ] Complete a stable 30-minute USB and Wi-Fi call with measured latency, dropped frames, and reconnect time

## Complete the core camera

- [ ] Automatic Wi-Fi/USB discovery, manual-IP fallback, connection history, and automatic reconnection
- [ ] Dynamic virtual camera sizes, frame rates, RGB/YUV output choices, and multiple independent camera devices
- [ ] Measured quality and encoder controls with hardware fallback
- [ ] Install/uninstall validation on another Windows 11 x64 machine
- [ ] Signed installer and update path

## Add sound and device controls

- [ ] Selectable Windows virtual microphone, synchronized with video
- [ ] Phone/PC recording source, output device choice, and echo/drift validation
- [ ] Native Android capture path for complete AE/AF/AWB, ISO, EV, lenses, screen-off, and background operation
- [ ] PC-side camera controls and persistent camera settings
- [ ] iOS phone support, including iOS USB

## Add processing and workflow features

- [ ] Person segmentation, background blur/bokeh/mosaic/green screen/transparency/custom image or video
- [ ] Effect strength, full color controls, LUT filters, image overlay, and face enhancement
- [ ] Time lapse, cancel recording, save folder/prefix, interrupted-file recovery
- [ ] Borderless mode, startup options, customizable hotkeys, GPU choice, hardware decode, bitrate and logs
- [ ] Battery-saving phone display behavior and network-quality indicator

## Development rules

- Keep code, protocol, assets, and branding independent of iVCam binaries and artwork.
- Record REA observations with the artifact hash and separate observations from inferences.
- Commit each working slice with a meaningful test or documented manual verification.
- Keep keys, generated certificates, dependencies, and bulk analysis artifacts out of Git.
