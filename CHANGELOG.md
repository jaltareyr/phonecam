# Changelog

## 0.7.0 — public alpha

- Require PC approval before a new phone can relay camera signaling.
- Restrict desktop pages, room creation, and viewer credentials to loopback HTTP.
- Authenticate the viewer with a separate random credential and support approved
  phone reconnection with an in-memory credential.
- Reject cross-site requests and unexpected hosts; bound rooms, connections,
  pairing attempts, and signaling traffic; expire unused sessions and heartbeat sockets.
- Fix signed row offsets for bottom-up RGB surfaces and always unlock native
  buffers when frame generation fails.
- Export frames on a timer independently of window painting; retain the last
  complete native frame during concurrent writes instead of emitting black flashes.
- Add synthetic desktop streaming/hidden-window and native frame-contention tests.
- Isolate integration-test certificates and ports; wait for explicit server readiness.
- Add open-source licensing, community guides, issue forms, CI, and release automation.

The phone/Windows feature set remains an alpha. Physical call-app verification,
long-call testing, and a second-machine installation test are still required.

## 0.6.0

- Add a full-screen phone preview with settings and live-control drawers.
- Remember phone resolution, frame-rate, and microphone preferences.
- Disable desktop background rendering throttling and begin handling negative RGB stride.

## Earlier development

Versions 0.2–0.5 added the Electron desktop window, Windows camera registration,
portable/installer packages, Wi-Fi QR pairing, controls, effects, and capture diagnostics.
