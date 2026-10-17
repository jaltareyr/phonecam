# PhoneCam roadmap

## Current baseline (0.1.0)

- [x] Android browser camera capture
- [x] Local pairing server and WebRTC signaling
- [x] PC browser video preview
- [x] USB path through ADB reverse forwarding
- [x] Optional HTTPS listener for LAN use
- [x] Automated pairing and signaling check
- [ ] Test video with a physical Android phone (no device was connected during development)

## Next milestone: usable Windows webcam

- [ ] Windows receiver with connection state and video preview
- [ ] Media Foundation virtual camera source and registration
- [ ] Test visibility and capture in Windows Camera, OBS, and a meeting app
- [ ] Install/uninstall flow that leaves no orphaned camera device

## Later

- [ ] Microphone audio
- [ ] Camera switch, focus, zoom, and resolution controls
- [ ] Automatic reconnection and low-latency tuning
- [ ] Signed installer and update process

## Development rules

- Keep app code and protocol independent of iVCam binaries and assets.
- Record REA observations with the artifact hash and separate observation from inference.
- Commit each working slice with a test or a documented manual verification.
- Keep keys, generated certificates, dependencies, and analysis artifacts out of Git.
